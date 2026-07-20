import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

function readEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function parseArgs() {
  const args = new Map();
  for (const item of process.argv.slice(2)) {
    const [key, ...rest] = item.replace(/^--/, "").split("=");
    args.set(key, rest.join("=") || "true");
  }
  return {
    name: args.get("name") || "Pilot Client",
    sector: args.get("sector") || "pilot",
    billingEmail: args.get("billing-email") || "",
    scopes: (args.get("scopes") || "translation,speech_to_text,text_to_speech,dataset").split(",").map((scope) => scope.trim()).filter(Boolean),
    plan: args.get("plan") || "pilot",
    quota: Number(args.get("quota") || 100000)
  };
}

function makeApiKey() {
  return `sk_sema_${crypto.randomBytes(24).toString("base64url")}`;
}

async function main() {
  const envPath = new URL("../.env.local", import.meta.url);
  try {
    const envText = await import("node:fs/promises").then((fs) => fs.readFile(envPath, "utf8"));
    for (const line of envText.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {
    // Environment variables may already be provided by the shell.
  }

  const input = parseArgs();
  const supabase = createClient(readEnv("NEXT_PUBLIC_SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const slug = slugify(input.name);
  const { data: organization, error: orgError } = await supabase
    .from("client_organizations")
    .upsert({
      name: input.name,
      slug,
      sector: input.sector,
      billing_email: input.billingEmail || null,
      status: "trial"
    }, { onConflict: "slug" })
    .select("id,name,slug")
    .single();

  if (orgError) throw orgError;

  for (const scope of input.scopes) {
    const { error } = await supabase
      .from("client_service_subscriptions")
      .upsert({
        organization_id: organization.id,
        service_type: scope,
        plan: input.plan,
        status: "trial",
        monthly_quota: input.quota
      }, { onConflict: "organization_id,service_type" });
    if (error) throw error;
  }

  const apiKey = makeApiKey();
  const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
  const { error: keyError } = await supabase.from("client_api_keys").insert({
    organization_id: organization.id,
    name: `${input.name} production key`,
    key_hash: keyHash,
    prefix: apiKey.slice(0, 14),
    scopes: input.scopes,
    status: "active"
  });

  if (keyError) throw keyError;

  console.log(JSON.stringify({
    organization,
    scopes: input.scopes,
    apiKey,
    warning: "Store this key now. It is not recoverable from the database."
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
