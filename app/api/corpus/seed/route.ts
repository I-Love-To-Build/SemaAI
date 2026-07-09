import { NextResponse } from "next/server";
import { auditEvent, checkRateLimit, jsonError, requireRole } from "@/lib/api";

const seedItems = [
  ["en", "Where is the nearest hospital?", "health"],
  ["en", "I need clean drinking water.", "health"],
  ["en", "The child has a fever.", "health"],
  ["en", "How much is the fare to town?", "transport"],
  ["en", "The bus leaves in the morning.", "transport"],
  ["en", "Please send the message again.", "everyday conversation"],
  ["en", "The farmer planted maize before the rain.", "agriculture"],
  ["en", "The teacher asked the class to read aloud.", "education"],
  ["en", "I want to open a savings account.", "finance"],
  ["en", "The market is busy today.", "commerce"],
  ["en", "Please help me fill this county form.", "public services"],
  ["en", "The road is flooded after heavy rain.", "climate"]
] as const;

export async function POST(request: Request) {
  const limited = checkRateLimit(request, "corpus-seed");
  if (limited) return limited;

  const auth = await requireRole(request, ["ops_admin", "language_lead"]);
  if (!auth.ok) return auth.response;

  const { data: importRow, error: importError } = await auth.supabase
    .from("corpus_imports")
    .insert({
      name: "Sema launch corpus seed",
      source_type: "manual",
      item_count: seedItems.length,
      status: "queued",
      created_by: auth.user.id
    })
    .select("id")
    .single();

  if (importError) return jsonError(importError.message, 500);

  const rows = seedItems.map(([languageCode, text, domain]) => ({
    import_id: importRow.id,
    language_code: languageCode,
    text,
    domain,
    license: "Sema internal seed",
    difficulty: "beginner",
    metadata: { seed: true }
  }));

  const { error } = await auth.supabase.from("corpus_items").upsert(rows, {
    onConflict: "language_code,hash",
    ignoreDuplicates: true
  });

  if (error) return jsonError(error.message, 500);

  await auditEvent(auth.user.id, "launch_corpus_seeded", "corpus_import", importRow.id, {
    itemCount: rows.length
  });

  return NextResponse.json({ importId: importRow.id, seeded: rows.length }, { status: 201 });
}
