from __future__ import annotations
import json, os, sqlite3
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
ROOT=Path(__file__).resolve().parents[1]
DB=ROOT/'data'/'workforce.db'
SEED=ROOT/'data'/'seed.json'
app=FastAPI(title='Workforce Operations Center')
app.add_middleware(CORSMiddleware,allow_origins=['*'],allow_methods=['*'],allow_headers=['*'])
def conn():
 c=sqlite3.connect(DB);c.execute('CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)');return c
def load_state():
 with conn() as c:
  row=c.execute('SELECT payload FROM state WHERE id=1').fetchone()
  if row:return json.loads(row[0])
 seed=json.loads(SEED.read_text());save_state(seed);return seed
def save_state(data):
 with conn() as c:c.execute("INSERT INTO state(id,payload,updated_at) VALUES(1,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=CURRENT_TIMESTAMP",(json.dumps(data),));c.commit()
class State(BaseModel):
 model_config={'extra':'allow'}
@app.get('/api/health')
def health():return {'status':'ok','application':'Workforce Operations Center','version':'1.0.0'}

@app.get('/api/state')
def get_state():return load_state()
@app.put('/api/state')
def put_state(state:dict):save_state(state);return {'ok':True}
@app.post('/api/reset')
def reset():
 if DB.exists():DB.unlink()
 return load_state()
@app.post('/api/assistant')
def assistant(body:dict):
 prompt=str(body.get('prompt','')).strip();context=body.get('context',{})
 endpoint=os.getenv('WORKFORCE_LLM_ENDPOINT');key=os.getenv('WORKFORCE_LLM_API_KEY');model=os.getenv('WORKFORCE_LLM_MODEL')
 if not endpoint or not key:return {'mode':'rules','answer':'An approved LLM endpoint is not configured. Use the built-in transparent coverage engine and cell explanations.'}
 import urllib.request
 payload=json.dumps({'model':model,'messages':[{'role':'system','content':'You are a workforce scheduling assistant. Use only supplied data. Explain recommendations. Do not evaluate employee performance, infer protected traits, or publish changes without human approval.'},{'role':'user','content':prompt+'\n'+json.dumps(context)}],'temperature':0.1}).encode()
 req=urllib.request.Request(endpoint,data=payload,headers={'Authorization':f'Bearer {key}','Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=60) as r:result=json.loads(r.read())
  return {'mode':'llm','answer':result['choices'][0]['message']['content']}
 except Exception as exc:raise HTTPException(502,f'LLM request failed: {type(exc).__name__}')
DIST=ROOT/'frontend'/'dist'
if DIST.exists():
 app.mount('/assets',StaticFiles(directory=DIST/'assets'),name='assets')
 @app.get('/{path:path}')
 def spa(path:str):return FileResponse(DIST/'index.html')
