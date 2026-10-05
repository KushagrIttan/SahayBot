# PACS touch-and-voice kiosk — hardware plan

PS26088 is categorized as Hardware with a Software + Hardware proposed mode. The current demonstrable component is working software running on a laptop. A dedicated assembled kiosk is **not** claimed.

## Proposed arrangement

```text
Touchscreen / accessible browser
          │
USB microphone ─┐
Speaker / headset ── Kiosk terminal / laptop
          │                 │
          └──────── Local network / same host
                            │
                    FastAPI + local model host
                            │
                 Operator-managed PDF corpus
```

For a low-cost pilot, use an existing PACS desktop/laptop, external microphone, speaker and monitor. For a standalone enclosure, a practical starting configuration is an x86 mini-PC with 16 GB RAM and an SSD, a touch display, USB microphone, speaker/headset and UPS. This is a proposed bill of materials, not a tested performance specification or vendor quote. Benchmark the selected hardware before purchase. A small ARM terminal may serve the interface while a centre's more capable host runs inference; do not promise 3B-model performance on an untested Raspberry Pi.

## Demonstration today

- Show the application on the actual laptop being used.
- Demonstrate typed English/Hindi questions and real PDF citations.
- Test microphone permission, speech recognition and installed TTS voices before recording.
- If a microphone/speaker is used, show the actual hardware; do not use stock footage as proof of an assembled device.
- Mobile browser demonstration is possible on the same trusted Wi-Fi. Use HTTPS for microphone access off localhost.

## Field design requirements

Large readable controls, facilitator mode, headphone option for privacy, clear recording indicator, language choice, accessible kiosk height, lockable enclosure, power backup and a reset between users. Clear browser conversation history after each kiosk session. Maintain an operator-approved corpus with review dates; do not allow public users to silently overwrite the centre's authoritative documents.

## Optional cloud architecture

An authenticated cloud service can distribute reviewed PDF updates and serve inference where a local host is impractical. Keep secrets on the server, use HTTPS, authenticate operators, restrict uploads and isolate users. Sync/versioning, remote fleet management and a cloud deployment remain planned extensions. Core local typed guidance can run without a cloud LLM after the models and corpus are downloaded; browser voice recognition may still require connectivity.

## Next milestone

Assemble one physical kiosk, benchmark actual inference and speech latency, test in noisy conditions, and run a facilitator-assisted pilot. Report observed results rather than claiming unmeasured reach or performance.
