import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/api";
import { refreshContributorReputation } from "@/lib/metrics";

function corpusText(value: unknown) {
  if (Array.isArray(value)) {
    const first = value[0] as { text?: string } | undefined;
    return first?.text;
  }
  return (value as { text?: string } | null)?.text;
}

function nairobiDayStartIso() {
  const offsetMs = 3 * 60 * 60 * 1000;
  const now = new Date();
  const nairobiNow = new Date(now.getTime() + offsetMs);
  const nairobiMidnightUtc = Date.UTC(
    nairobiNow.getUTCFullYear(),
    nairobiNow.getUTCMonth(),
    nairobiNow.getUTCDate()
  );
  return new Date(nairobiMidnightUtc - offsetMs).toISOString();
}

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const userId = auth.user.id;
  const todayIso = nairobiDayStartIso();
  const [
    translations,
    recordings,
    transcriptions,
    translationCount,
    recordingCount,
    transcriptionCount,
    todayTranslations,
    todayRecordings,
    todayTranscriptions,
    claims,
    rewards,
    roles
  ] = await Promise.all([
    auth.supabase
      .from("translations")
      .select("id,text,language_code,status,created_at,corpus_items(text,domain)")
      .eq("contributor_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    auth.supabase
      .from("recordings")
      .select("id,language_code,status,duration_ms,created_at,corpus_items(text,domain)")
      .eq("contributor_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    auth.supabase
      .from("transcriptions")
      .select("id,status,created_at")
      .eq("contributor_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    auth.supabase
      .from("translations")
      .select("*", { count: "exact", head: true })
      .eq("contributor_id", userId),
    auth.supabase
      .from("recordings")
      .select("*", { count: "exact", head: true })
      .eq("contributor_id", userId),
    auth.supabase
      .from("transcriptions")
      .select("*", { count: "exact", head: true })
      .eq("contributor_id", userId),
    auth.supabase
      .from("translations")
      .select("*", { count: "exact", head: true })
      .eq("contributor_id", userId)
      .gte("created_at", todayIso),
    auth.supabase
      .from("recordings")
      .select("*", { count: "exact", head: true })
      .eq("contributor_id", userId)
      .gte("created_at", todayIso),
    auth.supabase
      .from("transcriptions")
      .select("*", { count: "exact", head: true })
      .eq("contributor_id", userId)
      .gte("created_at", todayIso),
    auth.supabase
      .from("task_claims")
      .select("id,status,expires_at")
      .eq("contributor_id", userId)
      .eq("status", "claimed"),
    auth.supabase
      .from("reward_ledger")
      .select("points")
      .eq("contributor_id", userId),
    auth.supabase
      .from("user_roles")
      .select("role,language_code")
      .eq("user_id", userId)
  ]);

  const firstError = [
    translations.error,
    recordings.error,
    transcriptions.error,
    translationCount.error,
    recordingCount.error,
    transcriptionCount.error,
    todayTranslations.error,
    todayRecordings.error,
    todayTranscriptions.error,
    claims.error,
    rewards.error,
    roles.error
  ].find(Boolean);

  if (firstError) return jsonError(firstError.message, 500);

  const translationRows = translations.data ?? [];
  const recordingRows = recordings.data ?? [];
  const transcriptionRows = transcriptions.data ?? [];
  const allStatuses = [
    ...translationRows.map((item) => item.status),
    ...recordingRows.map((item) => item.status),
    ...transcriptionRows.map((item) => item.status)
  ];
  const approved = allStatuses.filter((status) => status === "approved").length;
  const rejected = allStatuses.filter((status) => status === "rejected").length;
  const pending = allStatuses.length - approved - rejected;
  const audioSeconds = Math.round(
    recordingRows.reduce((total, item) => total + (item.duration_ms ?? 0), 0) / 1000
  );

  const recent = [
    ...translationRows.map((item) => ({
      id: item.id,
      type: "Translation",
      languageCode: item.language_code,
      status: item.status,
      createdAt: item.created_at,
      title: item.text,
      source: corpusText(item.corpus_items)
    })),
    ...recordingRows.map((item) => ({
      id: item.id,
      type: "Recording",
      languageCode: item.language_code,
      status: item.status,
      createdAt: item.created_at,
      title: corpusText(item.corpus_items) ?? "Voice recording",
      source: `${Math.max(1, Math.round((item.duration_ms ?? 0) / 1000))} sec`
    }))
  ]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 12);

  let reputation = null;
  try {
    reputation = await refreshContributorReputation(auth.supabase, userId);
  } catch {
    reputation = null;
  }

  return NextResponse.json({
    stats: {
      total: (translationCount.count ?? 0) + (recordingCount.count ?? 0) + (transcriptionCount.count ?? 0),
      today: (todayTranslations.count ?? 0) + (todayRecordings.count ?? 0) + (todayTranscriptions.count ?? 0),
      approved,
      pending,
      rejected,
      activeClaims: claims.data?.length ?? 0,
      audioSeconds,
      points: (rewards.data ?? []).reduce((total, item) => total + item.points, 0)
    },
    roles: roles.data ?? [],
    recent,
    reputation
  });
}
