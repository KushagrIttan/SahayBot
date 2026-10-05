"""Download authentic reference PDFs; validate signatures and record provenance."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import urllib.request
import ssl
ROOT = Path(__file__).resolve().parents[1]
SOURCES = [
 ('PACS_Model_Byelaws_2023.pdf','https://www.cooperation.gov.in/sites/default/files/2023-06/Model%20Byelaws%2005.01.02023.pdf','Ministry of Cooperation','PACS model bye-laws','Model: verify adoption under your state law'),
 ('Cooperation_Annual_Report_2024_25.pdf','https://cooperation.gov.in/sites/default/files/2026-03/511_Annual%20Report%202024-25%20%28Final%29.pdf','Ministry of Cooperation','Schemes and PACS services','Reporting period 2024–25'),
 ('PMFBY_Operational_Guidelines_2023.pdf','https://pmfby.amnex.co.in/pmfby/pdf/operational_guidelines_pmfby.pdf','Department of Agriculture & Farmers Welfare / PMFBY portal','Crop insurance and grievances','Effective from Kharif 2023; check current state notification'),
 ('RBI_Financial_Inclusion_2019_24.pdf','https://www.rbi.org.in/commonman/Upload/English/Content/PDFs/English_16042021.pdf','Reserve Bank of India','Financial literacy and consumer protection','Strategy period 2019–24; educational reference'),
]
def download(source):
 name,url,publisher,topic,note=source
 target=ROOT/'data'/'official'/name
 request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
 try:
  context = ssl.create_default_context()
  # The Ministry server omits its intermediate chain. Keep TLS verification enabled.
  if 'cooperation.gov.in' in url:
   context.load_verify_locations(str(ROOT / 'scripts/certs/emsign-chain.pem'))
  with urllib.request.urlopen(request,timeout=50,context=context) as response:
   payload=response.read(30*1024*1024)
   resolved=response.url
  if not payload.startswith(b'%PDF-'): raise ValueError('Server did not return a PDF')
  from pypdf import PdfReader
  import io
  reader=PdfReader(io.BytesIO(payload))
  if not any((p.extract_text() or '').strip() for p in reader.pages): raise ValueError('No extractable text')
  target.write_bytes(payload)
  print(name,len(payload),'bytes',len(reader.pages),'pages',flush=True)
  return {'filename':name,'url':url,'resolved_url':resolved,'publisher':publisher,'topic':topic,'note':note,'downloaded':'2026-10-05','sha256':hashlib.sha256(payload).hexdigest(),'pages':len(reader.pages)}
 except Exception as e:
  print('FAILED',name,str(e),flush=True); return None
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  results=[x for x in pool.map(download,SOURCES) if x]
 (ROOT/'data'/'sources.json').write_text(json.dumps(results,indent=2,ensure_ascii=False)+'\n')
 if not results: raise SystemExit('No sources downloaded')
