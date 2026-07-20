# GitHub Collaboration Setup

Use this checklist after inviting developers.

## Invite Collaborators

GitHub repo -> **Settings** -> **Collaborators and teams** -> **Add people**.

Recommended access:

- trusted technical lead: **Maintain**
- regular developer: **Write**
- external reviewer: **Triage** or **Read**

Avoid giving **Admin** unless the person must manage repo settings, secrets, billing, or destructive configuration.

## Protect `main`

GitHub repo -> **Settings** -> **Branches** -> **Add branch protection rule**.

Set branch name pattern:

```text
main
```

Recommended rules:

- require a pull request before merging,
- require approvals,
- dismiss stale approvals when new commits are pushed,
- require status checks to pass,
- require branches to be up to date before merging,
- require conversation resolution,
- block force pushes,
- block deletions.

Required status checks:

- `build`

## Recommended Workflow

1. Developer creates a branch.
2. Developer opens a pull request.
3. CI runs `npm ci`, `npm run check:prod`, `npm run build`, and audit.
4. Maintainer reviews.
5. PR merges into `main`.
6. Vercel deploys from `main`.

## Secrets

GitHub repo -> **Settings** -> **Secrets and variables** -> **Actions**.

Only add secrets needed by CI. Do not expose Supabase service-role keys to pull requests from forks.

## Labels

Recommended labels:

- `bug`
- `feature`
- `frontend`
- `backend`
- `database`
- `audio`
- `review`
- `admin`
- `client-api`
- `security`
- `production-readiness`
- `good first issue`
- `needs decision`
