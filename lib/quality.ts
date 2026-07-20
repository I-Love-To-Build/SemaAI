export type QualityResult = {
  ok: boolean;
  status: "peer_review" | "needs_revision" | "expert_review";
  score: number;
  reasons: string[];
};

export type ReviewDecision = {
  finalState: "peer_review" | "expert_review" | "approved" | "rejected" | "needs_revision";
  confidence: number;
  decided: boolean;
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateTranslationQuality(input: {
  sourceText: string;
  sourceLanguageCode: string;
  targetLanguageCode: string;
  translationText: string;
  unitType?: string;
}) {
  const reasons: string[] = [];
  const source = normalizeText(input.sourceText);
  const translation = normalizeText(input.translationText);
  const sourceWords = source.split(" ").filter(Boolean);
  const translationWords = translation.split(" ").filter(Boolean);

  if (!translation) reasons.push("Translation is empty.");
  if (source !== translation && translation.length < 2) reasons.push("Translation is too short to review.");
  if (input.sourceLanguageCode !== input.targetLanguageCode && source === translation) {
    reasons.push("Translation is identical to the source text.");
  }
  if (/(.)\1{7,}/u.test(translation)) reasons.push("Translation contains repeated characters that look like spam.");
  if (translationWords.length > Math.max(20, sourceWords.length * 5)) {
    reasons.push("Translation is much longer than the source and needs reviewer attention.");
  }
  if (/https?:\/\/|www\./i.test(input.translationText)) reasons.push("Translation should not contain links.");

  const score = Math.max(0, 100 - reasons.length * 25);
  return {
    ok: score >= 60,
    status: score >= 85 ? "peer_review" : "needs_revision",
    score,
    reasons
  } satisfies QualityResult;
}

export function validateRecordingQuality(input: {
  durationMs: number;
  sampleRate: number;
  qa: {
    snrDb?: number;
    clippingRatio?: number;
    silenceRatio?: number;
  };
}) {
  const reasons: string[] = [];
  if (input.durationMs < 750) reasons.push("Recording is too short.");
  if (input.durationMs > 120000) reasons.push("Recording is too long for a single contribution.");
  if (input.sampleRate < 16000) reasons.push("Sample rate is below 16 kHz.");
  if (typeof input.qa.silenceRatio === "number" && input.qa.silenceRatio > 0.45) reasons.push("Too much silence detected.");
  if (typeof input.qa.clippingRatio === "number" && input.qa.clippingRatio > 0.03) reasons.push("Clipping detected.");
  if (typeof input.qa.snrDb === "number" && input.qa.snrDb < 15) reasons.push("Signal-to-noise ratio is low.");

  const score = Math.max(0, 100 - reasons.length * 18);
  return {
    ok: score >= 70,
    status: score >= 88 ? "peer_review" : "needs_revision",
    score,
    reasons
  } satisfies QualityResult;
}

export function decideReviewConsensus(reviews: Array<{ state: string; score: number | string }>) {
  const scored = reviews.map((review) => ({
    state: review.state,
    score: Number(review.score)
  }));
  const approvals = scored.filter((review) => review.state === "approved" && review.score >= 80);
  const rejections = scored.filter((review) => review.state === "rejected" || review.state === "needs_revision");
  const average = scored.length
    ? scored.reduce((sum, review) => sum + review.score, 0) / scored.length
    : 0;

  if (rejections.length >= 2 || scored.some((review) => review.score < 35)) {
    return { finalState: "needs_revision", confidence: Math.max(60, 100 - average), decided: true } satisfies ReviewDecision;
  }

  if (approvals.length >= 2 && average >= 88) {
    return { finalState: "approved", confidence: average, decided: true } satisfies ReviewDecision;
  }

  if (scored.length >= 3 && average < 75) {
    return { finalState: "expert_review", confidence: average, decided: true } satisfies ReviewDecision;
  }

  return {
    finalState: scored.length >= 2 ? "expert_review" : "peer_review",
    confidence: average,
    decided: false
  } satisfies ReviewDecision;
}
