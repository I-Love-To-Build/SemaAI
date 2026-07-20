import { NextResponse } from "next/server";
import { checkRateLimit, jsonError, requireUser } from "@/lib/api";

export const dynamic = "force-dynamic";

function scoreCoverage(value: number, target: number) {
  return Math.min(100, Number(((value / Math.max(1, target)) * 100).toFixed(2)));
}

export async function GET(request: Request) {
  const limited = checkRateLimit(request, "language-metrics");
  if (limited) return limited;

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const { data: languages, error: languageError } = await auth.supabase
    .from("languages")
    .select("code,name,family,priority,active")
    .eq("active", true)
    .order("name");

  if (languageError) return jsonError(languageError.message, 500);

  const rows = await Promise.all((languages ?? []).map(async (language) => {
    const [
      sourceItems,
      translationsTotal,
      translationsApproved,
      recordingsTotal,
      recordingsApproved,
      recordingRows,
      reviewDecisions,
      contributors
    ] = await Promise.all([
      auth.supabase.from("corpus_items").select("*", { count: "exact", head: true }).eq("language_code", language.code),
      auth.supabase.from("translations").select("*", { count: "exact", head: true }).eq("language_code", language.code),
      auth.supabase.from("translations").select("*", { count: "exact", head: true }).eq("language_code", language.code).eq("status", "approved"),
      auth.supabase.from("recordings").select("*", { count: "exact", head: true }).eq("language_code", language.code),
      auth.supabase.from("recordings").select("*", { count: "exact", head: true }).eq("language_code", language.code).eq("status", "approved"),
      auth.supabase.from("recordings").select("duration_ms").eq("language_code", language.code),
      auth.supabase.from("reviews").select("*", { count: "exact", head: true }).eq("target_type", "translation"),
      auth.supabase.from("user_roles").select("user_id").eq("language_code", language.code)
    ]);

    const failed = [sourceItems, translationsTotal, translationsApproved, recordingsTotal, recordingsApproved, recordingRows, reviewDecisions, contributors].find((result) => result.error);
    if (failed?.error) throw failed.error;

    const audioSeconds = Math.round((recordingRows.data ?? []).reduce((total, row) => total + (row.duration_ms ?? 0), 0) / 1000);
    const sourceCount = sourceItems.count ?? 0;
    const textCoverage = scoreCoverage(translationsApproved.count ?? 0, Math.max(100, sourceCount));
    const audioCoverage = scoreCoverage(recordingsApproved.count ?? 0, Math.max(50, Math.round(sourceCount * 0.5)));
    const reviewCoverage = scoreCoverage(reviewDecisions.count ?? 0, Math.max(50, (translationsTotal.count ?? 0) + (recordingsTotal.count ?? 0)));
    const readinessScore = Math.min(100, Math.round((textCoverage * 0.45) + (audioCoverage * 0.35) + (reviewCoverage * 0.2)));
    const contributorCount = new Set((contributors.data ?? []).map((item) => item.user_id)).size;

    return {
      language_code: language.code,
      language,
      source_items: sourceCount,
      translations_total: translationsTotal.count ?? 0,
      translations_approved: translationsApproved.count ?? 0,
      recordings_total: recordingsTotal.count ?? 0,
      recordings_approved: recordingsApproved.count ?? 0,
      audio_seconds: audioSeconds,
      review_decisions: reviewDecisions.count ?? 0,
      contributor_count: contributorCount,
      text_coverage: textCoverage,
      audio_coverage: audioCoverage,
      review_coverage: reviewCoverage,
      readiness_score: readinessScore,
      updated_at: new Date().toISOString()
    };
  }));

  await auth.supabase.from("language_metrics").upsert(rows.map(({ language, ...row }) => row));

  return NextResponse.json({ metrics: rows }, { headers: { "Cache-Control": "no-store" } });
}
