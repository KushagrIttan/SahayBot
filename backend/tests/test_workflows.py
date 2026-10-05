"""Regression tests with an isolated database and deterministic fake embeddings."""
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from backend import store
from backend.main import app

PDF = Path(__file__).resolve().parents[2] / 'data/official/PACS_Model_Byelaws_2023.pdf'

def fake_encode(texts):
    result = np.zeros((len(texts), 384), dtype=np.float32)
    for i, text in enumerate(texts):
        result[i, 0] = 1
        result[i, 1] = len(text) % 10 / 100
    return result / np.linalg.norm(result, axis=1, keepdims=True)

class Workflows(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.patches = [patch.object(store,'DATA_DIR',self.root/'data'),patch.object(store,'DB_PATH',self.root/'db.sqlite3'),patch.object(store,'encode',fake_encode)]
        for p in self.patches:p.start()
        self.client = TestClient(app)
    def tearDown(self):
        for p in reversed(self.patches):p.stop()
        self.tmp.cleanup()
    def upload(self,name='test.pdf',payload=None):
        return self.client.post('/ingest_pdfs/', files={'files':(name,payload or PDF.read_bytes(),'application/pdf')})
    def test_upload_inventory_page_citations_and_pdf(self):
        r=self.upload();self.assertEqual(r.status_code,200,r.text)
        doc=self.client.get('/documents').json()[0]
        self.assertEqual(doc['pages'],37);self.assertGreater(doc['chunks'],0)
        sources=store.retrieve('PACS membership',doc['id'])
        self.assertTrue(sources);self.assertGreaterEqual(sources[0]['page'],1)
        from pypdf import PdfReader
        self.assertEqual(sources[0]['snippet'], PdfReader(str(PDF)).pages[sources[0]['page']-1].extract_text(extraction_mode='layout').strip()[:6000])
        file=self.client.get(f"/documents/{doc['id']}/file")
        self.assertEqual(file.status_code,200);self.assertTrue(file.content.startswith(b'%PDF-'))
    def test_repeated_upload_is_idempotent(self):
        self.upload();before=self.client.get('/documents').json()[0]['chunks'];self.upload()
        self.assertEqual(self.client.get('/documents').json()[0]['chunks'],before)
    def test_replacement_deletion_and_registry_recovery(self):
        self.upload();doc=self.client.get('/documents').json()[0]
        with patch.object(store,'parse_pdf',return_value=(1,[(1,'A revised cooperative rule with completely new content.')])):
            self.upload(payload=PDF.read_bytes()+b'\n%modified')
        current=self.client.get('/documents').json()[0]
        self.assertEqual(current['id'],doc['id']);self.assertEqual(current['chunks'],1)
        self.assertEqual(self.client.delete(f"/documents/{doc['id']}").status_code,200)
        self.assertEqual(self.client.get('/documents').json(),[])
        with store.connect() as db:self.assertEqual(db.execute('select count(*) from chunks').fetchone()[0],0)
        self.assertEqual(self.client.get(f"/documents/{doc['id']}/file").status_code,404)
    def test_path_traversal_and_invalid_pdf(self):
        for name in ['../escape.pdf','/tmp/escape.pdf','..\\escape.pdf','text.txt']:
            self.assertEqual(self.upload(name).status_code,400)
        self.assertEqual(self.upload(payload=b'%PDF-not-really').status_code,422)
        self.assertEqual(self.upload(payload=b'not a PDF').status_code,422)
        self.assertEqual(self.client.get('/documents').json(),[])
    def test_blank_scan_and_upload_limit(self):
        writer=PdfWriter();writer.add_blank_page(width=100,height=100);buffer=io.BytesIO();writer.write(buffer)
        self.assertEqual(self.upload(payload=buffer.getvalue()).status_code,422)
        self.assertEqual(self.upload(payload=b'%PDF-'+b'x'*(15*1024*1024)).status_code,413)
    def test_query_contract_and_empty_library(self):
        self.assertEqual(self.client.post('/query/',json={'question':'   '}).status_code,422)
        self.assertEqual(self.client.post('/query/',json={'question':'Membership conditions?'}).status_code,409)
        self.assertEqual(self.client.post('/query/',json={'question':'hi','language':'XX'}).status_code,422)
    def test_no_evidence_abstains_without_model(self):
        self.upload()
        with patch.object(store,'retrieve',return_value=[]):
            r=self.client.post('/query/',json={'question':'Who wins the moon lottery?','language':'HI'})
        self.assertEqual(r.status_code,200);self.assertEqual(r.json()['mode'],'abstained');self.assertEqual(r.json()['sources'],[])
    def test_premium_table_preserves_rates_crop_types_and_continuation(self):
        pdf=PDF.parent/'PMFBY_Operational_Guidelines_2023.pdf'
        self.assertEqual(self.upload('crop.pdf',pdf.read_bytes()).status_code,200)
        doc=store.inventory()[0]
        table=store.relevant_table([{'docId':doc['id'],'docName':doc['name'],'page':47}], 'farmer premium rates')
        self.assertEqual(table['pages'],[47,48])
        self.assertEqual(table['rows'][0][0],'Kharif')
        self.assertIn('2.0%',table['rows'][0][2])
        self.assertEqual(table['rows'][1][0],'Rabi')
        self.assertIn('1.5%',table['rows'][1][2])
        self.assertIn('Annual Commercial',table['rows'][2][1])
        self.assertIn('5%',table['rows'][2][2])
        self.assertIn('pilot basis',table['rows'][3][1])
        self.assertIn('whichever is less',table['rows'][3][2])
        r=self.client.post('/query/',json={'question':'What are the farmer premium rates under PMFBY?'})
        self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(r.json()['mode'],'document_table')
        self.assertEqual(r.json()['table']['rows'],table['rows'])
    def test_generation_failure_returns_labeled_real_excerpts(self):
        import httpx
        self.upload()
        with patch('backend.main.httpx.AsyncClient',side_effect=httpx.ConnectError('offline test')):
            r=self.client.post('/query/',json={'question':'What is PACS membership?'})
        self.assertEqual(r.status_code,200)
        self.assertEqual(r.json()['mode'],'source_excerpts')
        self.assertTrue(r.json()['sources'])
        self.assertIn('unavailable',r.json()['answer'])
    def test_index_restores_after_database_loss(self):
        self.upload();store.DB_PATH.unlink()
        store.index_sources();self.assertEqual(len(store.inventory()),1)
    def test_failed_replacement_preserves_existing_version(self):
        self.upload();before=self.client.get('/documents').json()[0]
        self.assertEqual(self.upload(payload=b'%PDF-broken').status_code,422)
        self.assertEqual(self.client.get('/documents').json()[0],before)

if __name__=='__main__':unittest.main()
