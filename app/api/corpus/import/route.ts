import { NextResponse } from "next/server";
import { checkRateLimit, jsonError, parseJson, requireRole, auditEvent } from "@/lib/api";
import { corpusImportSchema } from "@/lib/contracts";

export async function POST(request: Request) {
  const limited = checkRateLimit(request, "corpus-import");
  if (limited) return limited;

  const auth = await requireRole(request, ["ops_admin", "language_lead"]);
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, corpusImportSchema);
  if (!parsed.ok) return parsed.response;

  const { data: importRow, error: importError } = await auth.supabase
    .from("corpus_imports")
    .insert({
      name: parsed.data.importName,
      source_type: parsed.data.sourceType,
      item_count: parsed.data.items.length,
      status: "queued",
      created_by: auth.user.id
    })
    .select("id")
    .single();

  if (importError) {
    return jsonError(importError.message, 500);
  }

  const rows = parsed.data.items.map((item) => ({
    import_id: importRow.id,
    language_code: item.languageCode,
    source_language_code: item.sourceLanguageCode ?? null,
    text: item.text,
    domain: item.domain,
    license: item.license,
    source_uri: item.sourceUri ?? null,
    difficulty: item.difficulty,
    metadata: item.metadata
  }));

  const { error: itemError } = await auth.supabase.from("corpus_items").insert(rows);

  if (itemError) {
    return jsonError(itemError.message, 500);
  }

  await auditEvent(auth.user.id, "corpus_import_queued", "corpus_import", importRow.id, {
    itemCount: rows.length,
    sourceType: parsed.data.sourceType
  });

  return NextResponse.json({ importId: importRow.id, queuedItems: rows.length }, { status: 202 });
}
