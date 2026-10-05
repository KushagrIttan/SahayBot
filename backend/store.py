"""Page-aware local retrieval with transactional, file-scoped replacement."""
import hashlib
import json
import os
import re
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
import numpy as np
from pypdf import PdfReader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.getenv('SAHAYBOT_DATA_DIR', str(ROOT / 'data')))
DB_PATH = Path(os.getenv('SAHAYBOT_DB_PATH', str(ROOT / 'backend' / 'knowledge.sqlite3')))
MODEL_NAME = os.getenv('EMBEDDING_MODEL', 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')
LOCK = threading.RLock()
_model = None
STOP = set('the a an of to in and is are what how can for on my do does under me please explain which with i about'.split())

@contextmanager
def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    db.executescript('''CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, path TEXT NOT NULL,
      sha256 TEXT NOT NULL, pages INTEGER NOT NULL, size INTEGER NOT NULL,
      publisher TEXT NOT NULL, topic TEXT NOT NULL, url TEXT NOT NULL, note TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY, doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      page INTEGER NOT NULL, text TEXT NOT NULL, vector BLOB NOT NULL);
      CREATE INDEX IF NOT EXISTS chunks_doc ON chunks(doc_id);''')
    try:
        with db:
            yield db
    finally:
        db.close()

def model():
    global _model
    with LOCK:
        if _model is None:
            _model = SentenceTransformer(MODEL_NAME)
        return _model

def encode(texts):
    with LOCK:
        return model().encode(texts, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False).astype(np.float32)

def parse_pdf(path):
    reader = PdfReader(str(path))
    if reader.is_encrypted and not reader.decrypt(''):
        raise ValueError('Password-protected PDFs are not supported. Upload an unlocked copy.')
    if len(reader.pages) > 400:
        raise ValueError('Please upload a PDF with at most 400 pages.')
    splitter = RecursiveCharacterTextSplitter(chunk_size=1100, chunk_overlap=160)
    chunks = []
    for page, item in enumerate(reader.pages, 1):
        text = (item.extract_text() or '').replace('\x00', '').strip()
        for part in splitter.split_text(text):
            if len(part.strip()) >= 30:
                chunks.append((page, part))
    if not chunks:
        raise ValueError('This PDF has no readable text. Scanned documents need OCR before uploading.')
    return len(reader.pages), chunks

def index_pdf(path, metadata=None, name=None, destination=None):
    path = Path(path)
    name = name or path.name
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    doc_id = hashlib.sha256(name.encode()).hexdigest()[:20]
    with LOCK:
        with connect() as db:
            previous = db.execute('SELECT sha256,path FROM documents WHERE id=?', (doc_id,)).fetchone()
            if previous and previous['sha256'] == digest and Path(previous['path']).exists():
                return {'id': doc_id, 'name': name, 'unchanged': True}
        pages, parts = parse_pdf(path)
        vectors = encode([text for _, text in parts])
        meta = metadata or {}
        final_path = Path(destination or path).resolve()
        # Complete parsing/embedding before touching the existing file or database.
        backup = final_path.read_bytes() if destination and final_path.exists() else None
        if destination:
            final_path.parent.mkdir(parents=True, exist_ok=True)
            os.replace(path, final_path)
        try:
            with connect() as db:
                db.execute('DELETE FROM documents WHERE id=?', (doc_id,))
                db.execute('INSERT INTO documents VALUES (?,?,?,?,?,?,?,?,?,?)',
                    (doc_id, name, str(final_path), digest, pages, final_path.stat().st_size,
                     meta.get('publisher', 'User upload'), meta.get('topic', 'Uploaded document'),
                     meta.get('url', ''), meta.get('note', 'Check the issuer, date and applicable jurisdiction.')))
                db.executemany('INSERT INTO chunks VALUES (?,?,?,?,?)',
                    [(f'{doc_id}:{digest[:12]}:{i}', doc_id, page, text, vector.tobytes())
                     for i, ((page, text), vector) in enumerate(zip(parts, vectors))])
        except Exception:
            if destination:
                if backup is not None: final_path.write_bytes(backup)
                else: final_path.unlink(missing_ok=True)
            raise
    return {'id': doc_id, 'name': name, 'pages': pages, 'chunks': len(parts), 'unchanged': False}

def inventory():
    with LOCK, connect() as db:
        rows = db.execute('SELECT d.*, count(c.id) AS chunks FROM documents d LEFT JOIN chunks c ON d.id=c.doc_id GROUP BY d.id ORDER BY d.publisher,d.name').fetchall()
    return [{'id': r['id'], 'name': r['name'], 'pages': r['pages'], 'size': r['size'],
             'publisher': r['publisher'], 'category': r['topic'], 'sourceUrl': r['url'],
             'note': r['note'], 'chunks': r['chunks'], 'status': 'ready'} for r in rows]

def document_path(doc_id):
    with LOCK, connect() as db:
        row = db.execute('SELECT path FROM documents WHERE id=?', (doc_id,)).fetchone()
    return Path(row['path']) if row else None

def delete_document(doc_id):
    with LOCK:
        path = document_path(doc_id)
        if not path: return False
        with connect() as db: db.execute('DELETE FROM documents WHERE id=?', (doc_id,))
        path.unlink(missing_ok=True)
        return True

def index_sources():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path = DATA_DIR / 'sources.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else []
    lookup = {item['filename']: item for item in manifest}
    paths = [p for folder in [DATA_DIR/'official',DATA_DIR/'uploads'] if folder.exists() for p in sorted(folder.iterdir()) if p.is_file() and p.suffix.lower()=='.pdf']
    results = []
    for path in paths:
        results.append(index_pdf(path, lookup.get(path.name)))
    # Remove stale indexed rows when their files have been removed.
    with LOCK, connect() as db:
        for row in db.execute('SELECT id,path FROM documents').fetchall():
            if not Path(row['path']).exists(): db.execute('DELETE FROM documents WHERE id=?', (row['id'],))
    return results

def tokens(text):
    return {w for w in re.findall(r'[\w\u0900-\u097f]+', text.lower()) if len(w) > 2 and w not in STOP}

def retrieve(question, doc_id=None, limit=5):
    with LOCK:
        return _retrieve(question, doc_id, limit)

def _retrieve(question, doc_id=None, limit=5):
    with LOCK, connect() as db:
        sql = 'SELECT c.*, d.name,d.publisher,d.url,d.note FROM chunks c JOIN documents d ON c.doc_id=d.id'
        rows = db.execute(sql + (' WHERE c.doc_id=?' if doc_id else ''), (doc_id,) if doc_id else ()).fetchall()
    if not rows: return []
    query_vector = encode([question])[0]
    vectors = np.stack([np.frombuffer(row['vector'], dtype=np.float32) for row in rows])
    similarity = vectors @ query_vector
    words = tokens(question)
    # Lexical relevance complements multilingual dense retrieval. No answer templates.
    document_tokens = [tokens(row['text']) for row in rows]
    frequency = {word: sum(word in terms for terms in document_tokens) for word in words}
    weights = {word: np.log(1 + (len(rows) - count + 0.5) / (count + 0.5)) for word,count in frequency.items()}
    weight_sum = sum(weights.values()) or 1
    ranked = []
    q = question.lower()
    for row, cosine, terms in zip(rows, similarity, document_tokens):
        lexical = sum(weights[word] for word in words & terms) / weight_sum
        title_boost = 0.0
        if 'pmfby' in q and 'PMFBY' in row['name']: title_boost = 0.10
        if ('bye-law' in q or 'byelaw' in q or 'by-law' in q) and 'Model_Byelaws' in row['name']: title_boost = 0.14
        # Prefer an actual section heading over incidental mentions of its topic.
        heading = row['text'][:250].lower()
        heading_boost = 0.08 if any(word in heading for word in words if len(word) > 6) else 0
        if 'membership' in q and 'eligibility' in row['text'].lower(): heading_boost += 0.14
        if 'premium' in q and 'rate' in q and re.search(r'premium rates|premium rate payable', row['text'], re.I): heading_boost += 0.25
        score = 0.65 * float(cosine) + 0.35 * lexical + title_boost + heading_boost
        ranked.append((score, float(cosine), row))
    ranked.sort(key=lambda x: x[0], reverse=True)
    selected, seen, readers = [], set(), {}
    for score, cosine, row in ranked:
        page_key = (row['doc_id'], row['page'])
        if page_key in seen: continue
        if cosine < 0.27 and score < 0.38: continue
        seen.add(page_key)
        # Include the whole page so table headings and eligibility conditions do not
        # get separated from their values by a chunk boundary.
        path = document_path(row['doc_id'])
        if row['doc_id'] not in readers: readers[row['doc_id']] = PdfReader(str(path))
        snippet = (readers[row['doc_id']].pages[row['page']-1].extract_text(extraction_mode='layout') or row['text']).strip()[:6000]
        selected.append({'docId': row['doc_id'], 'docName': row['name'], 'page': row['page'],
          'snippet': snippet, 'similarity': round(cosine, 3), 'publisher': row['publisher'],
          'sourceUrl': row['url'], 'note': row['note']})
        if len(selected) == limit: break
    return selected

def relevant_table(sources, question):
    """Preserve PDF table rows/columns instead of asking a small LLM to guess them."""
    import pdfplumber
    if not re.search(r'premium.*rate|rate.*premium|प्रीमियम', question, re.I):
        return None
    for source in sources:
        path = document_path(source['docId'])
        with pdfplumber.open(path) as pdf:
            page_index = source['page'] - 1
            page = pdf.pages[page_index]
            for table in page.find_tables():
                rows = table.extract()
                if len(rows) < 2: continue
                headers = [' '.join((cell or '').split()) for cell in rows[0]]
                if not any('premium' in cell.lower() and 'rate' in cell.lower() for cell in headers): continue
                body = [[' '.join((cell or '').split()) for cell in row] for row in rows[1:]]
                pages = [source['page']]
                # A bottom-of-page table can continue in the next page with a
                # missing leading merged column. Join cell text, not numerical facts.
                if body and table.bbox[3] > page.height * 0.8 and page_index+1 < len(pdf.pages):
                    continuations = pdf.pages[page_index+1].find_tables()
                    if continuations and continuations[0].bbox[1] < pdf.pages[page_index+1].height * 0.2:
                        continuation = continuations[0].extract()
                        if len(continuation) == 1 and len(continuation[0]) in (len(headers),len(headers)-1):
                            tail = [' '.join((c or '').split()) for c in continuation[0]]
                            tail = ['']*(len(headers)-len(tail)) + tail
                            body[-1] = [(' '.join([cell, extra])).strip() for cell,extra in zip(body[-1],tail)]
                            pages.append(source['page']+1)
                previous = [''] * len(headers)
                for row in body:
                    for i, cell in enumerate(row):
                        if not cell: row[i] = previous[i]
                    previous = row.copy()
                return {'headers':headers,'rows':body,'pages':pages,'docId':source['docId'],'docName':source['docName']}
    return None
