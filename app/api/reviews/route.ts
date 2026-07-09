import { NextResponse } from "next/server";
import { auditEvent, checkRateLimit, jsonError, parseJson, requireRole } from "@/lib/api";
import { reviewSchema } from "@/lib/contracts";

export async function POST(request: Request) {
  const limited = checkRateLimit(request, "reviews");
  if (limited) return limited;

  const auth = await requireRole(request, ["reviewer", "expert", "language_lead", "ops_admin"]);
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, reviewSchema);
  if (!parsed.ok) return parsed.response;

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
    return jsonError(error.message, 500);
  }

  const targetTables = {
    corpus_item: "corpus_items",
    translation: "translations",
    recording: "recordings",
    transcription: "transcriptions"
  } as const;
  const { error: targetError } = await auth.supabase
    .from(targetTables[parsed.data.targetType])
    .update({ status: parsed.data.state })
    .eq("id", parsed.data.targetId);

  if (targetError) {
    await auth.supabase.from("reviews").delete().eq("id", data.id);
    return jsonError(`Review was not applied: ${targetError.message}`, 500);
  }

  await auditEvent(auth.user.id, "review_submitted", parsed.data.targetType, parsed.data.targetId, {
    reviewId: data.id,
    state: parsed.data.state,
    score: parsed.data.score
  });

  return NextResponse.json(data, { status: 201 });
}
