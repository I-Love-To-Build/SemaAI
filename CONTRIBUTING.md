# Contributing to Sema AI

Sema AI is building Kenyan language data infrastructure for translation, transcription, speech, review, and client-facing AI services. Contributions should protect data quality, community trust, consent, and production reliability.

## How We Work

1. Create an issue before large changes.
2. Work from a feature branch, not directly on `main`.
3. Keep pull requests small enough to review well.
4. Include tests or a clear verification note.
5. Do not commit secrets, `.env.local`, credentials, private datasets, raw contributor audio, or personal data.

## Branch Naming

- `feature/<short-name>` for new functionality
- `fix/<short-name>` for bug fixes
- `docs/<short-name>` for documentation
- `data/<short-name>` for corpus/import scripts or schema work
- `ops/<short-name>` for deployment, CI, monitoring, or infrastructure

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Before opening a pull request:

```bash
npm run build
npm run check:prod
```

## Pull Request Standard

Every PR should explain:

- what changed,
- why it matters,
- how it was tested,
- whether database migrations are required,
- whether user data, consent, audio, review, or model outputs are affected.

## Data And AI Safety

Language data is not just content. It can carry identity, dialect, region, consent, and community rights. Any change touching corpus, audio, reviews, exports, model releases, or client APIs must preserve:

- provenance,
- consent,
- review trail,
- auditability,
- language/dialect metadata,
- export restrictions,
- privacy and security boundaries.

## Review Expectations

At least one maintainer review is required before merging. Changes touching schema, auth, storage, review logic, model releases, or client APIs should receive a deeper review from the project owner or a designated technical lead.
