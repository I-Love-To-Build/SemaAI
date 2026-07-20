import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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

function getSqlFile() {
  const fileArg = process.argv.find((arg) => arg.startsWith("--file="));
  if (!fileArg) throw new Error("Missing --file=path/to/migration.sql");
  return resolve(process.cwd(), fileArg.slice("--file=".length));
}

async function main() {
  await loadEnvFile();
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Missing SUPABASE_ACCESS_TOKEN. Add it to your shell or .env.local before running this migration.");
  }

  const query = await readFile(getSqlFile(), "utf8");
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
    throw new Error(`Supabase SQL failed (${response.status}): ${text}`);
  }

  console.log(text || "Supabase SQL applied.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
