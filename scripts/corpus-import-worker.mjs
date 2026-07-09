import { getAdminClient } from "./supabase-admin.mjs";

const requiredEnv = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = requiredEnv.filter((name) => !process.env[name]);

if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const supabase = getAdminClient();
const { data: imports, error } = await supabase
  .from("corpus_imports")
  .select("id,item_count,status")
  .eq("status", "queued")
  .limit(25);

if (error) throw error;

let completed = 0;
for (const item of imports ?? []) {
  const { error: updateError } = await supabase
    .from("corpus_imports")
    .update({ status: "completed" })
    .eq("id", item.id);

  if (updateError) throw updateError;
  completed += 1;
}

console.log(`Corpus import worker completed ${completed} imports.`);
