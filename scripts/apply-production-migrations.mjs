import { readFile } from "node:fs/promises";

const migrations = [
  "supabase/client_platform_migration.sql",
  "supabase/quality_hardening_migration.sql",
  "supabase/production_features_migration.sql"
];

const projectRef = process.env.SUPABASE_PROJECT_REF || "kzljvryviywivprdwsin";

async function loadEnvFile() {
  try {
    const envText = await readFile(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of envText.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {
    // The shell may already provide the required environment variables.
  }
}

async function applySql(file, token) {
  const query = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ query })
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${file} failed (${response.status}): ${text}`);
  }
  console.log(`Applied ${file}`);
}

await loadEnvFile();

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  throw new Error("Missing SUPABASE_ACCESS_TOKEN. Add it to .env.local or the shell before running migrations.");
}

for (const migration of migrations) {
  await applySql(migration, token);
}

console.log("All production migrations applied.");
