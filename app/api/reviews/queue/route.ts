import { NextResponse } from "next/server";
import { checkRateLimit, jsonError, requireRole } from "@/lib/api";

export async function GET(request: Request) {
  const limited = checkRateLimit(request, "review-queue");
  if (limited) return limited;

  const auth = await requireRole(request, ["reviewer", "expert", "language_lead", "ops_admin"]);
  if (!auth.ok) return auth.response;

  const { data: translations, error: translationError } = await auth.supabase
    .from("translations")
    .select("id,language_code,text,status,created_at,corpus_items(text,domain)")
    .eq("status", "submitted")
    .order("created_at", { ascending: true })
    .limit(25);

  if (translationError) return jsonError(translationError.message, 500);

  const { data: recordings, error: recordingError } = await auth.supabase
    .from("recordings")
    .select("id,language_code,storage_path,duration_ms,status,created_at,corpus_items(text,domain)")
    .in("status", ["submitted", "peer_review"])
    .order("created_at", { ascending: true })
    .limit(25);

  if (recordingError) return jsonError(recordingError.message, 500);

  return NextResponse.json({
    translations: translations ?? [],
    recordings: recordings ?? []
  });
}
