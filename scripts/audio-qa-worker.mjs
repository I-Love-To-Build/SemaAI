import { getAdminClient } from "./supabase-admin.mjs";

function evaluateAudioQa(input) {
  const reasons = [];
  if (input.durationMs < 750) reasons.push("Recording is too short.");
  if (input.durationMs > 120000) reasons.push("Recording is too long for a single prompt.");
  if (input.sampleRate < 16000) reasons.push("Sample rate is below 16 kHz.");
  if (typeof input.silenceRatio === "number" && input.silenceRatio > 0.45) reasons.push("Too much silence detected.");
  if (typeof input.clippingRatio === "number" && input.clippingRatio > 0.03) reasons.push("Clipping detected.");
  if (typeof input.snrDb === "number" && input.snrDb < 15) reasons.push("Signal-to-noise ratio is low.");
  return {
    autoPass: reasons.length === 0,
    reasons,
    score: Math.max(0, 100 - reasons.length * 18)
  };
}

const requiredEnv = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = requiredEnv.filter((name) => !process.env[name]);

if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const supabase = getAdminClient();
const { data, error } = await supabase
  .from("recordings")
  .select("id,duration_ms,sample_rate,qa,status")
  .in("status", ["submitted", "needs_revision"])
  .limit(100);

if (error) throw error;

let processed = 0;
for (const recording of data ?? []) {
  const qa = evaluateAudioQa({
    durationMs: recording.duration_ms,
    sampleRate: recording.sample_rate,
    silenceRatio: recording.qa?.silenceRatio,
    clippingRatio: recording.qa?.clippingRatio,
    snrDb: recording.qa?.snrDb
  });

  const { error: updateError } = await supabase
    .from("recordings")
    .update({
      qa: { ...(recording.qa ?? {}), ...qa },
      status: qa.autoPass ? "peer_review" : "needs_revision"
    })
    .eq("id", recording.id);

  if (updateError) throw updateError;
  processed += 1;
}

console.log(`Audio QA worker processed ${processed} recordings.`);
