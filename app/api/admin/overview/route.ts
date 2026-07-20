import { NextResponse } from "next/server";
import { jsonError, requireRole } from "@/lib/api";

export const dynamic = "force-dynamic";

function readinessItems(counts: {
  corpus: number;
  languages: number;
  translations: number;
  recordings: number;
  contributors: number;
  approved: number;
  consensus: number;
  publishedModels?: number;
  clientApiKeys?: number;
  trainingJobs?: number;
}) {
  return [
    {
      area: "Real corpus scale",
      status: counts.corpus >= 1_200_000 ? "ready" : counts.corpus >= 100_000 ? "scaling" : "foundation",
      progress: Math.min(100, Math.round((counts.corpus / 1_200_000) * 100)),
      target: "1.2M licensed, deduplicated, domain-balanced source items.",
      nextStep: "Keep importing licensed word, phrase, sentence, term, idiom, proverb, and public-service corpora with provenance metadata."
    },
    {
      area: "Real Kenyan language coverage",
      status: counts.languages >= 68 && counts.translations > 0 ? "foundation" : "blocked",
      progress: Math.min(100, Math.round((counts.languages / 68) * 100)),
      target: "68 active Kenyan languages with community-reviewed translations and audio.",
      nextStep: "Recruit language leads for low-resource communities and track per-language coverage instead of treating all languages equally."
    },
    {
      area: "Human review depth",
      status: counts.consensus >= 500 ? "scaling" : "foundation",
      progress: Math.min(100, Math.round((counts.consensus / 500) * 100)),
      target: "Reviewer tiers, language leads, disputes, audit sampling, reputation, and anti-spam controls.",
      nextStep: "Expand reviewer roles, require consensus on release candidates, and audit a random sample of approved work."
    },
    {
      area: "Audio reliability",
      status: counts.recordings >= 10_000 ? "scaling" : "foundation",
      progress: Math.min(100, Math.round((counts.recordings / 10_000) * 100)),
      target: "Mobile-first recording, upload fallback, waveform preview, noise checks, retries, and support flow.",
      nextStep: "Collect device/browser failure reports, prioritize mobile capture, and run audio QA workers on every upload."
    },
    {
      area: "ML training infrastructure",
      status: (counts.publishedModels ?? 0) > 0 ? "scaling" : (counts.trainingJobs ?? 0) > 0 ? "pilot" : "foundation",
      progress: Math.min(100, Math.max(20, ((counts.publishedModels ?? 0) * 40) + ((counts.trainingJobs ?? 0) > 0 ? 25 : 0))),
      target: "GPU jobs, checkpoints, evaluations, endpoint deployment, rollback, and model versioning.",
      nextStep: "Connect the model release worker to a real trainer/evaluator and require passing scores before publishing."
    },
    {
      area: "Client-ready services",
      status: (counts.clientApiKeys ?? 0) > 0 && (counts.publishedModels ?? 0) > 0 ? "pilot" : "foundation",
      progress: Math.min(100, 35 + ((counts.clientApiKeys ?? 0) > 0 ? 20 : 0) + ((counts.publishedModels ?? 0) > 0 ? 25 : 0)),
      target: "Translation, transcription, TTS, voice services, client dashboards, API keys, usage limits, billing, logs, and SLAs.",
      nextStep: "Issue per-organization API keys and connect client routes to published model endpoints."
    },
    {
      area: "Data and legal trust",
      status: "foundation",
      progress: 40,
      target: "Consent, rights, privacy, licensing, contributor terms, takedown flow, provenance, and export restrictions.",
      nextStep: "Attach license/provenance to every import and block export for items without valid rights metadata."
    },
    {
      area: "Operations",
      status: "foundation",
      progress: 30,
      target: "Backups, monitoring, alerts, incident response, load testing, rate limits, security review, abuse detection, and admin tooling.",
      nextStep: "Connect alert_events to an external monitor and schedule load tests before large contributor pilots."
    },
    {
      area: "Evidence",
      status: counts.contributors >= 100 ? "pilot" : "foundation",
      progress: Math.min(100, Math.round((counts.contributors / 100) * 100)),
      target: "Pilot data on contributors, languages, approved outputs, audio hours, review accuracy, model scores, cost per accepted item, and client demand.",
      nextStep: "Run a measured pilot and publish weekly traction metrics in the admin console."
    }
  ];
}

function safeCount(result: { count: number | null; error: { message: string } | null }) {
  return result.error ? 0 : result.count ?? 0;
}

function safeRows<T>(result: { data: T[] | null; error: { message: string } | null }) {
  return result.error ? [] : result.data ?? [];
}

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
    revisionTranslations,
    revisionRecordings,
    rejectedTranslations,
    rejectedRecordings,
    expertTranslations,
    expertRecordings,
    languages,
    recentRecordings,
    recentTranslations,
    imports,
    consensus,
    alerts
  ] = await Promise.all([
    auth.supabase.from("profiles").select("*", { count: "exact", head: true }),
    auth.supabase.from("corpus_items").select("*", { count: "exact", head: true }),
    auth.supabase.from("translations").select("*", { count: "exact", head: true }),
    auth.supabase.from("recordings").select("*", { count: "exact", head: true }),
    auth.supabase.from("translations").select("*", { count: "exact", head: true }).eq("status", "approved"),
    auth.supabase.from("recordings").select("*", { count: "exact", head: true }).eq("status", "approved"),
    auth.supabase.from("translations").select("*", { count: "exact", head: true }).in("status", ["submitted", "peer_review", "expert_review"]),
    auth.supabase.from("recordings").select("*", { count: "exact", head: true }).in("status", ["submitted", "peer_review", "expert_review"]),
    auth.supabase.from("translations").select("*", { count: "exact", head: true }).eq("status", "needs_revision"),
    auth.supabase.from("recordings").select("*", { count: "exact", head: true }).eq("status", "needs_revision"),
    auth.supabase.from("translations").select("*", { count: "exact", head: true }).eq("status", "rejected"),
    auth.supabase.from("recordings").select("*", { count: "exact", head: true }).eq("status", "rejected"),
    auth.supabase.from("translations").select("*", { count: "exact", head: true }).eq("status", "expert_review"),
    auth.supabase.from("recordings").select("*", { count: "exact", head: true }).eq("status", "expert_review"),
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
      .limit(10),
    auth.supabase.from("consensus_decisions").select("*", { count: "exact", head: true }),
    auth.supabase
      .from("alert_events")
      .select("id,severity,source,message,created_at")
      .is("acknowledged_at", null)
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
    revisionTranslations,
    revisionRecordings,
    rejectedTranslations,
    rejectedRecordings,
    expertTranslations,
    expertRecordings,
    languages,
    recentRecordings,
    recentTranslations,
    imports,
    consensus,
    alerts
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

  const summaryCounts = {
    contributors: profiles.count ?? 0,
    corpus: corpus.count ?? 0,
    translations: translations.count ?? 0,
    recordings: recordings.count ?? 0,
    approved: (approvedTranslations.count ?? 0) + (approvedRecordings.count ?? 0),
    pending: (pendingTranslations.count ?? 0) + (pendingRecordings.count ?? 0),
    languages: languages.count ?? 0,
    consensus: consensus.count ?? 0
  };

  const [
    clientIngests,
    trainingJobs,
    modelReleases,
    publishedModels,
    clientApiKeys,
    usageEvents,
    datasetReleases,
    recentIngests,
    recentTrainingJobs,
    recentModels,
    evaluationRuns,
    missions,
    languageMetrics,
    reputationRows
  ] = await Promise.all([
    auth.supabase.from("client_data_ingests").select("*", { count: "exact", head: true }),
    auth.supabase.from("training_jobs").select("*", { count: "exact", head: true }),
    auth.supabase.from("model_releases").select("*", { count: "exact", head: true }),
    auth.supabase.from("model_releases").select("*", { count: "exact", head: true }).eq("status", "published"),
    auth.supabase.from("client_api_keys").select("*", { count: "exact", head: true }).eq("active", true),
    auth.supabase.from("client_usage_events").select("*", { count: "exact", head: true }),
    auth.supabase.from("dataset_releases").select("*", { count: "exact", head: true }),
    auth.supabase
      .from("client_data_ingests")
      .select("id,name,status,language_codes,domains,unit_count,audio_hours,quality_score,rejection_reasons,created_at")
      .order("created_at", { ascending: false })
      .limit(8),
    auth.supabase
      .from("training_jobs")
      .select("id,model_type,status,language_codes,domains,training_provider,endpoint_url,metrics,error,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(8),
    auth.supabase
      .from("model_releases")
      .select("id,slug,name,model_type,version,status,quality_score,endpoint_url,language_codes,domains,created_at")
      .order("created_at", { ascending: false })
      .limit(8),
    auth.supabase.from("evaluation_runs").select("*", { count: "exact", head: true }),
    auth.supabase
      .from("missions")
      .select("id,slug,title,description,domain,language_codes,target_items,status,priority,governance_notes,updated_at")
      .order("priority", { ascending: false })
      .order("updated_at", { ascending: false }),
    auth.supabase
      .from("language_metrics")
      .select("language_code,source_items,translations_total,translations_approved,recordings_total,recordings_approved,audio_seconds,review_decisions,contributor_count,text_coverage,audio_coverage,review_coverage,readiness_score,updated_at")
      .order("readiness_score", { ascending: true })
      .limit(68),
    auth.supabase.from("contributor_reputation").select("*", { count: "exact", head: true })
  ]);

  const pipelineCounts = {
    clientIngests: safeCount(clientIngests),
    trainingJobs: safeCount(trainingJobs),
    modelReleases: safeCount(modelReleases),
    publishedModels: safeCount(publishedModels),
    clientApiKeys: safeCount(clientApiKeys),
    usageEvents: safeCount(usageEvents),
    datasetReleases: safeCount(datasetReleases),
    evaluationRuns: safeCount(evaluationRuns),
    reputationProfiles: safeCount(reputationRows)
  };

  const readinessCounts = {
    ...summaryCounts,
    publishedModels: pipelineCounts.publishedModels,
    clientApiKeys: pipelineCounts.clientApiKeys,
    trainingJobs: pipelineCounts.trainingJobs
  };

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      counts: summaryCounts,
      quality: {
        approvalRate:
          (translations.count ?? 0) + (recordings.count ?? 0)
            ? Math.round((((approvedTranslations.count ?? 0) + (approvedRecordings.count ?? 0)) / ((translations.count ?? 0) + (recordings.count ?? 0))) * 100)
            : 0,
        needsRevision: (revisionTranslations.count ?? 0) + (revisionRecordings.count ?? 0),
        rejected: (rejectedTranslations.count ?? 0) + (rejectedRecordings.count ?? 0),
        expertReview: (expertTranslations.count ?? 0) + (expertRecordings.count ?? 0),
        consensusDecisions: consensus.count ?? 0,
        openAlerts: alerts.data ?? []
      },
      targets: {
        corpus: 1_200_000,
        translations: Math.max(1, (corpus.count ?? 0) * (languages.count ?? 68)),
        recordings: Math.max(1, (corpus.count ?? 0) * (languages.count ?? 68))
      },
      recordings: recordingRows,
      translations: recentTranslations.data ?? [],
      imports: imports.data ?? [],
      pipeline: {
        pilot: {
          targetContributors: 30,
          targetLanguages: 3,
          targetDomains: ["health", "agriculture", "public services"],
          contributorProgress: Math.min(100, Math.round((summaryCounts.contributors / 30) * 100)),
          languageProgress: Math.min(100, Math.round((summaryCounts.languages / 3) * 100)),
          status: summaryCounts.contributors >= 10 && summaryCounts.approved > 0 ? "active" : "setup"
        },
        counts: pipelineCounts,
        clientIngests: safeRows(recentIngests),
        trainingJobs: safeRows(recentTrainingJobs),
        modelReleases: safeRows(recentModels)
      },
      readiness: readinessItems(readinessCounts),
      missions: safeRows(missions),
      languageMetrics: safeRows(languageMetrics),
      governance: {
        reputationProfiles: safeCount(reputationRows),
        missionCount: safeRows(missions).length,
        languageMetricCount: safeRows(languageMetrics).length,
        provenanceEndpoint: "/api/provenance?targetType=translation&targetId=..."
      }
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
