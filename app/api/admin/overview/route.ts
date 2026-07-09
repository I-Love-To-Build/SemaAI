import { NextResponse } from "next/server";
import { jsonError, requireRole } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRole(request, ["ops_admin"]);
  if (!auth.ok) return auth.response;

  const [
    profiles,
    corpus,
    translations,
    recordings,
    approvedTranslations,
    approvedRecordings,
    pendingTranslations,
    pendingRecordings,
    languages,
    recentRecordings,
    recentTranslations,
    imports
  ] = await Promise.all([
    auth.supabase.from("profiles").select("*", { count: "exact", head: true }),
    auth.supabase.from("corpus_items").select("*", { count: "exact", head: true }),
    auth.supabase.from("translations").select("*", { count: "exact", head: true }),
    auth.supabase.from("recordings").select("*", { count: "exact", head: true }),
    auth.supabase.from("translations").select("*", { count: "exact", head: true }).eq("status", "approved"),
    auth.supabase.from("recordings").select("*", { count: "exact", head: true }).eq("status", "approved"),
    auth.supabase.from("translations").select("*", { count: "exact", head: true }).in("status", ["submitted", "peer_review", "expert_review"]),
    auth.supabase.from("recordings").select("*", { count: "exact", head: true }).in("status", ["submitted", "peer_review", "expert_review"]),
    auth.supabase.from("languages").select("*", { count: "exact", head: true }).eq("active", true),
    auth.supabase
      .from("recordings")
      .select("id,language_code,status,duration_ms,storage_path,created_at,profiles(display_name),corpus_items(text,domain)")
      .order("created_at", { ascending: false })
      .limit(12),
    auth.supabase
      .from("translations")
      .select("id,language_code,status,text,created_at,profiles(display_name),corpus_items(text,domain)")
      .order("created_at", { ascending: false })
      .limit(12),
    auth.supabase
      .from("corpus_imports")
      .select("id,name,status,item_count,created_at")
      .order("created_at", { ascending: false })
      .limit(10)
  ]);

  const results = [
    profiles,
    corpus,
    translations,
    recordings,
    approvedTranslations,
    approvedRecordings,
    pendingTranslations,
    pendingRecordings,
    languages,
    recentRecordings,
    recentTranslations,
    imports
  ];
  const failed = results.find((result) => result.error);
  if (failed?.error) return jsonError(failed.error.message, 500);

  const bucket = process.env.SEMA_AUDIO_BUCKET || "recordings";
  const recordingRows = await Promise.all(
    (recentRecordings.data ?? []).map(async (recording) => {
      const { data } = await auth.supabase.storage
        .from(bucket)
        .createSignedUrl(recording.storage_path, 60 * 10);
      return { ...recording, playbackUrl: data?.signedUrl ?? null };
    })
  );

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      counts: {
        contributors: profiles.count ?? 0,
        corpus: corpus.count ?? 0,
        translations: translations.count ?? 0,
        recordings: recordings.count ?? 0,
        approved: (approvedTranslations.count ?? 0) + (approvedRecordings.count ?? 0),
        pending: (pendingTranslations.count ?? 0) + (pendingRecordings.count ?? 0),
        languages: languages.count ?? 0
      },
      targets: {
        corpus: 1_200_000,
        translations: Math.max(1, (corpus.count ?? 0) * (languages.count ?? 68)),
        recordings: Math.max(1, (corpus.count ?? 0) * (languages.count ?? 68))
      },
      recordings: recordingRows,
      translations: recentTranslations.data ?? [],
      imports: imports.data ?? []
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
