"""Exercise real local inference; writes results for reviewing the demo."""
import json
import time
from pathlib import Path
import httpx
QUESTIONS = [
 ('EN','What services can a PACS provide under the model bye-laws?'),
 ('EN','What are the farmer premium rates under PMFBY?'),
 ('HI','प्रधानमंत्री फसल बीमा योजना में किसान को कितना प्रीमियम देना होता है?'),
 ('EN','How does grievance redressal work under PMFBY?'),
 ('EN','What are the membership conditions in the PACS model bye-laws?'),
 ('EN','What is the launch code for a spaceship on Mars?'),
]
def main():
 records=[]
 with httpx.Client(base_url='http://127.0.0.1:8000',timeout=180) as client:
  print('Health:',client.get('/health').json(),flush=True)
  for language,question in QUESTIONS:
   started=time.monotonic();r=client.post('/query/',json={'question':question,'language':language});r.raise_for_status();reply=r.json()
   records.append({'question':question,'language':language,**reply})
   print(question,'\n',reply['answer'],'\n',[(s['docName'],s['page']) for s in reply['sources']],round(time.monotonic()-started,1),'s',flush=True)
 Path('docs/validation/demo-results.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':main()
