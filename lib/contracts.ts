import { z } from "zod";
import { corpusDomains, reviewStates } from "./platform";

export const corpusItemSchema = z.object({
  languageCode: z.string().min(2),
  sourceLanguageCode: z.string().min(2).optional(),
  text: z.string().min(1).max(5000),
  domain: z.enum(corpusDomains),
  license: z.string().min(2),
  sourceUri: z.string().url().optional(),
  difficulty: z.enum(["beginner", "intermediate", "advanced", "expert"]).default("intermediate"),
  metadata: z.record(z.unknown()).default({})
});

export const corpusImportSchema = z.object({
  importName: z.string().min(3).max(120),
  sourceType: z.enum(["upload", "api", "crawler", "partner", "manual"]),
  items: z.array(corpusItemSchema).min(1).max(10000)
});

export const profileSchema = z.object({
  displayName: z.string().min(2).max(120),
  homeLanguageCode: z.string().min(2).optional(),
  county: z.string().max(120).optional(),
  languages: z.array(z.string().min(2)).length(1)
});

export const consentSchema = z.object({
  consentVersion: z.string().min(3).max(40),
  allowsTraining: z.boolean(),
  allowsOpenRelease: z.boolean().default(false)
});

export const speakerProfileSchema = z.object({
  languageCode: z.string().min(2),
  dialectId: z.string().uuid().optional(),
  ageBand: z.enum(["18-24", "25-34", "35-44", "45-54", "55+"]).optional(),
  gender: z.enum(["female", "male", "non_binary", "prefer_not_to_say", "other"]).optional(),
  region: z.string().max(120).optional(),
  microphoneType: z.string().max(120).optional()
});

export const taskClaimSchema = z.object({
  languageCode: z.string().min(2),
  sourceLanguageCode: z.enum(["en", "sw"]).default("en"),
  taskType: z.enum(["translation", "recording", "transcription", "review"]),
  domain: z.enum(corpusDomains).optional(),
  limit: z.number().int().min(1).max(25).default(10)
});

export const signedUploadSchema = z.object({
  languageCode: z.string().min(2),
  corpusItemId: z.string().uuid(),
  contentType: z.enum(["audio/webm", "audio/wav", "audio/mpeg", "audio/mp4", "audio/ogg"]),
  byteSize: z.number().int().min(1000).max(50 * 1024 * 1024)
});

export const recordingSchema = z.object({
  corpusItemId: z.string().uuid(),
  languageCode: z.string().min(2),
  storagePath: z.string().min(5),
  durationMs: z.number().int().positive(),
  sampleRate: z.number().int().positive(),
  deviceLabel: z.string().max(160).optional(),
  environment: z.enum(["quiet_room", "outdoor", "market", "vehicle", "office", "other"]),
  speakerProfileId: z.string().uuid().optional(),
  consentRecordId: z.string().uuid(),
  qa: z.object({
    snrDb: z.number().optional(),
    clippingRatio: z.number().min(0).max(1).optional(),
    silenceRatio: z.number().min(0).max(1).optional(),
    autoPass: z.boolean().default(false)
  })
});

export const translationSchema = z.object({
  corpusItemId: z.string().uuid(),
  languageCode: z.string().min(2),
  text: z.string().min(1).max(10000),
  dialectId: z.string().uuid().optional()
});

export const transcriptionSchema = z.object({
  recordingId: z.string().uuid(),
  text: z.string().min(1).max(10000)
});

export const reviewSchema = z.object({
  targetType: z.enum(["corpus_item", "translation", "recording", "transcription"]),
  targetId: z.string().uuid(),
  state: z.enum(reviewStates),
  score: z.number().min(0).max(100),
  reasons: z.array(z.string()).default([]),
  notes: z.string().max(2000).optional()
});

export const issueReportSchema = z.object({
  targetType: z.enum(["corpus_item", "translation", "recording", "transcription", "profile", "other"]),
  targetId: z.string().uuid().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  issueType: z.string().min(2).max(80),
  description: z.string().min(5).max(3000)
});

export const searchSchema = z.object({
  q: z.string().max(200).default(""),
  languageCode: z.string().min(2).optional(),
  domain: z.enum(corpusDomains).optional(),
  status: z.enum(reviewStates).optional(),
  limit: z.number().int().min(1).max(100).default(25)
});

export const monitoringEventSchema = z.object({
  level: z.enum(["info", "warn", "error"]),
  event: z.string().min(2).max(120),
  metadata: z.record(z.unknown()).default({})
});

export const exportSchema = z.object({
  name: z.string().min(3).max(140),
  languageCodes: z.array(z.string().min(2)).min(1),
  domains: z.array(z.enum(corpusDomains)).default([]),
  minimumReviewScore: z.number().min(0).max(100).default(90),
  includeAudio: z.boolean().default(true)
});
