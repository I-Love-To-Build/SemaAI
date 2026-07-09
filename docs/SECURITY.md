# Security Notes

## Secrets

- Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser code.
- Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` may be public.
- Rotate service keys after any accidental local sharing.

## API Rules

- Contributor routes require a `Bearer` token.
- Admin routes require `ops_admin` or `language_lead` role records.
- API writes attach the authenticated user id on the server.
- High-risk actions write to `audit_events`.
- Rate limiting is implemented in-process for local protection; production should use an edge or hosted rate limiter.

## Data Rules

- Audio stays in private storage.
- Consent is required before recording metadata is accepted.
- Export jobs must include consent, license, review, and provenance checks.
- PII detection must run before release.
- Contributor withdrawal must be handled before public/open release.

## Required Production Tests

- RLS policy tests for every role.
- Signed upload tests.
- Corpus import abuse tests.
- Review escalation tests.
- Export leakage tests.
- Browser microphone permission tests.
