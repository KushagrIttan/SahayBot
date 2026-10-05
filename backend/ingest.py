"""Run from repository root: python -m backend.ingest."""
from backend.store import index_sources

def ingest_documents():
    results = index_sources()
    for result in results: print(result)
    return results

if __name__ == '__main__':
    ingest_documents()
