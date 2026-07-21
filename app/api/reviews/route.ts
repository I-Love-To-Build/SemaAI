import { NextResponse } from "next/server";
import { auditEvent, checkRateLimit, jsonError, parseJson, requireRole } from "@/lib/api";
import { reviewSchema } from "@/lib/contracts";
import { refreshContributorReputation } from "@/lib/metrics";
import { decideReviewConsensus } from "@/lib/quality";

export async function POST(request: Request) {
  const limited = checkRateLimit(request, "reviews");
  if (limited) return limited;

  const auth = await requireRole(request, ["reviewer", "expert", "language_lead", "ops_admin"]);
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, reviewSchema);
  if (!parsed.ok) return parsed.response;

  const targetTables = {
    corpus_item: "corpus_items",
    translation: "translations",
    recording: "recordings",
    transcription: "transcriptions"
  } as const;

  const targetSelect = parsed.data.targetType === "corpus_item"
    ? "id,language_code,status"
    : parsed.data.targetType === "transcription"
      ? "id,recording_id,contributor_id,status"
      : "id,language_code,contributor_id,status";

  const { data: target, error: targetLookupError } = await auth.supabase
    .from(targetTables[parsed.data.targetType])
    .select(targetSelect)
    .eq("id", parsed.data.targetId)
    .single();

  if (targetLookupError) return jsonError(targetLookupError.message, 500);

  const targetContributorId = "contributor_id" in target && typeof target.contributor_id === "string"
    ? target.contributor_id
    : null;
  let targetLanguageCode = "language_code" in target ? target.language_code : null;
  if (!targetLanguageCode && parsed.data.targetType === "transcription" && "recording_id" in target) {
    const { data: recording, error: recordingError } = await auth.supabase
      .from("recordings")
      .select("language_code")
      .eq("id", target.recording_id)
      .single();
    if (recordingError) return jsonError(recordingError.message, 500);
    targetLanguageCode = recording.language_code;
  }

  if (targetContributorId === auth.user.id) {
    return jsonError("You cannot review your own contribution.", 403);
  }

  const { data: reviewerRoles, error: roleError } = await auth.supabase
    .from("user_roles")
    .select("role,language_code")
    .eq("user_id", auth.user.id)
    .in("role", ["reviewer", "expert", "language_lead", "ops_admin"]);

  if (roleError) return jsonError(roleError.message, 500);
  const canReviewLanguage = reviewerRoles?.some((role) =>
    role.role === "ops_admin" || role.language_code === null || role.language_code === targetLanguageCode
  );

  if (!canReviewLanguage) {
    return jsonError("Your reviewer role is not scoped to this contribution language.", 403);
  }

  const { data, error } = await auth.supabase
    .from("reviews")
    .insert({
      reviewer_id: auth.user.id,
      target_type: parsed.data.targetType,
      target_id: parsed.data.targetId,
      state: parsed.data.state,
      score: parsed.data.score,
      reasons: parsed.data.reasons,
      notes: parsed.data.notes ?? null
    })
    .select("id,state,score")
    .single();

  if (error) {
    if (error.code === "23505") {
      return jsonError("You have already reviewed this contribution.", 409);
    }
    return jsonError(error.message, 500);
  }

  const { data: reviews, error: reviewReadError } = await auth.supabase
    .from("reviews")
    .select("state,score")
    .eq("target_type", parsed.data.targetType)
    .eq("target_id", parsed.data.targetId)
    .order("created_at", { ascending: false });

  if (reviewReadError) {
    await auth.supabase.from("reviews").delete().eq("id", data.id);
    return jsonError(`Review was saved but consensus could not be calculated: ${reviewReadError.message}`, 500);
  }

  const decision = decideReviewConsensus(reviews ?? []);
  const { error: targetError } = await auth.supabase
    .from(targetTables[parsed.data.targetType])
    .update({ status: decision.finalState })
    .eq("id", parsed.data.targetId);

  if (targetError) {
    await auth.supabase.from("reviews").delete().eq("id", data.id);
    return jsonError(`Review was not applied: ${targetError.message}`, 500);
  }

  if (decision.decided) {
    await auth.supabase.from("consensus_decisions").insert({
      target_type: parsed.data.targetType,
      target_id: parsed.data.targetId,
      final_state: decision.finalState,
      confidence: decision.confidence,
      decided_by: auth.user.id
    });
  }

  if (targetContributorId) {
    await refreshContributorReputation(auth.supabase, targetContributorId).catch(() => null);
  }

  await auditEvent(auth.user.id, "review_submitted", parsed.data.targetType, parsed.data.targetId, {
    reviewId: data.id,
    state: parsed.data.state,
    score: parsed.data.score,
    consensusState: decision.finalState,
    consensusConfidence: decision.confidence,
    consensusDecided: decision.decided
  });

  return NextResponse.json({ ...data, consensus: decision }, { status: 201 });
}
