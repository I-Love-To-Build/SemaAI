# User Testing Plan

Use this checklist before public contributor onboarding.

## Devices

- Android phone, low-end.
- Android phone, modern.
- iPhone Safari.
- Windows laptop Chrome.
- Slow mobile network throttling.

## Flows

- Sign up.
- Sign in.
- Save profile, consent, and speaker metadata.
- Claim translation tasks.
- Submit translation.
- Search corpus.
- Grant reviewer role to a test user.
- Load review queue.
- Approve and reject work.
- Allow microphone permission.
- Deny microphone permission.
- Record audio.
- Preview audio.
- Upload audio to Supabase Storage.
- Refresh browser and confirm session/task state.

## Failure Cases

- Offline before submit.
- Slow upload.
- Expired session.
- Wrong role for review queue.
- Missing consent before audio submit.
- Very short recording.
- Large audio file.

## Acceptance

- No text overlap on mobile.
- All forms show clear error states.
- No service role key appears in browser.
- Audio files land in the private `recordings` bucket.
- Reviews create audit events.
- Export jobs only include approved data.
