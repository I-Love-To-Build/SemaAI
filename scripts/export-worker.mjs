import { getAdminClient } from "./supabase-admin.mjs";

const supabase = getAdminClient();
const { data: exports, error } = await supabase
  .from("export_manifests")
  .select("id,name,language_codes,domains,minimum_review_score,include_audio,status")
  .eq("status", "queued")
  .limit(10);

if (error) throw error;

let completed = 0;
for (const manifest of exports ?? []) {
  let query = supabase
    .from("translations")
    .select("id,language_code,text,status,corpus_items(text,domain,license)")
    .eq("status", "approved")
    .in("language_code", manifest.language_codes);

  const { data, error: itemError } = await query.limit(10000);
  if (itemError) throw itemError;

  const path = `exports/${manifest.id}.json`;
  const payload = JSON.stringify({ manifest, items: data ?? [] }, null, 2);
  const { error: uploadError } = await supabase.storage.from("exports").upload(path, payload, {
    contentType: "application/json",
    upsert: true
  });
  if (uploadError) throw uploadError;

  const { error: updateError } = await supabase
    .from("export_manifests")
    .update({ status: "completed", storage_path: path, item_count: data?.length ?? 0 })
    .eq("id", manifest.id);
  if (updateError) throw updateError;
  completed += 1;
}

console.log(`Export worker completed ${completed} manifests.`);
