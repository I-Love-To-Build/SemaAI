import { NextResponse } from "next/server";
import { auditEvent, checkRateLimit, jsonError, parseJson, requireUser } from "@/lib/api";
import { translationSchema } from "@/lib/contracts";
import { validateTranslationQuality } from "@/lib/quality";

export async function POST(request: Request) {
  const limited = checkRateLimit(request, "translations");
  if (limited) return limited;

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, translationSchema);
  if (!parsed.ok) return parsed.response;

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("home_language_code")
    .eq("id", auth.user.id)
    .single();

  if (profileError) return jsonError(profileError.message, 500);

  if (profile?.home_language_code !== parsed.data.languageCode) {
    const { data: elevatedRoles, error: roleError } = await auth.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.user.id)
      .in("role", ["reviewer", "expert", "language_lead", "ops_admin"]);

    if (roleError) return jsonError(roleError.message, 500);
    if (!elevatedRoles?.length) {
      return jsonError("Your account is approved for one contribution language. Ask an administrator for multilingual access.", 403);
    }
  }

  const { data: corpusItem, error: corpusError } = await auth.supabase
    .from("corpus_items")
    .select("id,text,language_code,source_language_code,metadata")
    .eq("id", parsed.data.corpusItemId)
    .single();

  if (corpusError) return jsonError(corpusError.message, 500);

  const quality = validateTranslationQuality({
    sourceText: corpusItem.text,
    sourceLanguageCode: corpusItem.language_code,
    targetLanguageCode: parsed.data.languageCode,
    translationText: parsed.data.text,
    unitType: corpusItem.metadata?.unit_type
  });

  if (!quality.ok) {
    return jsonError("Translation did not pass the automatic quality gate.", 422, {
      score: quality.score,
      reasons: quality.reasons
    });
  }

  const { data, error } = await auth.supabase
    .from("translations")
    .insert({
      corpus_item_id: parsed.data.corpusItemId,
      language_code: parsed.data.languageCode,
      contributor_id: auth.user.id,
      text: parsed.data.text,
      dialect_id: parsed.data.dialectId ?? null,
      status: quality.status
    })
    .select("id,status")
    .single();

  if (error) {
    if (error.code === "23505") {
      return jsonError("You have already submitted this item for review.", 409);
    }
    return jsonError(error.message, 500);
  }

  await auth.supabase
    .from("task_claims")
    .update({ status: "submitted" })
    .eq("corpus_item_id", parsed.data.corpusItemId)
    .eq("contributor_id", auth.user.id)
    .eq("task_type", "translation");

  await auditEvent(auth.user.id, "translation_submitted", "translation", data.id, {
    corpusItemId: parsed.data.corpusItemId,
    languageCode: parsed.data.languageCode,
    qualityScore: quality.score,
    qualityReasons: quality.reasons
  });

  return NextResponse.json(data, { status: 201 });
}
