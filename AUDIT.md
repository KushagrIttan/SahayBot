# SahayBot project audit

Date: 5 October 2026. Scope: active React frontend, FastAPI backend, ingestion pipeline, documentation, stored database state, and backup frontend for feature regressions. No application code was changed. Generated build output is ignored by Git.

## Overall assessment

This is a runnable prototype with a real local RAG backend and a substantially mocked interface. It is not yet a reliable document-grounded legal assistant. The build passes, the installed backend dependencies are consistent, and local inference works. The primary user workflow—upload a PDF and then receive verifiable answers from it—is broken under the documented launch arrangement. Much of the UI presents demo information as live evidence.

“Implemented” below means code exists; “verified” means an audit check actually exercised it. Browser microphone, clipboard, responsive layout and user interactions were not exercised in a browser. Legal accuracy was not evaluated; this report evaluates engineering behavior and evidence provenance.

## Verification results

| Check | Result | Interpretation |
|---|---|---|
| `npm run build` in frontend | PASS | Vite production bundle generated. Warning about JSON import attributes in Vite config is nonblocking. |
| `npx tsc --noEmit` | PASS | Current source and config pass TypeScript checks. Build script itself does not run this check. |
| Import `backend.main` | PASS | Backend module imports in the project virtual environment. |
| `.venv/bin/pip check` | PASS | No installed dependency conflicts reported. All ten requirements pins match installed versions. |
| Ollama `/api/tags` | PASS | Local server reachable; `llama3.2:3b` installed. |
| Embedding initialization with `HF_HUB_OFFLINE=1` | PASS | Cached multilingual model loads without downloading weights. |
| Direct backend query in English and Hindi | PASS, limited corpus | Both returned answers and source metadata; English abstained and Hindi explained that the PDF was dummy content. This is a smoke test, not a multilingual accuracy evaluation. |
| Upload handler with temporary data directory | FAIL | HTTP 500: `Ingestion failed: No module named 'ingest'`. File remained saved after failure. |
| Direct health handler | Returned healthy | Checks Ollama connectivity and database directory existence, despite unusable legal corpus. |
| Existing API process on port 8000 | Not running at audit start | Connection refused. This is environment state, not evidence that the app cannot start. |
| Stored corpus inspected using read-only SQLite | Dummy content only | Backend DB has two embedding rows; root DB has one. Backend rows include duplicated dummy text with inconsistent source and page metadata. |
| Automated test suite / CI | Not found in tracked project | No project tests or CI workflows found. |

## Findings, ordered by priority

### 1. High: PDF upload fails in the documented setup

Evidence: `backend/main.py:120` uses `from ingest import ingest_documents`. The documented command imports the backend as `backend.main` from the repository root; `ingest.py` resides inside `backend`, not at the top level. Reproduced with the actual handler and a temporary upload folder: HTTP 500 with `No module named 'ingest'`.

Files are written before this failure and not rolled back (`main.py:108–123`). The UI consequently marks the upload as an error even though the file is present. Use a package-correct import and transactional staging/cleanup. Starting with a different Python path may hide the import defect; it does not make the documented setup correct.

### 2. High: answers and citations can bypass the actual knowledge base

Evidence: `frontend/src/App.tsx:738–769` returns fixed answers for three of the four suggested prompts: limitation period, anticipatory bail and willful default. These branches never call the backend. They can succeed with the backend stopped and no supporting PDFs uploaded.

The listed source filenames, pages and quotations are hardcoded. This violates the advertised “based on uploaded PDF documents” behavior. Either remove these branches or explicitly separate and label a demo mode. Do not treat the hardcoded legal statements as validated answers.

### 3. High: live response citations are misleading

Evidence: `App.tsx:775–786` replaces filenames containing `dummy` with plausible legal document names; returns a generic placeholder instead of a retrieved passage; invents a page when none exists; assigns random relevance between 70% and 95%. It keeps only the first page from each backend source.

The backend supplies retrieved document names/pages but no excerpts or similarity scores (`backend/main.py:159–176`). Sources are retrieved context, not proof that each assertion in the answer is supported. Real citations use IDs such as `src-0`, which cannot match uploaded document IDs, so the preview metadata lookup fails (`App.tsx:961–963`).

Return stable document/chunk IDs, real passages, all cited pages and honest retrieval metadata. Preserve original source identity. Remove random scores and fabricated fallback pages.

### 4. High: the upload filename can escape the data directory

Evidence: `backend/main.py:113` joins a client-controlled filename directly to the data directory. Absolute filenames and `../...pdf` can target files outside it, subject to server filesystem permissions. Existing files can be overwritten. There is no authentication, upload-size limit, PDF signature validation, or rate limit; CORS allows all origins.

This is a code-level vulnerability, not an externally exploited finding. Use generated storage names, resolved-path containment checks, explicit limits and authorization appropriate to deployment. Never publicly expose the current upload endpoint as written.

### 5. High: HTML rendering permits script-capable markup

Evidence: `App.tsx:201–249` interpolates unescaped text into `dangerouslySetInnerHTML`. Both user message rendering and AI answer rendering use this formatter. HTML event attributes can execute in the application origin if rendered by a browser; untrusted PDF content can also influence model output.

Use a safe Markdown renderer with raw HTML disabled or rigorously sanitize output. The audit identified the unsafe code path; it did not execute an exploit in a browser.

### 6. High: the current corpus is not the corpus shown in the UI

Evidence: the upload directory contains only `.gitkeep`. The backend's persisted Chroma database contains two rows of `Dummy PDF file`; the root-level database contains one row of the same dummy text. `backend/ingested_files.json` tracks `dummy.pdf`, which is absent from the upload directory.

Actual backend queries returned two source variants for dummy content, with pages 0 and 1. The UI nevertheless initializes six legal PDFs and declares four ready (`App.tsx:45–52,657`). These seed statuses never synchronize with the server.

Use one canonical database location, rebuild from an actual controlled corpus, and fetch inventory/counts from the backend. Preserve existing data until a deliberate rebuild is authorized.

### 7. Medium: updated and deleted PDFs leave stale knowledge

Evidence: `backend/ingest.py:35–67` detects changed hashes but only appends chunks. It never deletes chunks belonging to an earlier file revision or a removed PDF. No stable chunk IDs or file-scoped replacement transaction exist. The hash registry can also suppress reingestion if the vector DB is lost but the registry remains.

Concurrent ingestion has no locking, writes the JSON registry non-atomically, and can duplicate data or lose registry updates. Replacing a legal document must replace its old chunks, and deleting one must remove its searchable content. Track corpus version and DB state together.

### 8. Medium: requests block the async server and progress is simulated

Evidence: synchronous embedding initialization, PDF processing and `qa_chain.invoke` execute within async handlers (`main.py:48,121,153`). They can block the event loop during expensive work. Query setup repeatedly constructs a vector store and QA chain. Ingestion loads another embedding model.

`App.tsx:717–731` spends roughly 2–3 seconds advancing timed retrieval stages before calling the backend. `isTyping` becomes false before the network request starts, allowing additional sends during inference. Answers are then revealed by timers after the entire response arrives; this is not server streaming. No request cancellation or explicit frontend timeout exists.

Use a worker/thread boundary or job queue for blocking tasks, preserve an in-flight state through completion, and expose real progress or a simple honest loading indicator. Add streaming only if needed.

### 9. Medium: health and error handling do not establish readiness

Evidence: `/health` checks only Ollama HTTP connectivity and existence of the Chroma directory. It does not check required model presence, embedding readiness, collection count, or corpus validity. Initialization exceptions are printed and swallowed, and `llm` can be set before embeddings fail. Vector store/chain construction occur outside the query exception handler. Error responses can reveal internal exception details, while the frontend discards useful error bodies and shows generic messages.

Separate liveness from readiness; validate each dependency and nonempty usable collection. Return structured public errors and record diagnostic details in server logs.

### 10. Medium: deployment is bound to the developer's localhost

Evidence: `frontend/src/services/api.ts:1` hardcodes `http://localhost:8000`. A user visiting a remotely hosted frontend contacts their own computer. The Vite `/api` proxy is configured but unused; it is a development proxy, not a production backend deployment.

Model name, Ollama URL, corpus paths and retrieval settings are hardcoded. No production service/container/reverse-proxy setup is present. Add environment configuration and a deliberate same-origin or configured API deployment.

## Intended features: actual status

| Feature advertised or implied by UI | Status |
|---|---|
| Local Ollama inference | Implemented and verified in direct backend queries. UI incorrectly names Claude Sonnet 5. |
| Multilingual embeddings | Implemented; cached model initialization verified. Retrieval quality across languages unmeasured. |
| English/Hindi answers | Prompt implemented; one smoke query in each language verified. No systematic evaluation. |
| Hindi mode | Changes input placeholder and speech-recognition language. Does not translate the interface or send selected language to backend; answer language follows question text. |
| PDF parsing/chunking/embedding | Implemented CLI pipeline, not end-to-end verified with a real legal PDF in this audit. API invocation broken. |
| Incremental ingestion | Hash skipping implemented; replacement, deletion and recovery incomplete. |
| PDF upload controls | Connected to endpoint, upload status updates implemented; endpoint fails under documented setup. Uploaded page count stays 0. |
| Accurate source names/pages | Backend extraction exists; stored legacy records show inconsistent metadata; frontend corrupts source provenance. |
| Citation excerpts and relevance | Mocked/placeholders/random values. |
| PDF viewer / full document access | Not implemented. Preview is hardcoded text; “Open Full Doc” has no click handler (`App.tsx:364`). No document-serving endpoint. |
| Document selection | Changes row highlighting only; does not scope retrieval or open document content. |
| Search documents | Local name/category filtering implemented; searches seeded/session entries, not server inventory or PDF contents. |
| Reranking and similarity threshold | UI says cross-encoder and 0.72; backend has neither. |
| Configurable RAG settings | Static display only. UI says 5 chunks; backend retrieves 4. Temperature display is not wired. |
| Voice input | Web Speech recognition code exists for English/Hindi. Unsupported/failed recognition only logs or resets state; no useful error UI. Browser behavior unverified. |
| Voice output | Missing from active frontend. Exists in `frontend.backup/src/App.tsx:20–29,51–52`; a regression during replacement. |
| Private on-device audio processing | README claim is not established by using a browser speech API. There is no explicit local-processing configuration or offline speech implementation. |
| Chat history / conversational memory | React session state only; no persistence. Backend receives just the latest question, so follow-up references lack chat context. |
| Feedback | Thumbs update local state only; no storage or analytics endpoint. |
| Regenerate | Calls reply path again, but deletes the old response and appends the replacement at the end. Earlier turns can lose chronological ordering. |
| Copy response | Clipboard API wired; failure swallowed and UI marks copied regardless of success. Browser behavior unverified. |
| True streaming and live retrieval progress | Timed simulations only. |
| User account and session | Displayed name, role, avatar initials and session ID are hardcoded; no account/session implementation. |
| Scan/OCR PDFs | No OCR fallback; scanned PDFs without text are unsupported. |
| Grounded abstention | Prompt instructs model to abstain; verified once in English. No similarity cutoff, citation validation or grounding evaluator; demos bypass it. |

## Other engineering gaps

- No automated tests, multilingual/grounding benchmark, CI gates, lint script, retrieval quality measurements or documented acceptance criteria.
- Backend uses deprecated community Ollama/embedding/Chroma classes; warnings reproduced. Installed dependencies currently work, so deprecation is maintenance debt rather than today's import failure. `langchain-ollama` is installed but unused.
- README is truncated in Usage, has a placeholder logo, describes CSS Modules while active frontend uses Tailwind, and claims dependencies are self-contained while Python points to an external runtime and Ollama/model caches live outside the repo.
- Active and backup frontends, `.bak` files, a second nested Vite config, two lockfiles and two persisted DB locations create ambiguity. Backup code is not imported by the active entrypoint.
- UI has fixed-width 272px sidebar and 340px preview; narrow-screen usability needs browser verification. Several icon buttons lack accessible names; microphone failure feedback is poor; no demonstrated focus management or accessible live response announcements.
- User questions are sent in GET query strings, making them eligible for URL/access-log capture. A POST body is preferable for sensitive questions.
- PDFs remain on disk after indexing; no retention/delete controls or user separation exist. These are missing capabilities, not evidence of an existing data leak.
- External Google Fonts are requested by CSS, so the frontend is not fully offline even when inference is local.

## Recommended repair sequence

1. Restore a truthful end-to-end workflow: package-correct upload import, safe file storage, real backend document inventory, remove unlabeled canned responses and fake citation metadata.
2. Repair corpus lifecycle: stable document/chunk IDs, replace/delete operations, registry/DB recovery, ingestion locking and atomic writes; ingest a real vetted corpus.
3. Secure rendering and API boundaries: safe Markdown, upload limits, authorization for deployment, scoped CORS, structured errors and configurable API routing.
4. Finish cited-answer functionality: real snippets, page-linked document serving/viewer, complete source pages, reliable IDs and clear distinction between retrieved evidence and validated support.
5. Restore voice output; communicate speech errors and privacy behavior; connect language and settings to actual behavior.
6. Add meaningful regression checks for upload/query integration, changed/deleted PDFs, citation integrity, Hindi retrieval, abstention, concurrent requests and failure states. Establish grounding evaluation before representing outputs as reliable legal assistance.
7. Add readiness checks, move blocking operations out of async handlers, fix pending-request lifecycle, and clean up documentation/scaffold duplication.

The highest-value milestone is one real PDF uploaded successfully, correctly listed after a refresh, queried in English and Hindi, and linked to genuine page excerpts without any demo substitutions.
