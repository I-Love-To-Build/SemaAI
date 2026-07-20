import { NextResponse } from "next/server";
import { auditEvent, checkRateLimit, jsonError, parseJson, requireUser } from "@/lib/api";
import { recordingSchema } from "@/lib/contracts";
import { validateRecordingQuality } from "@/lib/quality";

export async function POST(request: Request) {
  const limited = checkRateLimit(request, "recordings");
  if (limited) return limited;

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, recordingSchema);
  if (!parsed.ok) return parsed.response;

  const quality = validateRecordingQuality({
    durationMs: parsed.data.durationMs,
    sampleRate: parsed.data.sampleRate,
    qa: parsed.data.qa
  });

  if (!quality.ok) {
    return jsonError("Recording did not pass the automatic audio quality gate.", 422, {
      score: quality.score,
      reasons: quality.reasons
    });
  }

  const { data, error } = await auth.supabase
    .from("recordings")
    .insert({
      corpus_item_id: parsed.data.corpusItemId,
      language_code: parsed.data.languageCode,
      contributor_id: auth.user.id,
      storage_path: parsed.data.storagePath,
      duration_ms: parsed.data.durationMs,
      sample_rate: parsed.data.sampleRate,
      device_label: parsed.data.deviceLabel ?? null,
      environment: parsed.data.environment,
      speaker_profile_id: parsed.data.speakerProfileId ?? null,
      consent_record_id: parsed.data.consentRecordId,
      qa: { ...parsed.data.qa, score: quality.score, reasons: quality.reasons, autoPass: quality.status === "peer_review" },
      status: quality.status
    })
    .select("id,status")
    .single();

  if (error) {
    return jsonError(error.message, 500);
  }

  await auth.supabase
    .from("task_claims")
    .update({ status: "submitted" })
    .eq("corpus_item_id", parsed.data.corpusItemId)
    .eq("contributor_id", auth.user.id)
    .eq("task_type", "recording");

  await auditEvent(auth.user.id, "recording_submitted", "recording", data.id, {
    languageCode: parsed.data.languageCode,
    durationMs: parsed.data.durationMs,
    qualityScore: quality.score,
    qualityReasons: quality.reasons
  });

  return NextResponse.json(data, { status: 201 });
}
