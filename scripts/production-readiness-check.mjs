import { readFileSync, existsSync } from "node:fs";

const requiredFiles = [
  "app/api/profile/route.ts",
  "app/api/dashboard/route.ts",
  "app/api/admin/overview/route.ts",
  "app/api/vocabulary/route.ts",
  "app/api/missions/route.ts",
  "app/api/language-metrics/route.ts",
  "app/api/provenance/route.ts",
  "app/api/reputation/route.ts",
  "app/api/client/translate/route.ts",
  "app/api/client/transcribe/route.ts",
  "app/api/client/voice/route.ts",
  "app/admin/admin-portal.tsx",
  "app/reviewer/reviewer-portal.tsx",
  "app/clients/page.tsx",
  "app/intelligence/page.tsx",
  "app/missions/page.tsx",
  "app/governance/page.tsx",
  "app/contribute/page.tsx",
  "app/vocabulary/page.tsx",
  "app/validate/page.tsx",
  "app/my-work/page.tsx",
  "app/languages/page.tsx",
  "app/profile/page.tsx",
  "app/api/consent/route.ts",
  "app/api/speaker-profiles/route.ts",
  "app/api/tasks/claim/route.ts",
  "app/api/storage/signed-upload/route.ts",
  "app/api/translations/route.ts",
  "app/api/recordings/route.ts",
  "app/api/reviews/route.ts",
  "app/api/reviews/queue/route.ts",
  "app/api/exports/route.ts",
  "app/api/corpus/search/route.ts",
  "app/api/monitoring/route.ts",
  "app/contributor-app.tsx",
  "lib/api.ts",
  "lib/browser-supabase.ts",
  "lib/env.ts",
  "supabase/schema.sql",
  "supabase/seed_languages.sql",
  "supabase/seed_corpus.sql",
  "scripts/audio-qa-worker.mjs",
  "scripts/corpus-import-worker.mjs",
  "scripts/export-worker.mjs",
  "scripts/model-release-worker.mjs",
  "scripts/apply-production-migrations.mjs",
  "scripts/seed-pilot-corpus.mjs",
  "scripts/load-test.mjs",
  "scripts/seed-live-corpus.mjs",
  "vercel.json",
  "docs/PRODUCTION_READINESS.md",
  "docs/GITHUB_COLLABORATION.md",
  "docs/USER_TESTING.md"
];

const forbiddenPortalWords = ["prototype", "scaffold", "blueprint", "modeled"];
const failures = [];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    failures.push(`Missing required file: ${file}`);
  }
}

const languageSource = readFileSync("lib/languages.ts", "utf8");
const languageCount = (languageSource.match(/\{ code: /g) || []).length;
if (languageCount !== 68) {
  failures.push(`Expected 68 languages in lib/languages.ts, found ${languageCount}`);
}

const seedSource = readFileSync("supabase/seed_languages.sql", "utf8");
const seedCount = (seedSource.match(/\('[^']+',/g) || []).length;
if (seedCount !== 68) {
  failures.push(`Expected 68 language seed rows, found ${seedCount}`);
}

const portalSource = readFileSync("sema_contributor_portal (2).html", "utf8").toLowerCase();
for (const word of forbiddenPortalWords) {
  if (portalSource.includes(word)) {
    failures.push(`Portal still contains builder-facing word: ${word}`);
  }
}

const schema = readFileSync("supabase/schema.sql", "utf8");
for (const requiredSql of [
  "create table task_claims",
  "create table missions",
  "create table contributor_reputation",
  "create table language_metrics",
  "create table training_jobs",
  "create table client_api_keys",
  "create table model_releases",
  "alter table task_claims enable row level security",
  "alter table missions enable row level security",
  "alter table contributor_reputation enable row level security",
  "alter table language_metrics enable row level security",
  "contributors upload own recordings",
  "contributors create own profile",
  "reviewers create reviews",
  "create table audit_events"
]) {
  if (!schema.includes(requiredSql)) {
    failures.push(`Schema missing: ${requiredSql}`);
  }
}

const envExample = readFileSync(".env.example", "utf8");
for (const key of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SEMA_AUDIO_BUCKET",
  "SEMA_EXPORT_BUCKET"
]) {
  if (!envExample.includes(key)) {
    failures.push(`.env.example missing ${key}`);
  }
}

if (/eyJ[a-zA-Z0-9_-]{20,}\./.test(envExample)) {
  failures.push(".env.example contains a JWT-like secret");
}

const contributorApp = readFileSync("app/contributor-app.tsx", "utf8");
for (const requiredAuthCapability of [
  "signUp",
  "signInWithPassword",
  "resetPasswordForEmail",
  "supabase.auth.resend",
  "emailRedirectTo",
  "contributor_terms_accepted",
  "Confirm password"
]) {
  if (!contributorApp.includes(requiredAuthCapability)) {
    failures.push(`Authentication experience missing: ${requiredAuthCapability}`);
  }
}

const taskClaimRoute = readFileSync("app/api/tasks/claim/route.ts", "utf8");
for (const requiredTaskGuard of [
  "activeClaims",
  "unavailableContributionStatusFilter",
  "parsed.data.refresh",
  "recordings"
]) {
  if (!taskClaimRoute.includes(requiredTaskGuard)) {
    failures.push(`Task refill/no-repeat guard missing: ${requiredTaskGuard}`);
  }
}

const adminPortal = readFileSync("app/admin/admin-portal.tsx", "utf8");
for (const requiredAdminSurface of ["Mission controls", "Governance and trust", "Refresh language metrics"]) {
  if (!adminPortal.includes(requiredAdminSurface)) {
    failures.push(`Admin control missing: ${requiredAdminSurface}`);
  }
}

const packageJson = readFileSync("package.json", "utf8");
for (const requiredScript of ["migrate:all", "seed:pilot-corpus", "worker:model-release", "load:test"]) {
  if (!packageJson.includes(requiredScript)) {
    failures.push(`package.json missing script: ${requiredScript}`);
  }
}

const nextConfig = readFileSync("next.config.mjs", "utf8");
for (const requiredHeader of [
  "Content-Security-Policy",
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Referrer-Policy",
  "Permissions-Policy"
]) {
  if (!nextConfig.includes(requiredHeader)) {
    failures.push(`Security headers missing: ${requiredHeader}`);
  }
}

if (failures.length) {
  console.error("Production readiness check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Production readiness check passed.");
console.log(`Verified ${languageCount} languages, API surfaces, schema guards, storage policies, and portal copy hygiene.`);
