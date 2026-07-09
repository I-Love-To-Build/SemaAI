Sema AI Interpreter — Architecture overview

Purpose

- Build a production-ready, real-time AI interpreter for Kenyan languages with an offline-capable, edge-first architecture and a cloud-hybrid backend for heavy training and optional inference.

High-level goals

- Real-time, low-latency turn-by-turn interpretation between two people.
- Support Kiswahili ↔ English MVP, add 3 community languages in Phase 1 (configurable).
- On-device core inference for low-connectivity areas; optional cloud fallback for larger models and analytics.
- Privacy-first: local processing by default, explicit opt-in for data upload and human review.

Core components

1. Device / Client (mobile app or browser PWA)
   - UI: conversation stage, phrase demo, transcripts, sign-language support (future).
   - Local STT: lightweight on-device ASR model (Vosk, Whisper Tiny/Small on-device, or vendor SDK) when possible.
   - Local LID (language identification) to route to the correct translator model.
   - Local translation model or on-device quantized LLM for constrained languages.
   - Local TTS for spoken output (WebSpeech API in browser; on-device TTS engine on mobile).
   - WebSocket client for optional cloud-assisted inference, telemetry, and model sync.

2. Edge / Local Gateway (optional)
   - Small local server (Raspberry Pi / edge VPS) in clinics or schools to run heavier models for multiple devices.
   - Model caching, batching, privacy boundary.

3. Cloud Backend
   - Inference API: WebSocket + REST endpoints for real-time streams and batch jobs.
   - Model training and orchestration: ETL pipelines for collecting, cleaning, and retraining models.
   - Storage: encrypted object store for validated training data; metadata DB for utterances, versions, and audits.
   - Monitoring & analytics: latency, error rates, model drift, and human verification workflows.

Model choices (recommendation)

- STT (voice→text):
  - Phase 1: Use open Whisper Small/VAD for desktop/servers; evaluate Vosk or wav2vec2-family for on-device optimized models.
  - Explore vendor SDKs (Google Speech-to-Text, Azure Speech) for higher accuracy in-cloud during pilot.

- LID (language identification):
  - Small classifier trained on Kenyan languages (fast on-device model, e.g., lightweight CNN or tiny LLM classifier).

- Translation / Interpretation:
  - Hybrid approach: quantized small NMT or fine-tuned LLMs (e.g., Llama-family, MPT, Open-weights when licensing allows) for on-device inference using GGML/quantized runtimes.
  - Cloud larger LLMs for fallback and complex turns.

- TTS (text→voice):
  - Browser: Web Speech API for rapid demo.
  - Device: use on-device TTS (Android TTS, iOS AVSpeech) or neural TTS in cloud (Google/ElevenLabs) when allowed.

Data strategy

- Phase 0: Use curated bilingual phrases (existing PHRASES demo) and seed datasets from universities and community partners.
- Phase 1: Setup consented collection pipeline: local device stores encrypted audio + transcripts; user opt-in uploads to cloud for validation.
- Native-speaker validation dashboard for marking phrases verified/unverified.

Privacy & compliance

- Default to local processing and ephemeral local logs.
- Require explicit opt-in before any audio leaves the device.
- Collect minimal metadata; use encryption at rest and in transit.
- Keep an audit trail for dataset changes and verification status.

Immediate implementation plan (next 2–4 weeks)

1. Build minimal backend prototype (Node.js + Express + WebSocket) providing:
   - Health endpoint, WebSocket echo, and simple text-translation mock endpoint.
2. Add a thin client WebSocket integration to the current `index (3).html` to toggle between local demo mode and cloud-assisted mode.
3. Integrate browser STT proof-of-concept using `MediaRecorder` + cloud STT (optional) and `speechSynthesis` already present for TTS.
4. Create dataset schema and a minimal admin UI to review uploaded utterances.
5. Evaluate model providers and create a cost estimate (GPU hours, storage) for Phase 1.

Deliverables I'll create next (in priority order)

- `ARCHITECTURE.md` (this file)
- Minimal backend scaffold: `server/package.json`, `server/index.js` (WebSocket + REST)
- Client WebSocket glue in `index (3).html` (non-breaking, toggled by a query flag)
- `README.md` with local run instructions and choices for Phase 1

Questions / decisions needed from you

- Confirm Phase 1 community languages (default suggestion: Giriama, Pokomo, Kikuyu).
- Hosting preference: cloud-first (fast iteration) or edge-first (priority offline capability)?
- Any existing partners or datasets we should integrate immediately?

If you want, I'll scaffold the backend now and wire a WebSocket toggle into `index (3).html` so we have an end-to-end local prototype to iterate on.