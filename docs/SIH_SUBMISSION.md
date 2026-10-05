# SIH 2026 · PS 26088 submission draft

## Problem identification

- Title: Multilingual Cooperative Governance & Legal Assistance Chatbot
- Organization: Ministry of Cooperation
- Department: National Council for Cooperative Training (NCCT)
- Category: Hardware
- Theme: Agriculture, FoodTech & Rural Development
- Proposed mode: Software + Hardware
- Project: SahayBot — सहायबॉट

The problem details above come from the statement supplied by the team. Confirm portal field lengths, current submission availability, team identity and mandatory slide template before submitting. No portal submission has been performed by the coding agent.

## Idea title

**SahayBot: a multilingual, voice-enabled cooperative information companion for PACS and rural communities**

## Short abstract

SahayBot helps cooperative members and farmers understand PACS services, cooperative governance, crop insurance, financial literacy and grievance procedures in English and Hindi. Instead of answering from an unrestricted chatbot, it retrieves passages and premium tables from real reference PDFs and provides local AI explanations with document names, original excerpts and page links. Users can ask by text or supported browser voice input, listen to answers, and add a relevant PDF to the knowledge base. A loan repayment calculator explains borrowing costs, while a grievance assistant prepares an editable complaint draft without pretending to file it. The working responsive web prototype is designed for deployment on a touch-and-voice kiosk at a PACS or cooperative training centre, with a local inference host and an optional cloud-managed document update service. The approach combines language access, verifiable information and practical next steps. Further development will add verified state-specific laws, additional languages, offline speech, OCR and authorized grievance integrations.

## Problem and target users

Cooperative members, farmers and rural stakeholders face language barriers and fragmented information about governance, services, schemes and complaint processes. Written legal and scheme documents can be difficult to interpret. SahayBot offers a simple conversational entry point while keeping the source document available for verification.

Target users: PACS members, farmers, cooperative field staff, community facilitators and NCCT training participants. A facilitator-assisted kiosk can support people without a smartphone or personal computer.

## Proposed solution

1. Source-grounded guidance: real PDFs are parsed and indexed by page; hybrid retrieval selects evidence before local generation.
2. Language access: English/Hindi text and browser speech support, with simple explanations and read-aloud controls.
3. Practical assistance: document upload and viewing, educational EMI calculations, and editable grievance drafts with external official portal links.
4. Hardware access point: proposed touch display, microphone and speaker at a PACS, connected to a local inference host or secured cloud service.
5. Operator oversight: original issuers, document editions and jurisdiction notes remain visible. The system abstains when evidence is insufficient and labels generation failures as source-excerpt mode.

## Innovation and differentiation

The prototype combines verifiable page evidence with accessible conversational guidance and immediate next-step tools. Local inference avoids a paid cloud-model dependency and can keep typed queries within a centre's local infrastructure. A shared source library supports a human facilitator who can inspect the underlying document. Practical grievance drafting and loan cost explanations make the assistant useful beyond a question-and-answer screen.

These are design advantages of this implementation, not claims that no other solution has similar capabilities.

## Technology and feasibility

React/TypeScript responsive interface; FastAPI API; PyPDF page extraction; multilingual SentenceTransformer embeddings; SQLite and NumPy hybrid retrieval; local Ollama/Llama 3.2 3B; browser speech recognition and synthesis. The repository includes real reference PDFs, a source manifest, setup instructions and regression checks. A laptop hosts the current demonstration. A dedicated kiosk enclosure and hardware integration are proposed rather than completed.

## Expected features mapped to the prototype

| Requirement | Current evidence | Next stage |
|---|---|---|
| Multilingual conversation | English/Hindi answer control and Hindi query translation | Additional Indian languages with evaluated quality |
| Laws and bye-laws | Real PACS model bye-laws and page evidence | Verified state law and adopted society bye-law collections |
| Ministry schemes/services | Ministry annual report corpus | Operator-reviewed current scheme notifications |
| PMFBY/agricultural guidance | Operational guidelines corpus | State/season notification filters |
| Financial literacy | RBI reference and functioning EMI calculator | More contextual learning modules |
| Cooperative grievance support | Editable downloadable complaint draft and guidance | Authorized routing, filing and tracking integrations |
| Rural voice access | Browser STT and TTS controls | Offline speech and tested kiosk audio hardware |
| Mobile/web | Responsive browser interface | PWA/native integrations if field needs justify them |
| Software + hardware | Local-host architecture and kiosk plan | Physical kiosk assembly and field testing |
| Cloud component | Configurable API boundary and cloud pilot design | Secured hosted pilot; not deployed in this submission |

## Impact and evaluation plan

Measure answer evidence correctness, abstention on unsupported questions, Hindi comprehension, time to locate information, grievance draft completeness and user task completion. Pilot with a PACS facilitator and representative rural users; review legal/scheme content with a qualified domain expert. Do not publish unmeasured accuracy, cost savings, user counts or impact percentages.

## Attachments / fields to complete

- GitHub URL: use the pushed version containing this implementation, not an earlier commit.
- Demo video: follow `docs/DEMO_SCRIPT.md`; upload only after reviewing the recorded behavior.
- Team name, institute, members, mentor, leader and contact: fill with your actual information.
- Hardware evidence: accurately identify the demonstrated laptop/microphone/speaker setup and the proposed dedicated kiosk.
