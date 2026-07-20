import { getServiceSupabase } from "./supabase";

export type ClientService = {
  slug: string;
  title: string;
  description: string;
  service_type: string;
  status: string;
  metric: string;
};

export type DatasetRelease = {
  slug: string;
  name: string;
  version: string;
  language_codes: string[];
  domains: string[];
  unit_count: number;
  audio_hours: number;
  status: string;
  license: string;
};

export type ModelRelease = {
  slug: string;
  name: string;
  model_type: string;
  version: string;
  language_codes: string[];
  quality_score: number;
  status: string;
};

export type VoiceModel = {
  slug: string;
  display_name: string;
  language_code: string;
  tone: string;
  readiness_score: number;
  status: string;
};

export type ClientCatalog = {
  services: ClientService[];
  datasets: DatasetRelease[];
  models: ModelRelease[];
  voices: VoiceModel[];
  source: "database" | "fallback";
};

export const fallbackClientCatalog: ClientCatalog = {
  source: "fallback",
  services: [
    {
      slug: "translation-api",
      title: "Translation API",
      description: "Real-time English, Kiswahili, and Kenyan-language translation backed by reviewed community data.",
      service_type: "translation",
      status: "API ready",
      metric: "68 languages"
    },
    {
      slug: "speech-to-text",
      title: "Speech-to-text",
      description: "Transcribe approved Kenyan language audio for support calls, field reports, clinics, and research.",
      service_type: "speech_to_text",
      status: "Training",
      metric: "QA gated"
    },
    {
      slug: "text-to-speech",
      title: "Text-to-speech voices",
      description: "Natural AI voices for local language IVR, accessibility, learning content, and public messages.",
      service_type: "text_to_speech",
      status: "Voice bank",
      metric: "Multi-speaker"
    },
    {
      slug: "dataset-licensing",
      title: "Dataset licensing",
      description: "Approved train/dev/test splits with consent, provenance, review history, and export manifests.",
      service_type: "dataset",
      status: "Exportable",
      metric: "Versioned"
    },
    {
      slug: "language-assistant",
      title: "Language assistant",
      description: "Deploy a client-specific assistant that understands local terms, tone, and service workflows.",
      service_type: "assistant",
      status: "Private model",
      metric: "RAG + voice"
    },
    {
      slug: "human-review",
      title: "Human review network",
      description: "Route difficult translations, audio, and dialect variants to verified language reviewers.",
      service_type: "human_review",
      status: "Managed QA",
      metric: "Consensus"
    }
  ],
  datasets: [
    {
      slug: "everyday-vocabulary-v0-7",
      name: "Everyday vocabulary",
      version: "v0.7",
      language_codes: ["en", "sw", "sheng", "kikuyu", "dholuo"],
      domains: ["everyday conversation"],
      unit_count: 69423,
      audio_hours: 0,
      status: "published",
      license: "Commercial evaluation"
    },
    {
      slug: "health-access-v0-4",
      name: "Health access pack",
      version: "v0.4",
      language_codes: ["en", "sw", "giri", "poko", "meru"],
      domains: ["health"],
      unit_count: 12800,
      audio_hours: 0,
      status: "qa",
      license: "Restricted client pilot"
    },
    {
      slug: "public-services-v0-5",
      name: "Public services pack",
      version: "v0.5",
      language_codes: ["en", "sw", "sheng"],
      domains: ["public services"],
      unit_count: 18200,
      audio_hours: 0,
      status: "qa",
      license: "Restricted client pilot"
    },
    {
      slug: "voice-seed-bank",
      name: "Voice seed bank",
      version: "QA gated",
      language_codes: ["sw", "sheng", "giri", "gusii", "maasai"],
      domains: ["voice"],
      unit_count: 2400000,
      audio_hours: 0,
      status: "training",
      license: "Consent gated"
    }
  ],
  models: [
    {
      slug: "sema-translate-ke-v0-1",
      name: "Sema Translate KE",
      model_type: "translation",
      version: "v0.1",
      language_codes: ["en", "sw"],
      quality_score: 78,
      status: "evaluation"
    },
    {
      slug: "sema-stt-ke-v0-1",
      name: "Sema Speech KE",
      model_type: "speech_to_text",
      version: "v0.1",
      language_codes: ["sw"],
      quality_score: 62,
      status: "training"
    }
  ],
  voices: [
    { slug: "nia-sw", display_name: "Nia", language_code: "sw", tone: "Warm public-service voice", readiness_score: 92, status: "pilot" },
    { slug: "amani-sheng", display_name: "Amani", language_code: "sheng", tone: "Youth support and commerce", readiness_score: 74, status: "training" },
    { slug: "moraa-gusii", display_name: "Moraa", language_code: "gusii", tone: "Health and education narration", readiness_score: 68, status: "training" },
    { slug: "lemayan-maa", display_name: "Lemayan", language_code: "maasai", tone: "Community announcements", readiness_score: 61, status: "training" }
  ]
};

export async function getClientCatalog(): Promise<ClientCatalog> {
  const supabase = getServiceSupabase();
  const [services, datasets, models, voices] = await Promise.all([
    supabase.from("client_services").select("*").eq("active", true).order("sort_order"),
    supabase.from("dataset_releases").select("*").in("status", ["published", "qa", "training"]).order("published_at", { ascending: false }),
    supabase.from("model_releases").select("*").in("status", ["published", "evaluation", "training"]).order("created_at", { ascending: false }),
    supabase.from("voice_models").select("*").in("status", ["published", "qa", "training"]).order("readiness_score", { ascending: false })
  ]);

  if (services.error || datasets.error || models.error || voices.error) {
    return fallbackClientCatalog;
  }

  return {
    source: "database",
    services: services.data?.length ? services.data as ClientService[] : fallbackClientCatalog.services,
    datasets: datasets.data?.length ? datasets.data as DatasetRelease[] : fallbackClientCatalog.datasets,
    models: models.data?.length ? models.data as ModelRelease[] : fallbackClientCatalog.models,
    voices: voices.data?.length ? voices.data as VoiceModel[] : fallbackClientCatalog.voices
  };
}
