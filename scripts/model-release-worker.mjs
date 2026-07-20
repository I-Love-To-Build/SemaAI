import { getAdminClient } from "./supabase-admin.mjs";

const supabase = getAdminClient();
const minDatasetScore = Number(process.env.SEMA_MIN_DATASET_SCORE || 85);
const minModelScore = Number(process.env.SEMA_MIN_MODEL_SCORE || 80);
const trainerUrl = process.env.SEMA_TRAINING_WEBHOOK_URL;
const evaluatorUrl = process.env.SEMA_EVALUATION_WEBHOOK_URL;

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function alert(severity, source, message, metadata = {}) {
  await supabase.from("alert_events").insert({ severity, source, message, metadata });
}

function scoreIngest(ingest) {
  const reasons = [];
  if (!ingest.consent?.allowsTraining) reasons.push("missing training consent");
  if (!ingest.language_codes?.length) reasons.push("missing language coverage");
  if ((ingest.unit_count ?? 0) < 100 && Number(ingest.audio_hours ?? 0) <= 0) reasons.push("too little data");
  if (!ingest.storage_path && ingest.source_type !== "api") reasons.push("missing storage path");

  return {
    score: Math.max(0, 100 - reasons.length * 25),
    reasons
  };
}

async function processIngests() {
  const { data: ingests, error } = await supabase
    .from("client_data_ingests")
    .select("*")
    .in("status", ["queued", "validating"])
    .order("created_at")
    .limit(25);

  if (error) throw error;

  let accepted = 0;
  for (const ingest of ingests ?? []) {
    const quality = scoreIngest(ingest);
    if (quality.score < minDatasetScore) {
      await supabase
        .from("client_data_ingests")
        .update({
          status: "rejected",
          quality_score: quality.score,
          rejection_reasons: quality.reasons,
          updated_at: new Date().toISOString()
        })
        .eq("id", ingest.id);
      await alert("warn", "client_data_ingest", "Client data ingest rejected by quality gate.", { ingestId: ingest.id, reasons: quality.reasons });
      continue;
    }

    const releaseSlug = `client-${slugify(ingest.name)}-${ingest.id.slice(0, 8)}`;
    const { data: dataset, error: datasetError } = await supabase
      .from("dataset_releases")
      .upsert({
        slug: releaseSlug,
        name: ingest.name,
        version: "client-intake",
        language_codes: ingest.language_codes,
        domains: ingest.domains ?? [],
        unit_count: ingest.unit_count ?? 0,
        audio_hours: ingest.audio_hours ?? 0,
        status: "qa",
        license: ingest.consent?.license ?? "Client restricted",
        storage_path: ingest.storage_path ?? null,
        provenance: { source: "client_data_ingest", organization_id: ingest.organization_id, ingest_id: ingest.id },
        evaluation: { quality_score: quality.score },
        published_at: null
      }, { onConflict: "slug" })
      .select("id,slug")
      .single();

    if (datasetError) throw datasetError;

    const modelTypes = Number(ingest.audio_hours ?? 0) > 0
      ? ["speech_to_text", "text_to_speech"]
      : ["translation"];

    for (const modelType of modelTypes) {
      const { error: jobError } = await supabase.from("training_jobs").insert({
        organization_id: ingest.organization_id,
        ingest_id: ingest.id,
        dataset_release_id: dataset.id,
        model_type: modelType,
        language_codes: ingest.language_codes,
        domains: ingest.domains ?? [],
        status: "queued",
        metrics: { dataset_quality_score: quality.score }
      });
      if (jobError) throw jobError;
    }

    await supabase
      .from("client_data_ingests")
      .update({
        status: "training_queued",
        quality_score: quality.score,
        updated_at: new Date().toISOString()
      })
      .eq("id", ingest.id);
    accepted += 1;
  }

  return accepted;
}

async function sendTrainingJobs() {
  const { data: jobs, error } = await supabase
    .from("training_jobs")
    .select("*, dataset_releases(slug,storage_path)")
    .eq("status", "queued")
    .order("created_at")
    .limit(20);

  if (error) throw error;

  let sent = 0;
  for (const job of jobs ?? []) {
    if (!trainerUrl) {
      await alert("info", "training", "Training job is queued; SEMA_TRAINING_WEBHOOK_URL is not configured.", { jobId: job.id });
      continue;
    }

    const response = await fetch(trainerUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jobId: job.id,
        modelType: job.model_type,
        languageCodes: job.language_codes,
        domains: job.domains,
        datasetReleaseId: job.dataset_release_id,
        storagePath: job.dataset_releases?.storage_path ?? null
      })
    });

    if (!response.ok) {
      await supabase.from("training_jobs").update({ status: "failed", error: await response.text() }).eq("id", job.id);
      continue;
    }

    const payload = await response.json();
    await supabase
      .from("training_jobs")
      .update({
        status: "sent_to_trainer",
        training_provider: payload.provider ?? "external",
        external_job_id: payload.externalJobId ?? null,
        updated_at: new Date().toISOString()
      })
      .eq("id", job.id);
    sent += 1;
  }

  return sent;
}

async function evaluateJobs() {
  const { data: jobs, error } = await supabase
    .from("training_jobs")
    .select("*")
    .in("status", ["evaluation_queued", "evaluation_passed"])
    .order("updated_at")
    .limit(20);

  if (error) throw error;

  let published = 0;
  for (const job of jobs ?? []) {
    let score = Number(job.metrics?.quality_score ?? 0);
    let endpointUrl = job.endpoint_url;
    let metrics = job.metrics ?? {};

    if (job.status === "evaluation_queued" && evaluatorUrl) {
      const response = await fetch(evaluatorUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: job.id, modelType: job.model_type, languageCodes: job.language_codes, endpointUrl })
      });

      if (response.ok) {
        const payload = await response.json();
        score = Number(payload.score ?? score);
        endpointUrl = payload.endpointUrl ?? endpointUrl;
        metrics = { ...metrics, ...payload.metrics };
      }
    }

    const passed = score >= minModelScore && Boolean(endpointUrl);
    await supabase.from("evaluation_runs").insert({
      training_job_id: job.id,
      model_type: job.model_type,
      language_codes: job.language_codes,
      domains: job.domains ?? [],
      score,
      passed,
      thresholds: { minModelScore },
      metrics
    });

    if (!passed) {
      await supabase
        .from("training_jobs")
        .update({ status: "evaluation_failed", metrics, endpoint_url: endpointUrl ?? null, updated_at: new Date().toISOString() })
        .eq("id", job.id);
      await alert("warn", "evaluation", "Model did not pass release gates.", { jobId: job.id, score, minModelScore });
      continue;
    }

    const releaseSlug = `model-${job.model_type}-${job.id.slice(0, 8)}`;
    const { error: releaseError } = await supabase.from("model_releases").upsert({
      slug: releaseSlug,
      name: `Sema ${job.model_type.replaceAll("_", " ")}`,
      model_type: job.model_type,
      version: new Date().toISOString().slice(0, 10),
      language_codes: job.language_codes,
      domains: job.domains ?? [],
      dataset_release_ids: job.dataset_release_id ? [job.dataset_release_id] : [],
      quality_score: score,
      status: "published",
      endpoint_url: endpointUrl,
      evaluation: metrics
    }, { onConflict: "slug" });

    if (releaseError) throw releaseError;

    await supabase
      .from("training_jobs")
      .update({ status: "published", metrics, endpoint_url: endpointUrl, updated_at: new Date().toISOString() })
      .eq("id", job.id);
    published += 1;
  }

  return published;
}

const accepted = await processIngests();
const sent = await sendTrainingJobs();
const published = await evaluateJobs();

console.log(JSON.stringify({ acceptedIngests: accepted, sentTrainingJobs: sent, publishedModels: published }, null, 2));
