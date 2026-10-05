# SahayBot demo video guide

Target: approximately 3 minutes. Record the actual working application; the outline below is narration guidance, not a fabricated transcript. Run through once before recording. Keep another terminal ready with `curl http://127.0.0.1:8000/health`.

## Preparation

1. Run `./scripts/run_demo.sh` with Ollama already running.
2. Open localhost:5173 in Chrome; verify four real reference documents and local AI connected.
3. Test a suggested question once to warm up the model. Clear the conversation afterward.
4. Check microphone permission and a suitable Hindi TTS voice. If either is unavailable, state the browser dependency rather than faking audio.
5. Have a real, text-containing additional PDF ready for the upload segment. An uploaded copy with a distinct name can demonstrate indexing, but identify it as a copy. Never present a generated sample policy as actual law.

## 0:00–0:20 — problem and concept

“Cooperative members and farmers need guidance they can understand and verify. SahayBot brings cooperative services, crop insurance and grievance guidance into an English and Hindi interface. This is our working software prototype for SIH26088, designed for a PACS touch-and-voice kiosk.”

Show the real laptop/setup. Describe a standalone kiosk as proposed hardware, not assembled hardware.

## 0:20–0:45 — actual corpus

Open Source library. Show PACS model bye-laws, Ministry annual report, PMFBY guidelines and the RBI reference. Open a PDF. Mention that the document edition and applicable state rules matter.

## 0:45–1:20 — grounded question and evidence

Ask “What are the farmer premium rates under PMFBY?” Wait for the actual response. Open a citation and show the original page. Explain that references are retrieved from the corpus, with no invented confidence percentages.

If a model answer appears incorrect, do not record it as correct. Check the original PDF and use the source evidence while reporting the limitation.

## 1:20–1:45 — Hindi and voice

Switch to Hindi. Ask “प्रधानमंत्री फसल बीमा योजना में किसान को कितना प्रीमियम देना होता है?” by microphone if supported, otherwise type it. Play the answer using Read aloud. Mention that browser speech recognition may use its provider's servers while text inference is local.

## 1:45–2:10 — new PDF workflow

Upload a real readable PDF. Show indexing completion, actual page count and the library entry. Select that PDF in Search scope and ask a fact answered in it. Open the resulting source. This demonstrates document-specific retrieval rather than a prepared canned answer.

## 2:10–2:30 — financial literacy

Open Financial literacy. Change amount, annual rate and months. Show the monthly EMI and total interest. Explain that this is an educational estimate excluding lender fees.

## 2:30–2:50 — grievance support

Use clearly fictional demo details. Prepare a complaint draft, edit it and download the text. State “This prepares a draft; it does not claim to submit or track a grievance.” Show official portal links and the PMFBY process question.

## 2:50–3:10 — boundaries and next steps

Show the mobile layout if practical. Explain the planned physical kiosk, additional languages, verified state laws, offline speech and authorized grievance integration. End on the repository link containing the tested implementation.

## Recording notes

Use a screen recorder available on your laptop (OBS or the system recorder). Record at a readable resolution and include voice narration. Do not expose real personal complaints, identifiers or other people's chat history. The GitHub docs/validation folder contains repeatable smoke-test results; latency on your recording machine may differ.
