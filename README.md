# SahayBot · सहायबॉट

**English and Hindi cooperative guidance, grounded in real reference PDFs.**

Working prototype for **Smart India Hackathon 2026 · PS 26088**, Ministry of Cooperation / National Council for Cooperative Training (NCCT). Built for cooperative members, PACS users, farmers and rural stakeholders.

## What you can demonstrate

- Ask questions about PACS services, membership, cooperative initiatives, PMFBY and financial literacy.
- Get local AI answers with genuine retrieved excerpts and one-based PDF page links. PMFBY premium tables are extracted directly to preserve rates and crop categories.
- Switch between English and Hindi; dictate a question in a supported browser and play answers aloud.
- Upload a text PDF, index it, restrict a question to that document and open the original PDF.
- Replace an uploaded document without retaining its obsolete passages; remove an uploaded document and its index.
- Calculate a reducing-balance loan EMI, including the zero-interest case.
- Prepare, edit and download a complaint draft. External official portals are linked; the prototype does **not** submit grievances or invent tracking IDs.
- Use the responsive website on a laptop, mobile browser or proposed PACS touch-and-voice kiosk.

There are no canned answers, invented document names, random confidence scores or simulated retrieval stages. When local generation is unavailable, the app explicitly returns actual source excerpts. It does not disguise excerpts as an AI answer.

## Run locally

Prerequisites: **Python 3.11+, Node.js 22.12+ and Ollama**. A laptop with 8 GB RAM is a practical starting point; actual latency depends on the host. All model inference runs on the machine hosting the backend. First-time model downloads require internet access.

```bash
# From the repository root
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
ollama pull llama3.2:3b

cd frontend
npm ci
cd ..

# Official PDFs are included. Build the local index once.
python -m backend.ingest

# Starts both services; Ctrl+C stops them.
./scripts/run_demo.sh
```

On a Linux machine without an NVIDIA GPU, installing CPU PyTorch first avoids downloading large CUDA dependencies: `pip install torch --index-url https://download.pytorch.org/whl/cpu`, then install the backend requirements.

Open **http://localhost:5173**. Ollama must be running (`ollama serve` if your installation does not run it as a service). Initial embedding download/indexing can take a few minutes. Subsequent starts reuse the index. The API is at http://127.0.0.1:8000/docs.

Alternatively use two terminals:

```bash
# Terminal 1, repository root
source .venv/bin/activate
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

```bash
# Terminal 2
cd frontend
npm run dev -- --host 0.0.0.0
```

For an Android browser on the same trusted Wi-Fi, open the laptop's LAN IP at port 5173. Vite proxies `/api` to the laptop backend. Browser microphone access generally needs **HTTPS or localhost**; ordinary LAN HTTP is suitable for typing but may block microphone access. Browser speech recognition support and installed Hindi TTS voices vary. Use Chrome with microphone permission for a voice demonstration.

## Reference corpus

| PDF | Issuer / source | Coverage |
|---|---|---|
| PACS Model Bye-laws, 2023 | Ministry of Cooperation | Membership, governance, rights and multipurpose activities |
| Annual Report 2024–25 | Ministry of Cooperation | PACS services, computerization and cooperative initiatives |
| PMFBY Operational Guidelines 2023 | Department of Agriculture & Farmers Welfare, PMFBY document portal | Premiums, coverage and grievance procedure |
| National Strategy for Financial Inclusion 2019–24 | RBI | Financial literacy, inclusion and consumer protection |

Actual PDFs are in `data/official/`. Source URLs, publishers, dates, SHA-256 hashes and page counts are in [data/sources.json](data/sources.json). The reference documents remain the property of their respective publishers; attribution is retained. They are reference editions, not a claim that every rule or statistic remains current. The app displays their edition/jurisdiction notes.

Optional re-download:

```bash
python scripts/fetch_sources.py
python -m backend.ingest
```

The Ministry's PDF server omits its TLS intermediate chain. The download script supplies the publisher's CA chain from the HTTPS emSign repository while retaining certificate verification. It validates PDF signatures and extractable text; no certificate-check bypass is used.

Uploaded PDFs are stored under `data/uploads/` and excluded from Git. Limits: 5 files per batch, 15 MB per file, 400 pages. Password-protected and image-only scanned PDFs are rejected with a helpful message; OCR is a planned extension. Same-name user uploads replace the earlier version. Bundled references cannot be overwritten by uploads.

## Architecture

```text
Responsive React interface
  ├─ English/Hindi text, browser speech input/output
  ├─ PDF source viewer, document scope, local conversation history
  ├─ Educational loan calculator
  └─ Local editable grievance draft
                 │ POST /api/query
           Vite development proxy
                 │
             FastAPI
  ├─ PDF parsing → page-aware chunks → multilingual embeddings
  ├─ SQLite: document metadata, chunks and normalized embedding vectors
  ├─ Hybrid semantic + lexical retrieval → original page text / exact premium table
  ├─ Hindi query translation → retrieval from English references
  └─ Local Ollama / Llama 3.2 3B → language-controlled cited answer
```

SQLite replaces the earlier inconsistent Chroma index. Vector search uses normalized NumPy dot products with lexical weighting. This keeps the demo corpus portable, file replacement transactional and dependencies smaller. `backend/knowledge.sqlite3` is generated and excluded from Git. The old Chroma folders and backup frontend are legacy snapshots, not runtime dependencies.

## Checks

```bash
cd frontend
npm run build             # Includes TypeScript checking
cd ..
python -m unittest discover -s backend/tests -v
python scripts/smoke_demo.py  # Real backend + Ollama, saves reviewable demo results
```

Regression tests isolate their data, use deterministic embeddings and simulate selected failure cases. Live smoke tests separately exercise real embeddings and Ollama. They cover PDF upload/inventory/serving, traversal prevention, malformed and scanned files, upload limits, repeated uploads, replacement, deletion, index recovery, failed replacement and no-evidence abstention. A GitHub Actions workflow runs the build and regression suite.

## Demo and submission material

- [Submission draft](docs/SIH_SUBMISSION.md): copy-ready idea description and feature mapping.
- [Demo script](docs/DEMO_SCRIPT.md): repeatable walkthrough and narration.
- [Hardware deployment](docs/HARDWARE_PLAN.md): PACS kiosk architecture, bill of materials and what remains proposed.
- [Validation](docs/VALIDATION.md): tested scope, observed behavior and limitations.
- [Original audit](AUDIT.md): historical findings before this implementation; see validation for current status.

## Configuration and deployment

`.env.example` lists backend environment variables. `run_demo.sh` loads a root `.env`; other launch commands require you to export the variables yourself. `frontend/.env.example` describes `VITE_API_BASE_URL`. The default `/api` address works with the Vite development proxy; production needs a same-origin reverse proxy. Do not use `vite preview` as the full application server without configuring backend routing.

For a cloud pilot, serve the frontend over HTTPS, route `/api` to FastAPI, and keep Ollama private. Add authentication, upload authorization, rate limiting, backups and an operator-managed corpus before exposing write endpoints publicly. The checked-in launch script binds FastAPI to loopback and is intended for a laptop/kiosk or trusted demo network, not an open multi-tenant service.

## Honest prototype boundaries

English and Hindi are implemented; other Indian languages are planned. Native Android, WhatsApp/IVR, state-by-state verified law collections, OCR, offline speech recognition, actual grievance filing/tracking, accounts and physical kiosk hardware are not implemented. Hardware category alignment is a proposed kiosk deployment, not a fabricated hardware demonstration. Responses need source review; retrieval and prompts reduce hallucinations but do not guarantee legal accuracy.

Text inference is local. Browser speech recognition may send audio to the browser provider. Conversation history stays in localStorage on the current browser; **New conversation** clears it. Grievance form details are not sent to the backend. The source library is shared by users of the same backend; there is no account isolation in this prototype.
