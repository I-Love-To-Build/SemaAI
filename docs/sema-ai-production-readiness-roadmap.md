# Sema AI Production Readiness Roadmap

This roadmap tracks what Sema AI must complete to move from a contributor portal into dependable Kenyan language AI infrastructure.

## 1. Real Corpus Scale

**Goal:** Build millions of clean, licensed, deduplicated, domain-balanced source items.

**Why it matters:** Millions of random words are not enough. The corpus must cover health, education, finance, agriculture, public services, emergency response, culture, daily speech, commerce, transport, law, and long-tail vocabulary.

**Next work:**
- Import licensed words, phrases, sentences, terms, idioms, proverbs, and public-service language.
- Store source, license, domain, difficulty, unit type, and provenance on every item.
- Deduplicate aggressively before assigning work to contributors.
- Track coverage by domain and language, not only total item count.

## 2. Real Kenyan Language Coverage

**Goal:** Support 68 Kenyan languages with community-validated data.

**Why it matters:** Kiswahili has more digital data, but languages such as Giriama, Pokomo, Taita, El Molo, Yaaku, Dahalo, and others need community-led collection and review.

**Next work:**
- Appoint language leads for low-resource communities.
- Measure per-language text, audio, review, and approval coverage.
- Support dialect and regional metadata.
- Avoid treating all languages as equally resourced.

## 3. Human Review Depth

**Goal:** Build a trust system that protects dataset quality.

**Why it matters:** Contributors can submit mistakes, spam, machine-translated text, poor recordings, or unfair reviews. Production datasets need review discipline.

**Next work:**
- Use reviewer tiers: contributor, reviewer, expert, language lead, operations admin.
- Require consensus before work becomes release-ready.
- Add dispute and escalation flows.
- Sample approved work for audits.
- Track reviewer reputation and accuracy.

## 4. Audio Reliability

**Goal:** Make recording and upload reliable across mobile and desktop.

**Why it matters:** Speech data needs speaker metadata, consent, noise checks, clipping checks, accent/dialect balance, transcription, alignment, and review.

**Next work:**
- Keep live recording and device-upload fallback.
- Run audio QA on every upload.
- Show waveform, duration, and playback before submission.
- Track microphone/device failures.
- Provide mobile-first retry and support flows.

## 5. ML Training Infrastructure

**Goal:** Connect collected data to real translation, speech-to-text, and text-to-speech training.

**Why it matters:** The portal collects data. Production AI requires GPU training, model checkpoints, evaluation gates, inference endpoints, latency controls, rollback, and versioning.

**Next work:**
- Connect the model release worker to a real training service.
- Store model checkpoints and evaluation reports.
- Require automatic evaluation before publishing.
- Register production endpoint URLs in model releases.
- Monitor latency, cost, and failure rates.

## 6. Client-Ready Services

**Goal:** Let organizations safely use trained Sema services.

**Why it matters:** Clients need stable APIs, access controls, usage limits, billing, logs, and service expectations.

**Next work:**
- Issue API keys per organization.
- Connect translation, transcription, TTS, and voice APIs to published models.
- Add usage limits and client logs.
- Build client dashboards.
- Define SLAs and support workflows.

## 7. Data and Legal Trust

**Goal:** Protect consent, licensing, privacy, provenance, and export rights.

**Why it matters:** Language data is sensitive. Contributors and communities must trust how their data is used.

**Next work:**
- Attach consent records to recordings and speaker profiles.
- Attach license/provenance to every source item.
- Block exports when rights metadata is missing.
- Add takedown and correction workflows.
- Keep audit trails for imports, reviews, exports, and model releases.

## 8. Operations

**Goal:** Make the platform dependable under real usage.

**Why it matters:** Production readiness includes boring but essential infrastructure: backups, monitoring, alerts, incident response, rate limits, abuse detection, security review, and load testing.

**Next work:**
- Connect alert events to an external monitoring service.
- Run scheduled backups.
- Run load tests for thousands of contributors.
- Add incident response playbooks.
- Review security, storage, and API access policies.

## 9. Evidence

**Goal:** Prove that Sema works and is worth funding or buying.

**Why it matters:** Investors and clients need evidence, not only ambition.

**Next work:**
- Track active contributors.
- Track languages covered.
- Track approved translations and audio hours.
- Track review accuracy and disagreement rates.
- Track model quality scores.
- Track cost per accepted contribution.
- Track client willingness to pay and pilot outcomes.

