# SahayBot — Multilingual Cooperative Governance & Legal Assistance Chatbot

![SahayBot Logo](https://raw.githubusercontent.com/username/repo/main/docs/logo.png) <!-- Placeholder for future logo -->

A **SahayBot** (meaning "Assistant Bot") is an advanced RAG (Retrieval-Augmented Generation) based conversational AI designed to provide multilingual assistance on cooperative governance and legal matters. Built as a submission for SIH 2026, it leverages local Large Language Models (LLMs) and embeddings to offer grounded answers in both English and Hindi, with intuitive voice interaction capabilities.

## ✨ Features

-   **Multilingual Support**: Interact seamlessly in English or Hindi via text or voice.
-   **Grounded Answers**: Provides accurate responses based on uploaded PDF documents, citing specific sources (document name and page numbers).
-   **Local-First AI**: Utilizes your local Ollama instance (`llama3.2:3b`) and a local multilingual embedding model, ensuring data privacy and reducing operational costs.
-   **Client-Side Voice I/O**: Integrated Web Speech API for voice input (speech-to-text) and voice output (text-to-speech), keeping sensitive audio processing on the user's device.
-   **PDF Ingestion**: Easily upload new PDF documents to expand the bot's knowledge base via a dedicated UI button.
-   **Self-Contained Environment**: All dependencies (Python and Node.js) are installed within the project directory for easy setup, teardown, and portability.
-   **Modular Architecture**: Clean separation between FastAPI backend (RAG logic, API endpoints) and React/Vite frontend (interactive chat UI).

## 🚀 Technologies Used

**Backend:**
-   **Python**: Core language
-   **FastAPI**: Web framework for API endpoints
-   **LangChain**: RAG framework for LLM orchestration
-   **Ollama**: Local LLM inference server (`llama3.2:3b`)
-   **ChromaDB**: Local vector store for document embeddings
-   **Sentence-Transformers**: Multilingual embeddings (`paraphrase-multilingual-MiniLM-L12-v2`)
-   **PyPDFLoader**: PDF document processing

**Frontend:**
-   **React**: JavaScript library for building user interfaces
-   **Vite**: Fast frontend development tooling
-   **TypeScript**: Type-safe JavaScript
-   **Web Speech API**: Browser-native speech-to-text and text-to-speech
-   **CSS Modules**: Modular and scoped styling

## 📂 Project Structure

```
sahaybot/
├── backend/               # FastAPI application, RAG logic, ingestion scripts
│   ├── main.py
│   ├── ingest.py
│   ├── requirements.txt
│   └── chroma_db/         # Persistent vector store (gitignored)
├── frontend/              # React/Vite chat UI
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── services/
│   │   ├── App.tsx
│   │   ├── App.css
│   │   ├── main.tsx
│   │   └── ...other UI files
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── data/                  # Placeholder for user-provided PDFs (gitignored, contains .gitkeep)
├── .gitignore             # Specifies files/directories to ignore in Git
└── README.md              # This documentation
```

## ⚙️ Setup Instructions

Follow these steps to get SahayBot up and running on your local machine.

### 1. Prerequisites

-   **Ollama**: Ensure Ollama is installed and running. Download from [ollama.ai](https://ollama.ai/).
-   **Node.js & npm**: Install Node.js (which includes npm) from [nodejs.org](https://nodejs.org/).
-   **Python 3.11+**: Ensure Python 3.11 or newer is installed.
-   **Git**: For cloning the repository.

### 2. Clone the Repository

```bash
git clone https://github.com/KushagrPathak/SahayBot.git # Replace with your actual repo URL
cd SahayBot
```

### 3. Ollama Model Setup

SahayBot uses the `llama3.2:3b` model. Pull it with Ollama:

```bash
ollama pull llama3.2:3b
```

### 4. Backend Setup

Navigate to the project root and set up the Python environment:

```bash
cd /home/electron/sahaybot # Adjust path if different
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

### 5. Frontend Setup

Navigate to the frontend directory and install Node.js dependencies:

```bash
cd /home/electron/sahaybot/frontend # Adjust path if different
npm install
```

### 6. Ingest Documents

Place your `.pdf` documents (e.g., cooperative laws, scheme documents, FAQs) into the `data/` directory. Then, run the ingestion script from the project root:

```bash
cd /home/electron/sahaybot # Adjust path if different
source .venv/bin/activate # Ensure venv is active
python backend/ingest.py
```
This will process the PDFs and create the `chroma_db` vector store within the `backend/` directory.

## ▶️ Running SahayBot

Keep both the backend and frontend running in separate terminal sessions.

### 1. Start the Backend API

From the project root (`/home/electron/sahaybot`):

```bash
source .venv/bin/activate # Activate Python venv
uvicorn backend.main:app --reload
```
The FastAPI application will start, typically accessible at `http://localhost:8000`. You can view the API documentation (Swagger UI) at `http://localhost:8000/docs`.

### 2. Start the Frontend UI

From the `frontend/` directory (`/home/electron/sahaybot/frontend`):

```bash
npm run dev
```
The React development server will start, usually accessible at `http://localhost:5173`. Your browser should automatically open to this URL.

## 💬 Usage

Once both the backend and frontend are running:

1.  **Access the Chatbot**: Open your web browser and navigate to `http://localhost:5173`.
2.  **Ask Questions**: Type your questions in the input field and press Enter or click the 