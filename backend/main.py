import os
import shutil
import httpx
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from langchain_community.llms import Ollama
from langchain_community.embeddings import SentenceTransformerEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_classic.chains import RetrievalQA
from langchain_core.prompts import PromptTemplate
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from typing import List

app = FastAPI(title="SahayBot API", version="1.0.0")

# CORS middleware for React frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "../data")
CHROMA_PATH = os.path.join(BASE_DIR, "chroma_db")
LLM_MODEL_NAME = "llama3.2:3b"
EMBEDDING_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
OLLAMA_URL = "http://localhost:11434"

# Global references
llm = None
embeddings = None

def init_llm():
    global llm, embeddings
    try:
        llm = Ollama(model=LLM_MODEL_NAME, base_url=OLLAMA_URL)
        embeddings = SentenceTransformerEmbeddings(model_name=EMBEDDING_MODEL_NAME)
    except Exception as e:
        print(f"Error initializing AI components: {e}")

@app.on_event("startup")
async def startup_event():
    init_llm()
    # Check Ollama status
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{OLLAMA_URL}/api/tags")
            if resp.status_code == 200:
                models = [m["name"] for m in resp.json().get("models", [])]
                if f"{LLM_MODEL_NAME}:latest" not in models and LLM_MODEL_NAME not in models:
                    print(f"[WARNING] {LLM_MODEL_NAME} is not pulled in Ollama. Pull it using 'ollama pull {LLM_MODEL_NAME}'")
            else:
                print("[ERROR] Ollama is running but returned unexpected response.")
    except Exception as e:
        print(f"[ERROR] Could not connect to Ollama at {OLLAMA_URL}. Ensure Ollama is running.")

def get_vector_store():
    if not os.path.exists(CHROMA_PATH):
        return None
    return Chroma(persist_directory=CHROMA_PATH, embedding_function=embeddings)

PROMPT_TEMPLATE = """You are SahayBot, a legal and cooperative governance expert. 
Answer the following question based ONLY on the provided context. If the answer cannot be found in the context, say "I cannot find the answer in the provided documents." and do not make up an answer.
Answer in the language of the question (English or Hindi).

Context:
{context}

Question: {question}
Answer:"""

@app.get("/health")
async def health_check():
    health_status = {
        "status": "healthy",
        "ollama": "disconnected",
        "chromadb": "unavailable"
    }
    
    # Check Ollama
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{OLLAMA_URL}/api/tags")
            if resp.status_code == 200:
                health_status["ollama"] = "connected"
    except Exception:
        pass
        
    # Check Chroma
    if os.path.exists(CHROMA_PATH):
        health_status["chromadb"] = "available"
        
    if health_status["ollama"] == "disconnected" or health_status["chromadb"] == "unavailable":
        health_status["status"] = "degraded"
        
    return health_status

@app.post("/ingest_pdfs/")
async def ingest_pdfs_api(files: List[UploadFile] = File(...)):
    if not os.path.exists(DATA_PATH):
        os.makedirs(DATA_PATH)

    saved_files = []
    for file in files:
        if not file.filename.endswith(".pdf"):
            raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
        file_path = os.path.join(DATA_PATH, file.filename)
        with open(file_path, "wb") as f:
            f.write(await file.read())
        saved_files.append(file.filename)

    # Re-run the ingestion pipeline logic
    try:
        from ingest import ingest_documents
        ingest_documents()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")

    return {"message": f"Ingested {len(saved_files)} files: {', '.join(saved_files)}"}

@app.get("/query/")
async def query_bot(question: str):
    global llm
    if llm is None:
        init_llm()
        if llm is None:
            raise HTTPException(status_code=500, detail="LLM not initialized. Check server logs.")

    vector_store = get_vector_store()
    if not vector_store:
        raise HTTPException(status_code=400, detail="No ingested documents found. Please upload PDFs first.")

    retriever = vector_store.as_retriever(search_kwargs={"k": 4})
    prompt = PromptTemplate(
        template=PROMPT_TEMPLATE,
        input_variables=["context", "question"]
    )

    qa_chain = RetrievalQA.from_chain_type(
        llm=llm,
        retriever=retriever,
        return_source_documents=True,
        chain_type_kwargs={"prompt": prompt}
    )

    try:
        result = qa_chain.invoke({"query": question})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ollama execution failed: {str(e)}")

    answer = result["result"]
    
    # Extract unique sources with page numbers
    raw_sources = result.get("source_documents", [])
    unique_sources = {}
    for doc in raw_sources:
        source_name = doc.metadata.get("source", "Unknown")
        page = doc.metadata.get("page", 1)
        if source_name not in unique_sources:
            unique_sources[source_name] = set()
        unique_sources[source_name].add(page)

    sources_list = [
        {"file": src, "pages": sorted(list(pages))} 
        for src, pages in unique_sources.items()
    ]

    return JSONResponse(content={
        "answer": answer,
        "sources": sources_list
    })
