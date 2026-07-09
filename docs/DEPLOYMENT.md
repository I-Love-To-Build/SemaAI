# Deployment

Use this for the production host setup.

## Required Environment Variables

Set these in Vercel or the hosting provider:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SEMA_AUDIO_BUCKET=recordings
SEMA_EXPORT_BUCKET=exports
SEMA_SEARCH_URL=
SEMA_SEARCH_ADMIN_KEY=
```

Only the two `NEXT_PUBLIC_*` values are browser-safe. Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only.

## Vercel

1. Create a new Vercel project from this repo.
2. Add all environment variables above in Project Settings.
3. Deploy.
4. Run:

   ```bash
   npm run check:prod
   npm run build
   ```

5. After first deploy, test:

   - signup,
   - profile save,
   - task claim,
   - translation submit,
   - audio upload,
   - review queue with reviewer role.

## Worker Hosting

The Next app is not enough by itself for background processing. Schedule these commands on a worker host or cron runner:

```bash
npm run worker:import
npm run worker:audio-qa
npm run worker:export
```

Recommended cadence:

- import worker: every 5 minutes,
- audio QA worker: every 2 minutes,
- export worker: manually or every 15 minutes for queued manifests.

## Role Bootstrap

After signing up in the app, grant yourself admin access locally:

```bash
node scripts/grant-role.mjs your@email.com ops_admin
node scripts/grant-role.mjs your@email.com reviewer
node scripts/grant-role.mjs your@email.com language_lead sw
```

## Corpus Seed

Seed launch tasks:

```bash
npm run seed:corpus
```
