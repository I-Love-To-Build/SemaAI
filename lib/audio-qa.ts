export type AudioQaInput = {
  durationMs: number;
  sampleRate: number;
  byteSize?: number;
  silenceRatio?: number;
  clippingRatio?: number;
  snrDb?: number;
};

export type AudioQaResult = {
  autoPass: boolean;
  reasons: string[];
  score: number;
};

export function evaluateAudioQa(input: AudioQaInput): AudioQaResult {
  const reasons: string[] = [];

  if (input.durationMs < 750) reasons.push("Recording is too short.");
  if (input.durationMs > 120000) reasons.push("Recording is too long for a single prompt.");
  if (input.sampleRate < 16000) reasons.push("Sample rate is below 16 kHz.");
  if (typeof input.byteSize === "number" && input.byteSize < 1000) reasons.push("Audio file is too small.");
  if (typeof input.silenceRatio === "number" && input.silenceRatio > 0.45) reasons.push("Too much silence detected.");
  if (typeof input.clippingRatio === "number" && input.clippingRatio > 0.03) reasons.push("Clipping detected.");
  if (typeof input.snrDb === "number" && input.snrDb < 15) reasons.push("Signal-to-noise ratio is low.");

  const score = Math.max(0, 100 - reasons.length * 18);

  return {
    autoPass: reasons.length === 0,
    reasons,
    score
  };
}
