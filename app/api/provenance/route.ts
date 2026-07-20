import { NextResponse } from "next/server";
import { checkRateLimit, jsonError, requireUser } from "@/lib/api";

export const dynamic = "force-dynamic";

const targetTables: Record<string, string> = {
  translation: "translations",
  recording: "recordings",
  transcription: "transcriptions",
  corpus_item: "corpus_items"
};

function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function userRoles(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role,language_code").eq("user_id", userId);
  return data ?? [];
}

function hasElevatedAccess(roles: Array<{ role: string }>) {
  return roles.some((item) => ["reviewer", "expert", "language_lead", "ops_admin", "auditor"].includes(item.role));
}

export async function GET(request: Request) {
  const limited = checkRateLimit(request, "provenance");
  if (limited) return limited;

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const targetType = url.searchParams.get("targetType") ?? "";
  const targetId = url.searchParams.get("targetId") ?? "";
  const table = targetTables[targetType];

  if (!table || !targetId) {
    return jsonError("Use targetType=translation|recording|transcription|corpus_item and targetId.", 400);
  }

  const roles = await userRoles(auth.supabase, auth.user.id);
  const elevated = hasElevatedAccess(roles);

  let contributionQuery = auth.supabase.from(table).select("*").eq("id", targetId);
  if (!elevated && targetType !== "corpus_item") {
    contributionQuery = contributionQuery.eq("contributor_id", auth.user.id);
  }

  const contribution = await contributionQuery.single();
  if (contribution.error) return jsonError(contribution.error.message, contribution.error.code === "PGRST116" ? 404 : 500);
  if (!contribution.data) return jsonError("Contribution not found.", 404);

  const sourceId = contribution.data.corpus_item_id ?? (targetType === "corpus_item" ? contribution.data.id : null);
  const [source, reviews, consensus, auditEvents, consent, speaker] = await Promise.all([
    sourceId
      ? auth.supabase.from("corpus_items").select("id,text,source_language_code,domain,difficulty,metadata,created_at").eq("id", sourceId).single()
      : Promise.resolve({ data: null, error: null }),
    auth.supabase
      .from("reviews")
      .select("id,target_type,target_id,state,score,reasons,notes,created_at,profiles(display_name)")
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .order("created_at", { ascending: true }),
    auth.supabase
      .from("consensus_decisions")
      .select("id,target_type,target_id,final_state,confidence,decided_at")
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .order("decided_at", { ascending: true }),
    auth.supabase
      .from("audit_events")
      .select("id,actor_id,target_type,target_id,action,metadata,created_at")
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .order("created_at", { ascending: true }),
    contribution.data.consent_record_id
      ? auth.supabase.from("consent_records").select("*").eq("id", contribution.data.consent_record_id).single()
      : Promise.resolve({ data: null, error: null }),
    contribution.data.speaker_profile_id
      ? auth.supabase.from("speaker_profiles").select("id,language_code,county,age_range,gender,created_at").eq("id", contribution.data.speaker_profile_id).single()
      : Promise.resolve({ data: null, error: null })
  ]);

  const sourceData = source.error ? null : source.data;
  const reviewRows = reviews.error ? [] : reviews.data ?? [];
  const consensusRows = consensus.error ? [] : consensus.data ?? [];
  const auditRows = auditEvents.error ? [] : auditEvents.data ?? [];

  return NextResponse.json(
    {
      target: {
        type: targetType,
        id: targetId,
        status: contribution.data.status ?? "available",
        languageCode: contribution.data.language_code ?? null,
        createdAt: contribution.data.created_at ?? null
      },
      source: sourceData,
      contribution: {
        id: contribution.data.id,
        text: contribution.data.text ?? null,
        durationMs: contribution.data.duration_ms ?? null,
        qaReport: contribution.data.qa_report ?? null,
        metadata: contribution.data.metadata ?? {},
        contributorId: elevated ? contribution.data.contributor_id ?? null : undefined
      },
      rights: {
        consent: consent.error ? null : consent.data,
        speaker: speaker.error ? null : speaker.data,
        sourceLicense: sourceData?.metadata?.license ?? sourceData?.metadata?.source_license ?? null
      },
      reviewTrail: reviewRows.map((row: any) => ({
        id: row.id,
        decision: row.state,
        notes: row.notes,
        reviewerRole: "reviewer",
        score: row.score,
        reasons: row.reasons ?? [],
        reviewerName: relation(row.profiles)?.display_name ?? "Reviewer",
        createdAt: row.created_at
      })),
      consensusTrail: consensusRows,
      auditTrail: auditRows,
      exportReady:
        (contribution.data.status === "approved" || consensusRows.some((row: any) => row.final_state === "approved")) &&
        Boolean(sourceData) &&
        (targetType !== "recording" || Boolean(consent.data))
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
