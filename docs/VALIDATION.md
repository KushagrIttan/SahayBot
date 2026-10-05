# Submission prototype validation

Validated on 5 October 2026 using the supplied workspace and local Ollama installation. This supersedes the runtime findings in the historical AUDIT.md. It is a prototype check, not a legal accuracy certification or a field pilot.

## Passed checks

- Frontend TypeScript checks and production build pass.
- Backend module compilation and installed dependency checks pass.
- Eleven isolated regression tests pass: upload/inventory/PDF serving, repeated upload idempotency, version replacement, deletion and chunk removal, path traversal/invalid PDF rejection, image-only PDF rejection, 15 MB limit, empty-library/input validation, no-evidence abstention, recovery after database loss, failed replacement preserving the old version, exact premium table continuation, and generation-failure labeling. Some scenarios are combined in one test.
- Four bundled PDF hashes match the recorded manifest. The local index contains 1,285 chunks across 492 PDF pages; page count includes introductory/blank pages.
- Real backend + Ollama smoke queries returned PACS services, PMFBY grievance guidance, membership guidance and financial literacy explanations.
- PMFBY premium questions in English and Hindi return a dynamically extracted table from pages 47–48 with correct season/crop grouping and continuation text. Values are read from the PDF, not stored as answer constants. Table cells receive interface translations in Hindi without altering numerical values.
- An unrelated spaceship launch-code question returned an abstention with no sources.
- A separate Hindi PACS services question returned a generated Hindi answer with real retrieved pages. Translation wording remains imperfect in places and needs domain review.

Recorded examples: [demo-results.json](validation/demo-results.json) and [additional-results.json](validation/additional-results.json). These are recorded outputs of real API calls, not canned responses used by the app. Ordinary generation in the final checks took approximately 5–21 seconds; the English table response took under a second after model warm-up. Host-specific results are not performance promises.

## Browser checks

- Actual library count and corpus metadata displayed.
- English/Hindi interface toggled correctly.
- Real premium response and its extracted table displayed.
- Source citation opened a preview with the actual passage and original PDF endpoint/page link.
- Reducing-balance calculator displayed about ₹4,614/month for ₹1,00,000 at 10% over 24 months; zero-interest input displayed about ₹4,167/month and ₹0 interest.
- Fictional grievance details produced an editable draft explicitly labeled as unsubmitted.
- Desktop and narrow/mobile viewports inspected; main body width did not overflow the viewport. Wide source tables scroll within their container.
- Microphone and read-aloud controls are implemented; a human must test actual microphone capture and audible Hindi playback on the recording browser/OS. Browser support, permissions and installed voices vary.

Screenshots in [screenshots/](screenshots/) document actual UI views. They are not evidence of a physical assembled kiosk.

## Fixed audit defects

The active UI no longer uses seed legal PDFs, hardcoded legal replies, renamed dummy sources, random relevance percentages, pretend reranking/configuration or fake progress. Voice output is restored. Uploads use safe names, staged parsing, explicit limits and transactional file-scoped index replacement. Original PDF serving and source viewing work. The API uses POST for the current chat flow and a configurable same-origin development proxy. Conversation history is stored in the current browser; short follow-up questions use recent conversational context for retrieval.

Legacy backup files and old Chroma folders remain untouched as historical snapshots. The runtime uses the new SQLite knowledge base. User uploads and the generated DB are excluded from Git.

## Deliberate boundaries

- Physical kiosk hardware, enclosure/audio field testing and a cloud-hosted pilot remain proposed.
- Grievance support prepares a draft and links to external portals; no filing or tracking integration exists.
- English and Hindi are implemented; other languages, OCR and offline speech recognition are future work.
- There is no public-service authentication, account isolation or production abuse protection. Run the prototype locally or on a trusted demo network. Add these controls before public write access.
- Reference editions are displayed, but the system does not automatically check amended laws, current state notifications or deadlines. Model bye-laws are not state-specific adopted rules.
- Small-model summaries and translation may omit qualifications or phrase terms awkwardly. Original evidence is available for checking. Exact table extraction removes the observed premium-table synthesis error, but does not certify every generated answer.
- No SIH portal submission, video recording/upload or actual hardware purchase has been performed.
