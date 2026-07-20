# Sema Contributor Platform

Sema is a Kenyan language contribution platform for text, speech, transcription, review, rewards, and export governance.

The old single-file prototype is still available at `sema_contributor_portal (2).html`. The production app now lives in the Next.js app folders:

- `app/` contains the contributor command surface and API routes.
- `lib/` contains language coverage, product modules, validation contracts, and Supabase access.
- `supabase/schema.sql` contains the production database baseline.
- `scripts/` contains worker entrypoints for corpus ingestion and audio QA.

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` from `.env.example` and fill Supabase credentials.

3. Apply `supabase/schema.sql`, then `supabase/seed_languages.sql`, in Supabase SQL editor or your migration pipeline.

4. Run the app:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:3000`.

## Collaboration

Developers should not push directly to `main`. Use feature branches and pull requests.

- Read `CONTRIBUTING.md` before opening a PR.
- Use the GitHub issue templates for bugs, feature requests, and data-quality concerns.
- Use `docs/GITHUB_COLLABORATION.md` to invite collaborators, protect `main`, and configure repo rules.
- CODEOWNERS is configured in `.github/CODEOWNERS` so sensitive areas get owner review.

Recommended flow:

```bash
git checkout -b feature/my-change
npm run build
npm run check:prod
git push origin feature/my-change
```

Then open a pull request into `main`.

## Production Checklist

- Connect Supabase Auth and role assignment.
- Apply row-level security policies and test them per role.
- Add object storage upload signing for recordings and exports.
- Connect queue infrastructure for corpus import and audio QA workers.
- Add reviewer assignment, golden tasks, and expert adjudication screens.
- Add payout provider integration for the reward ledger.
- Add monitoring for API errors, worker failures, review backlog, and export runs.
- Run accessibility, mobile, browser, load, and security tests before public launch.
- Run `npm run check:prod` in CI before deploys.
- Review `docs/PRODUCTION_READINESS.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, and `docs/USER_TESTING.md` before launch.
- Seed launch corpus items with `npm run seed:corpus`.
- Grant operator roles with `node scripts/grant-role.mjs <email> <role> [languageCode]`.

## Data Standard

Every contribution should carry:

- contributor identity and role,
- language and dialect,
- source and license,
- consent,
- device and environment metadata for audio,
- review decisions and scores,
- audit trail,
- export manifest history.
