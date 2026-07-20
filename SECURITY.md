# Security Policy

Do not open public issues for vulnerabilities, exposed keys, private user data, contributor audio, or access-control bypasses.

## Report Privately

Contact the project owner directly with:

- affected route, file, or service,
- steps to reproduce,
- impact,
- screenshots or logs with secrets removed,
- suggested fix if known.

## Sensitive Data Rules

Never commit:

- `.env.local`,
- Supabase service-role keys,
- GitHub tokens,
- Vercel tokens,
- raw contributor audio,
- private corpus files,
- personally identifiable contributor data,
- client API keys.

## Supported Branch

Security fixes target `main` unless a release branch is created.

See also `docs/SECURITY.md`.
