# Production Readiness

This checklist is for the engineering team, not portal end users.

## Launch Gates

- Supabase project created for staging and production.
- `supabase/schema.sql` applied and `supabase/seed_languages.sql` seeded.
- Supabase Auth email confirmation enabled and production Site URL set to the Vercel domain.
- Password recovery redirect URLs allow the production and preview domains.
- CAPTCHA and Supabase Auth rate limits configured before public registration.
- Service role key stored only as a server-side secret.
- Storage buckets `recordings` and `exports` created as private buckets.
- API routes tested with contributor, reviewer, language lead, and ops admin tokens.
- Row-level security tested per role before any contributor data is collected.
- Audio uploads tested with signed upload URLs and max-size rejection.
- Corpus import tested with duplicate, PII, license, and malformed-row cases.
- Review consensus tested with agreement, disagreement, escalation, and rejection cases.
- Export manifests tested for approved-only content and consent coverage.
- Monitoring enabled for API failures, upload failures, worker failures, backlog age, and export jobs.
- Transactional email uses a custom SMTP provider with SPF, DKIM, and DMARC.
- Public terms, privacy notice, consent text, retention periods, and account deletion process reviewed.
- Backups and disaster recovery tested.

## External Services Required

- Supabase Auth, Postgres, and Storage.
- Queue runner for corpus import, audio QA, and export jobs.
- Search index for million-scale corpus filtering.
- Error monitoring and uptime checks.
- Deployment target such as Vercel, Fly.io, Render, or a managed Node host.

## Definition Of Done

The portal is production-ready only when:

- users authenticate,
- tasks persist in the database,
- audio files upload to private storage,
- reviews require real role permissions,
- all exported data has consent and provenance,
- production checks pass in CI,
- staging has been tested with realistic contributor traffic.

## Current Operational Actions

The application code cannot complete these provider-side controls. An operator must:

- rotate any Supabase service-role key that has appeared outside a secret store;
- set the Supabase Auth Site URL to `https://sema-ai-theta.vercel.app`;
- add `https://sema-ai-theta.vercel.app/**` to Supabase Auth redirect URLs;
- configure custom SMTP, CAPTCHA, and production Auth rate limits;
- connect distributed rate limiting, error monitoring, uptime alerts, and worker scheduling;
- run role-based RLS tests and recovery drills against a staging project;
- complete mobile, microphone, slow-network, and accessibility testing with real contributors.
