export const contributorModules = [
  {
    stage: "Profile",
    title: "Contributor identity",
    description: "Language skills, dialect notes, consent, speaker profile, and reviewer eligibility."
  },
  {
    stage: "Corpus",
    title: "Corpus assignments",
    description: "Words, terms, phrases, sentences, idioms, and domain tasks routed by language need."
  },
  {
    stage: "Speech",
    title: "Audio studio",
    description: "Prompt reading, spontaneous speech, waveform preview, re-recording, and audio metadata."
  },
  {
    stage: "Review",
    title: "Validation queue",
    description: "Peer checks, expert review, dispute notes, and language-lead decisions."
  },
  {
    stage: "Rewards",
    title: "Progress and rewards",
    description: "Approved work, quality score, mission streaks, badges, and payout status."
  },
  {
    stage: "Release",
    title: "Dataset readiness",
    description: "Coverage gaps, consent status, review depth, speaker balance, and final release checks."
  }
];

export const corpusDomains = [
  "health",
  "agriculture",
  "education",
  "finance",
  "public services",
  "climate",
  "commerce",
  "transport",
  "culture",
  "everyday conversation"
] as const;

export const reviewStates = [
  "draft",
  "submitted",
  "peer_review",
  "expert_review",
  "needs_revision",
  "approved",
  "rejected",
  "exported"
] as const;
