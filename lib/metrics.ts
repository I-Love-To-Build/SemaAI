import type { SupabaseClient } from "@supabase/supabase-js";

export type ContributorReputation = {
  reputation_score: number;
  level: string;
  total_contributions: number;
  approved_contributions: number;
  rejected_contributions: number;
  pending_contributions: number;
  audio_seconds: number;
  badges: string[];
};

function levelFor(score: number, approved: number) {
  if (score >= 90 && approved >= 500) return "Language expert";
  if (score >= 78 && approved >= 100) return "Trusted contributor";
  if (score >= 55) return "Verified contributor";
  return "New contributor";
}

export function calculateReputation(input: {
  translations: Array<{ status: string }>;
  recordings: Array<{ status: string; duration_ms?: number | null }>;
  transcriptions?: Array<{ status: string }>;
}) {
  const rows = [...input.translations, ...input.recordings, ...(input.transcriptions ?? [])];
  const total = rows.length;
  const approved = rows.filter((row) => row.status === "approved").length;
  const rejected = rows.filter((row) => row.status === "rejected").length;
  const pending = Math.max(0, total - approved - rejected);
  const audioSeconds = Math.round(input.recordings.reduce((totalSeconds, row) => totalSeconds + (row.duration_ms ?? 0), 0) / 1000);
  const approvalRate = approved + rejected ? approved / (approved + rejected) : total ? 0.75 : 0;
  const volumeScore = Math.min(25, (total / 200) * 25);
  const audioScore = Math.min(20, (audioSeconds / 7200) * 20);
  const qualityScore = approvalRate * 55;
  const score = Math.min(100, Math.round(qualityScore + volumeScore + audioScore));
  const badges = [
    total >= 10 ? "consistent_contributor" : "",
    approved >= 50 ? "quality_builder" : "",
    audioSeconds >= 1800 ? "voice_builder" : "",
    rejected === 0 && total >= 10 ? "clean_record" : ""
  ].filter(Boolean);

  return {
    reputation_score: score,
    level: levelFor(score, approved),
    total_contributions: total,
    approved_contributions: approved,
    rejected_contributions: rejected,
    pending_contributions: pending,
    audio_seconds: audioSeconds,
    badges
  };
}

export async function refreshContributorReputation(supabase: SupabaseClient, contributorId: string) {
  const [translations, recordings, transcriptions] = await Promise.all([
    supabase.from("translations").select("status").eq("contributor_id", contributorId),
    supabase.from("recordings").select("status,duration_ms").eq("contributor_id", contributorId),
    supabase.from("transcriptions").select("status").eq("contributor_id", contributorId)
  ]);

  const failed = [translations.error, recordings.error, transcriptions.error].find(Boolean);
  if (failed) throw failed;

  const reputation = calculateReputation({
    translations: translations.data ?? [],
    recordings: recordings.data ?? [],
    transcriptions: transcriptions.data ?? []
  });

  await supabase.from("contributor_reputation").upsert({
    contributor_id: contributorId,
    ...reputation,
    updated_at: new Date().toISOString()
  });

  await supabase
    .from("profiles")
    .update({ reviewer_score: reputation.reputation_score, updated_at: new Date().toISOString() })
    .eq("id", contributorId);

  return reputation;
}
