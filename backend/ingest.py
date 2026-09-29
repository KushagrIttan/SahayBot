import os
import hashlib
import json
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import SentenceTransformerEmbeddings

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "../data")
CHROMA_PATH = os.path.join(BASE_DIR, "./chroma_db")
INGESTED_FILES_PATH = os.path.join(BASE_DIR, "ingested_files.json")
EMBEDDING_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"

def get_file_hash(filepath):
    hasher = hashlib.md5()
    with open(filepath, 'rb') as f:
        buf = f.read()
        hasher.update(buf)
    return hasher.hexdigest()

def ingest_documents():
    if not os.path.exists(DATA_PATH):
        print(f"Data path {DATA_PATH} does not exist.")
        return

    ingested_files = {}
    if os.path.exists(INGESTED_FILES_PATH):
        with open(INGESTED_FILES_PATH, 'r') as f:
            ingested_files = json.load(f)

    new_documents = []
    updated_files = {}
    
    for filename in os.listdir(DATA_PATH):
        if filename.endswith(".pdf"):
            file_path = os.path.join(DATA_PATH, filename)
            file_hash = get_file_hash(file_path)
            
            if ingested_files.get(filename) != file_hash:
                print(f"Processing new/updated file: {filename}")
                loader = PyPDFLoader(file_path)
                docs = loader.load()
                # Ensure metadata includes page number explicitly
                for i, doc in enumerate(docs):
                    doc.metadata['source'] = filename
                    doc.metadata['page'] = i + 1
                new_documents.extend(docs)
                updated_files[filename] = file_hash
            else:
                updated_files[filename] = file_hash

    if not new_documents:
        print("No new documents to ingest.")
        return

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
    )
    chunks = text_splitter.split_documents(new_documents)

    embedding_function = SentenceTransformerEmbeddings(model_name=EMBEDDING_MODEL_NAME)

    # Initialize ChromaDB (automatic persistence)
    db = Chroma(persist_directory=CHROMA_PATH, embedding_function=embedding_function)
    db.add_documents(chunks)
    
    # Save the updated ingested files status
    with open(INGESTED_FILES_PATH, 'w') as f:
        json.dump(updated_files, f, indent=4)
        
    print(f"Ingestion complete. Added {len(chunks)} chunks.")

if __name__ == "__main__":
    ingest_documents()
