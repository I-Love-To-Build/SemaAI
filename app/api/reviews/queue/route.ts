import { NextResponse } from "next/server";
import { checkRateLimit, jsonError, requireRole } from "@/lib/api";

export async function GET(request: Request) {
  const limited = checkRateLimit(request, "review-queue");
  if (limited) return limited;

  const auth = await requireRole(request, ["reviewer", "expert", "language_lead", "ops_admin"]);
  if (!auth.ok) return auth.response;

  const { data: roles, error: roleError } = await auth.supabase
    .from("user_roles")
    .select("role,language_code")
    .eq("user_id", auth.user.id)
    .in("role", ["reviewer", "expert", "language_lead", "ops_admin"]);

  if (roleError) return jsonError(roleError.message, 500);

  const canSeeAllLanguages = roles?.some((role) => role.role === "ops_admin" || role.language_code === null);
  const scopedLanguages = [...new Set((roles ?? []).map((role) => role.language_code).filter(Boolean))] as string[];

  let translationQuery = auth.supabase
    .from("translations")
    .select("id,language_code,text,status,created_at,contributor_id,profiles(display_name),corpus_items(text,domain)")
    .in("status", ["submitted", "peer_review", "expert_review"])
    .neq("contributor_id", auth.user.id)
    .order("created_at", { ascending: true })
    .limit(25);

  if (!canSeeAllLanguages) {
    if (!scopedLanguages.length) return jsonError("No review languages are assigned to this reviewer.", 403);
    translationQuery = translationQuery.in("language_code", scopedLanguages);
  }

  const { data: translations, error: translationError } = await translationQuery;

  if (translationError) return jsonError(translationError.message, 500);

  let recordingQuery = auth.supabase
    .from("recordings")
    .select("id,language_code,storage_path,duration_ms,status,created_at,contributor_id,profiles(display_name),corpus_items(text,domain)")
    .in("status", ["submitted", "peer_review", "expert_review"])
    .neq("contributor_id", auth.user.id)
    .order("created_at", { ascending: true })
    .limit(25);

  if (!canSeeAllLanguages) {
    recordingQuery = recordingQuery.in("language_code", scopedLanguages);
  }

  const { data: recordings, error: recordingError } = await recordingQuery;

  if (recordingError) return jsonError(recordingError.message, 500);

  const bucket = process.env.SEMA_AUDIO_BUCKET || "recordings";
  const recordingRows = await Promise.all(
    (recordings ?? []).map(async (recording) => {
      const { data } = await auth.supabase.storage
        .from(bucket)
        .createSignedUrl(recording.storage_path, 60 * 10);
      return { ...recording, playbackUrl: data?.signedUrl ?? null };
    })
  );

  return NextResponse.json({
    translations: translations ?? [],
    recordings: recordingRows,
    roles: roles ?? []
  });
}
