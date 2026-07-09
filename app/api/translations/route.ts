import { NextResponse } from "next/server";
import { auditEvent, checkRateLimit, jsonError, parseJson, requireUser } from "@/lib/api";
import { translationSchema } from "@/lib/contracts";

export async function POST(request: Request) {
  const limited = checkRateLimit(request, "translations");
  if (limited) return limited;

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, translationSchema);
  if (!parsed.ok) return parsed.response;

  const { data, error } = await auth.supabase
    .from("translations")
    .insert({
      corpus_item_id: parsed.data.corpusItemId,
      language_code: parsed.data.languageCode,
      contributor_id: auth.user.id,
      text: parsed.data.text,
      dialect_id: parsed.data.dialectId ?? null
    })
    .select("id,status")
    .single();

  if (error) return jsonError(error.message, 500);

  await auth.supabase
    .from("task_claims")
    .update({ status: "submitted" })
    .eq("corpus_item_id", parsed.data.corpusItemId)
    .eq("contributor_id", auth.user.id)
    .eq("task_type", "translation");

  await auditEvent(auth.user.id, "translation_submitted", "translation", data.id, {
    corpusItemId: parsed.data.corpusItemId,
    languageCode: parsed.data.languageCode
  });

  return NextResponse.json(data, { status: 201 });
}
