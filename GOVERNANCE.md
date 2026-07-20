# Project Governance

Sema AI uses a maintainer-led workflow while the project is young. The goal is to move fast without weakening data quality, consent, or community trust.

## Roles

- **Owner**: final decision maker for product direction, access, releases, and repository settings.
- **Maintainer**: can review and merge pull requests in assigned areas.
- **Reviewer**: can review code or data workflows but does not merge without maintainer approval.
- **Contributor**: opens issues and pull requests.

## Protected Areas

Changes in these areas need extra review:

- authentication and role access,
- Supabase schema and RLS,
- audio upload/recording/storage,
- contributor consent and speaker metadata,
- review and reputation logic,
- export manifests and model releases,
- client APIs and API-key handling,
- production deployment and monitoring.

## Decision Rules

1. User safety and consent beat speed.
2. Reviewed data beats large unverified data.
3. Community governance matters for low-resource and endangered languages.
4. Production changes need tests or a clear verification trail.

## Release Rules

Do not mark a model, dataset, or client API as production-ready until the release has:

- approved data,
- provenance,
- review history,
- evaluation results,
- rollback path,
- monitoring,
- documented limitations.
