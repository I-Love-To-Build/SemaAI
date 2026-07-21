"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/browser-supabase";
import type { SemaLanguage } from "@/lib/languages";

type Task = {
  id: string;
  language_code: string;
  text: string;
  domain: string;
  difficulty: string;
  status: string;
  metadata?: { unit_type?: string; [key: string]: unknown };
};

type Profile = {
  id: string;
  display_name: string;
  home_language_code: string | null;
  county: string | null;
  reviewer_score: number;
  payout_method?: "none" | "mpesa" | "airtel_money" | "bank_transfer" | "other" | null;
  payout_phone?: string | null;
  payout_name?: string | null;
  payout_notes?: string | null;
  payout_opt_in?: boolean | null;
  consent_records?: Array<{ id: string }>;
  speaker_profiles?: Array<{ id: string; language_code: string }>;
};

type DashboardData = {
  stats: {
    total: number;
    today: number;
    approved: number;
    pending: number;
    rejected: number;
    activeClaims: number;
    audioSeconds: number;
    points: number;
  };
  roles: Array<{ role: string; language_code: string | null }>;
  recent: Array<{
    id: string;
    type: string;
    languageCode: string;
    status: string;
    createdAt: string;
    title: string;
    source?: string;
  }>;
  reputation?: ContributorReputation | null;
};

type ContributorReputation = {
  reputation_score: number;
  level: string;
  total_contributions: number;
  approved_contributions: number;
  rejected_contributions: number;
  pending_contributions: number;
  audio_seconds: number;
  badges: string[];
};

type Mission = {
  id: string;
  slug: string;
  title: string;
  description: string;
  domain: string;
  language_codes: string[];
  target_items: number;
  status: string;
  priority: number;
  governance_notes?: string | null;
  approvedItems: number;
  progress: number;
};

type LanguageMetric = {
  language_code: string;
  source_items: number;
  translations_total: number;
  translations_approved: number;
  recordings_total: number;
  recordings_approved: number;
  audio_seconds: number;
  review_decisions: number;
  contributor_count: number;
  text_coverage: number;
  audio_coverage: number;
  review_coverage: number;
  readiness_score: number;
  updated_at: string;
};

type ProvenanceLedger = {
  target: { type: string; id: string; status: string; languageCode: string | null; createdAt: string | null };
  source: { id: string; text: string; source_language_code: string; domain: string; difficulty: string; metadata?: Record<string, unknown> } | null;
  contribution: { id: string; text: string | null; durationMs: number | null; qaReport?: Record<string, unknown> | null; metadata?: Record<string, unknown> };
  rights: { consent: unknown; speaker: unknown; sourceLicense: unknown };
  reviewTrail: Array<{ id: string; decision: string; notes: string | null; reviewerRole: string | null; reviewerName: string; createdAt: string }>;
  consensusTrail: Array<Record<string, unknown>>;
  auditTrail: Array<Record<string, unknown>>;
  exportReady: boolean;
};

export type AppView = "home" | "contribute" | "vocabulary" | "missions" | "intelligence" | "governance" | "history" | "languages" | "profile" | "settings";

const domains = [
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
];

const missionTemplates = [
  {
    id: "health-access",
    title: "Health access sprint",
    domain: "health",
    languages: ["sw", "sheng", "giri", "poko"],
    target: 500,
    description: "Translate and record urgent clinic, pharmacy, maternal health, and emergency-care language."
  },
  {
    id: "agriculture-extension",
    title: "Agriculture extension pack",
    domain: "agriculture",
    languages: ["sw", "kikuyu", "kamba", "dholuo"],
    target: 600,
    description: "Build farmer-facing vocabulary for crops, weather, pests, markets, and extension support."
  },
  {
    id: "public-services",
    title: "Public services access",
    domain: "public services",
    languages: ["sw", "sheng", "gusii", "meru"],
    target: 700,
    description: "Cover citizen-service tasks like hospitals, IDs, county offices, schools, and help lines."
  },
  {
    id: "endangered-voices",
    title: "Endangered language preservation",
    domain: "culture",
    languages: ["yaaku", "dahalo", "elmolo", "aweer"],
    target: 300,
    description: "Prioritize careful, community-reviewed text and speech for low-resource Kenyan languages."
  }
];

const tutorialSteps: Array<{ title: string; body: string; action: string; view: AppView }> = [
  {
    title: "Set up your profile",
    body: "Choose your main language, region, consent, speaker profile, and optional payout contact.",
    action: "Open profile",
    view: "profile"
  },
  {
    title: "Translate and record",
    body: "Claim a small task batch, translate the item, record yourself saying it, then submit both.",
    action: "Start batch",
    view: "contribute"
  },
  {
    title: "Pick vocabulary directly",
    body: "Browse words, phrases, sentences, terms, idioms, and proverbs without waiting for a batch.",
    action: "Browse words",
    view: "vocabulary"
  },
  {
    title: "Follow missions",
    body: "Work on focused topics like health, agriculture, education, public services, and climate.",
    action: "See missions",
    view: "missions"
  },
  {
    title: "Track your work",
    body: "Check review status, accepted work, points, and items that need changes.",
    action: "My work",
    view: "history"
  }
];

const selectedCorpusItemKey = "sema:selected-corpus-item";
const allowedAudioContentTypes = new Set(["audio/webm", "audio/wav", "audio/mpeg", "audio/mp4", "audio/ogg"]);

function normalizeAudioContentType(type: string) {
  const normalized = type.toLowerCase().split(";")[0].trim();
  if (allowedAudioContentTypes.has(normalized)) return normalized;
  if (["audio/x-m4a", "audio/m4a", "audio/aac", "audio/x-aac"].includes(normalized)) return "audio/mp4";
  if (["audio/mp3", "audio/x-mpeg"].includes(normalized)) return "audio/mpeg";
  return "audio/mp4";
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const bytesPerSample = 2;
  const blockAlign = 1 * bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  function writeString(offset: number, value: string) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (let index = 0; index < samples.length; index += 1, offset += 2) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return new Blob([view], { type: "audio/wav" });
}

function mergeAudioBuffers(chunks: Float32Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

export default function ContributorApp({ languages, initialView = "home" }: { languages: SemaLanguage[]; initialView?: AppView }) {
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up" | "forgot" | "check-email">("sign-in");
  const [authBusy, setAuthBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [county, setCounty] = useState("");
  const [languageCode, setLanguageCode] = useState("sw");
  const [payoutMethod, setPayoutMethod] = useState<"none" | "mpesa" | "airtel_money" | "bank_transfer" | "other">("none");
  const [payoutPhone, setPayoutPhone] = useState("");
  const [payoutName, setPayoutName] = useState("");
  const [payoutNotes, setPayoutNotes] = useState("");
  const [payoutOptIn, setPayoutOptIn] = useState(false);
  const [sourceLanguageCode, setSourceLanguageCode] = useState<"en" | "sw">("en");
  const [domain, setDomain] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [translation, setTranslation] = useState("");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Task[]>([]);
  const [vocabularySearch, setVocabularySearch] = useState("");
  const [vocabularyUnit, setVocabularyUnit] = useState<"word" | "phrase" | "sentence" | "term" | "idiom" | "proverb" | "all">("word");
  const [vocabularyDomain, setVocabularyDomain] = useState("");
  const [vocabularyItems, setVocabularyItems] = useState<Task[]>([]);
  const [vocabularyCount, setVocabularyCount] = useState(0);
  const [vocabularyDrafts, setVocabularyDrafts] = useState<Record<string, string>>({});
  const [vocabularySubmitting, setVocabularySubmitting] = useState<Record<string, boolean>>({});
  const [activeVocabularyRecordingId, setActiveVocabularyRecordingId] = useState<string | null>(null);
  const [consentId, setConsentId] = useState("");
  const [speakerProfileId, setSpeakerProfileId] = useState("");
  const [emailDigest, setEmailDigest] = useState(true);
  const [autoLoadTasks, setAutoLoadTasks] = useState(false);
  const [largeControls, setLargeControls] = useState(true);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [recordingMs, setRecordingMs] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState("Ready to record.");
  const [micReady, setMicReady] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [message, setMessage] = useState("Ready");
  const [activeView, setActiveView] = useState<AppView>(initialView);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [languageMetrics, setLanguageMetrics] = useState<LanguageMetric[]>([]);
  const [provenance, setProvenance] = useState<ProvenanceLedger | null>(null);
  const [provenanceBusy, setProvenanceBusy] = useState("");
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const microphoneStream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const wavProcessor = useRef<ScriptProcessorNode | null>(null);
  const wavSource = useRef<MediaStreamAudioSourceNode | null>(null);
  const wavChunks = useRef<Float32Array[]>([]);
  const wavSampleRate = useRef(48000);
  const recordingStartedAt = useRef<number>(0);
  const contributionAudioInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
        setPassword("");
        setConfirmPassword("");
      }
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      setDashboard(null);
      return;
    }
    loadProfile();
    loadDashboard();
    loadMissions();
    loadLanguageMetrics();
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => {
      loadDashboard();
      if (activeView === "missions") loadMissions();
      if (activeView === "intelligence") loadLanguageMetrics();
    }, 10_000);
    const refresh = () => {
      if (document.visibilityState === "visible") {
        loadDashboard();
        if (activeView === "missions") loadMissions();
        if (activeView === "intelligence") loadLanguageMetrics();
      }
    };
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [session?.access_token, activeView]);

  useEffect(() => {
    if (!session?.user.id) return;
    const stored = window.localStorage.getItem(`sema:settings:${session.user.id}`);
    if (!stored) return;
    try {
      const settings = JSON.parse(stored) as { emailDigest?: boolean; autoLoadTasks?: boolean; largeControls?: boolean };
      if (typeof settings.emailDigest === "boolean") setEmailDigest(settings.emailDigest);
      if (typeof settings.autoLoadTasks === "boolean") setAutoLoadTasks(settings.autoLoadTasks);
      if (typeof settings.largeControls === "boolean") setLargeControls(settings.largeControls);
    } catch {
      window.localStorage.removeItem(`sema:settings:${session.user.id}`);
    }
  }, [session?.user.id]);

  useEffect(() => {
    return () => stopMicrophoneStream();
  }, []);

  const token = session?.access_token;
  const activeLanguage = languages.find((language) => language.code === languageCode);
  const viewRoutes: Record<AppView, string> = {
    home: "/",
    contribute: "/contribute",
    vocabulary: "/vocabulary",
    missions: "/missions",
    intelligence: "/intelligence",
    governance: "/governance",
    history: "/my-work",
    languages: "/languages",
    profile: "/profile",
    settings: "/settings"
  };
  const routeViews = Object.fromEntries(Object.entries(viewRoutes).map(([view, route]) => [route, view])) as Record<string, AppView>;

  function navigateView(view: AppView) {
    setActiveView(view);
    if (typeof window !== "undefined" && window.location.pathname !== viewRoutes[view]) {
      window.history.pushState({ view }, "", viewRoutes[view]);
    }
  }
  const authRedirectUrl = (() => {
    const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    const origin = configured || (typeof window !== "undefined" ? window.location.origin : "");
    return origin.replace(/\/+$/, "");
  })();

  async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (!token) throw new Error("Sign in first.");
    const response = await fetch(path, {
      ...options,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        ...(options.headers ?? {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed");
    return payload as T;
  }

  async function loadMissions() {
    if (!token) return;
    try {
      const payload = await api<{ missions: Mission[] }>("/api/missions");
      setMissions(payload.missions ?? []);
    } catch {
      setMissions([]);
    }
  }

  async function loadLanguageMetrics() {
    if (!token) return;
    try {
      const payload = await api<{ metrics: LanguageMetric[] }>("/api/language-metrics");
      setLanguageMetrics(payload.metrics ?? []);
    } catch {
      setLanguageMetrics([]);
    }
  }

  async function loadProvenance(item: DashboardData["recent"][number]) {
    if (!token) return;
    const targetType = item.type.toLowerCase() === "recording" ? "recording" : item.type.toLowerCase() === "transcription" ? "transcription" : "translation";
    setProvenanceBusy(item.id);
    try {
      const payload = await api<ProvenanceLedger>(`/api/provenance?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(item.id)}`);
      setProvenance(payload);
      setMessage("Provenance ledger loaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load provenance.");
    } finally {
      setProvenanceBusy("");
    }
  }

  async function authenticate() {
    if (!email.trim()) {
      setMessage("Enter your email address.");
      return;
    }
    if (authMode === "sign-up") {
      if (signupName.trim().length < 2) {
        setMessage("Enter your full name.");
        return;
      }
      if (password.length < 10 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
        setMessage("Use at least 10 characters with an uppercase letter and a number.");
        return;
      }
      if (password !== confirmPassword) {
        setMessage("Passwords do not match.");
        return;
      }
      if (!legalAccepted) {
        setMessage("Accept the contributor terms and privacy notice to continue.");
        return;
      }
    }

    setAuthBusy(true);
    setMessage(authMode === "sign-in" ? "Signing you in..." : "Creating your account...");
    try {
      const action =
        authMode === "sign-in"
          ? supabase.auth.signInWithPassword({ email: email.trim(), password })
          : supabase.auth.signUp({
              email: email.trim(),
              password,
              options: {
                emailRedirectTo: authRedirectUrl,
                data: { display_name: signupName.trim(), contributor_terms_accepted: true }
              }
            });
      const { data, error } = await action;
      if (error) throw error;
      if (authMode === "sign-up" && !data.session) {
        setAuthMode("check-email");
        setMessage("We sent a secure verification link to your email.");
      } else {
        setMessage(authMode === "sign-in" ? "Welcome back." : "Account created.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed. Please try again.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function sendPasswordReset() {
    if (!email.trim()) {
      setMessage("Enter the email address connected to your account.");
      return;
    }
    setAuthBusy(true);
    setMessage("Sending reset link...");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authRedirectUrl
    });
    setAuthBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setAuthMode("check-email");
    setMessage("Password reset instructions are on their way.");
  }

  async function resendVerification() {
    if (!email.trim()) return;
    setAuthBusy(true);
    setMessage("Sending a new verification link...");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: authRedirectUrl }
    });
    setAuthBusy(false);
    setMessage(error ? error.message : "A fresh verification link has been sent.");
  }

  async function updateRecoveredPassword() {
    if (password.length < 10 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setMessage("Use at least 10 characters with an uppercase letter and a number.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    setAuthBusy(true);
    setMessage("Updating your password...");
    const { error } = await supabase.auth.updateUser({ password });
    setAuthBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setPasswordRecovery(false);
    setPassword("");
    setConfirmPassword("");
    setMessage("Password updated securely.");
  }

  async function loadProfile() {
    try {
      const data = await api<Profile>("/api/profile");
      setProfile(data);
      setDisplayName(data.display_name ?? "");
      setCounty(data.county ?? "");
      setLanguageCode(data.home_language_code ?? "sw");
      setPayoutMethod(data.payout_method ?? "none");
      setPayoutPhone(data.payout_phone ?? "");
      setPayoutName(data.payout_name ?? "");
      setPayoutNotes(data.payout_notes ?? "");
      setPayoutOptIn(Boolean(data.payout_opt_in));
      setConsentId(data.consent_records?.[0]?.id ?? "");
      setSpeakerProfileId(data.speaker_profiles?.find((item) => item.language_code === (data.home_language_code ?? "sw"))?.id ?? data.speaker_profiles?.[0]?.id ?? "");
      setMessage("Profile loaded.");
    } catch (error) {
      const metadataName = typeof session?.user.user_metadata?.display_name === "string"
        ? session.user.user_metadata.display_name
        : typeof session?.user.user_metadata?.full_name === "string"
          ? session.user.user_metadata.full_name
          : "";
      const rememberedName = session?.user.id ? window.localStorage.getItem(`sema:display-name:${session.user.id}`) ?? "" : "";
      setDisplayName((current) => current || rememberedName || metadataName);
      setMessage(error instanceof Error ? error.message : "Profile setup required.");
    }
  }

  async function loadDashboard() {
    try {
      const data = await api<DashboardData>("/api/dashboard");
      setDashboard(data);
    } catch {
      // New contributors may not have a profile-backed activity record yet.
    }
  }

  async function saveProfile() {
    setProfileBusy(true);
    setMessage("Saving profile and consent...");
    try {
      await api("/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          displayName,
          county,
          homeLanguageCode: languageCode,
          languages: [languageCode],
          payoutMethod,
          payoutPhone,
          payoutName,
          payoutNotes,
          payoutOptIn
        })
      });
      const consent = await api<{ id: string }>("/api/consent", {
        method: "POST",
        body: JSON.stringify({
          consentVersion: "2026-07",
          allowsTraining: true,
          allowsOpenRelease: false
        })
      });
      setConsentId(consent.id);
      const speaker = await api<{ id: string }>("/api/speaker-profiles", {
        method: "POST",
        body: JSON.stringify({
          languageCode,
          region: county,
          gender: "prefer_not_to_say",
          microphoneType: "browser microphone"
        })
      });
      setSpeakerProfileId(speaker.id);
      await loadProfile();
      await loadDashboard();
      if (session?.user.id && displayName.trim()) {
        window.localStorage.setItem(`sema:display-name:${session.user.id}`, displayName.trim());
      }
      setMessage("Profile, consent, and speaker profile saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save profile.");
    } finally {
      setProfileBusy(false);
    }
  }

  async function claimTasks() {
    if (!profile) {
      setMessage("Complete your profile before claiming tasks.");
      navigateView("profile");
      return;
    }
    setClaimBusy(true);
    setMessage("Finding available tasks...");
    try {
      const body: Record<string, unknown> = {
        languageCode,
        sourceLanguageCode,
        taskType: "translation",
        limit: 10
      };
      if (domain) body.domain = domain;
      const data = await api<{ tasks: Task[] }>("/api/tasks/claim", {
        method: "POST",
        body: JSON.stringify(body)
      });
      if (!data.tasks.length && domain) {
        const fallback = await api<{ tasks: Task[] }>("/api/tasks/claim", {
          method: "POST",
          body: JSON.stringify({
            languageCode,
            sourceLanguageCode,
            taskType: "translation",
            limit: 10
          })
        });
        setTasks(fallback.tasks);
        setActiveTask(fallback.tasks[0] ?? null);
        setMessage(fallback.tasks.length ? `No ${domain} tasks were open, so I loaded ${fallback.tasks.length} tasks from all topics.` : "No tasks found for this language/source yet.");
        return;
      }
      setTasks(data.tasks);
      setActiveTask(data.tasks[0] ?? null);
      setMessage(data.tasks.length ? `Claimed ${data.tasks.length} fresh tasks.` : `No tasks found for ${sourceLanguageCode.toUpperCase()} source${domain ? ` in ${domain}` : ""}. Try switching source language.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not claim tasks.");
    } finally {
      setClaimBusy(false);
    }
  }

  function resetContributionWorkspace() {
    setTasks([]);
    setActiveTask(null);
    setTranslation("");
    setRecordingBlob(null);
    setRecordingMs(0);
    setRecordingStatus("Ready to record.");
    setActiveVocabularyRecordingId(null);
  }

  async function submitFullContribution() {
    if (!activeTask) return;
    if (!translation.trim()) {
      setMessage("Write the translation before submitting.");
      return;
    }
    if (!recordingBlob) {
      setMessage("Record the audio before submitting.");
      return;
    }
    if (!consentId || !speakerProfileId) {
      setMessage("Save profile and consent before submitting audio.");
      return;
    }
    setSubmitBusy(true);
    setMessage("Submitting translation and recording...");
    try {
      await api("/api/translations", {
        method: "POST",
        body: JSON.stringify({
          corpusItemId: activeTask.id,
          languageCode,
          text: translation.trim()
        })
      });
      await uploadRecordingForTask(activeTask, recordingBlob, recordingMs);
      setTranslation("");
      setRecordingBlob(null);
      setRecordingMs(0);
      window.sessionStorage.removeItem(selectedCorpusItemKey);
      const remaining = tasks.filter((task) => task.id !== activeTask.id);
      setTasks(remaining);
      setActiveTask(remaining[0] ?? null);
      setMessage("Translation and recording submitted for review.");
      await loadDashboard();
      if (!remaining.length && autoLoadTasks) {
        await claimTasks();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit contribution.");
    } finally {
      setSubmitBusy(false);
    }
  }

  async function seedCorpus() {
    await api("/api/corpus/seed", { method: "POST", body: "{}" });
    setMessage("Launch corpus seed requested.");
  }

  async function runSearch() {
    const data = await api<{ items: Task[] }>("/api/corpus/search", {
      method: "POST",
      body: JSON.stringify({
        q: search,
        domain,
        limit: 25
      })
    });
    setSearchResults(data.items);
    setMessage(`Found ${data.items.length} corpus items.`);
  }

  async function loadVocabulary() {
    if (!token) return;
    const params = new URLSearchParams({
      source: sourceLanguageCode,
      type: vocabularyUnit,
      q: vocabularySearch,
      target: languageCode,
      limit: "60"
    });
    if (vocabularyDomain) params.set("domain", vocabularyDomain);
    const response = await fetch(`/api/vocabulary?${params}`, {
      cache: "no-store",
      headers: { authorization: `Bearer ${token}` }
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(payload.error || "Could not load vocabulary.");
      return;
    }
    setVocabularyItems(payload.items);
    setVocabularyCount(payload.count);
    setMessage(`Loaded ${payload.items.length} of ${payload.count} matching corpus units.`);
  }

  async function submitVocabularyTranslation(item: Task) {
    const text = vocabularyDrafts[item.id]?.trim();
    if (!text) {
      setMessage("Write the translation before submitting.");
      return;
    }
    if (activeVocabularyRecordingId !== item.id || !recordingBlob) {
      setMessage("Record this item before submitting.");
      return;
    }
    if (!consentId || !speakerProfileId) {
      setMessage("Save profile and consent before submitting audio.");
      return;
    }
    setVocabularySubmitting((current) => ({ ...current, [item.id]: true }));
    try {
      await api("/api/translations", {
        method: "POST",
        body: JSON.stringify({
          corpusItemId: item.id,
          languageCode,
          text
        })
      });
      await uploadRecordingForTask(item, recordingBlob, recordingMs);
      setVocabularyDrafts((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setActiveVocabularyRecordingId(null);
      setRecordingBlob(null);
      setRecordingMs(0);
      setVocabularyItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setVocabularyCount((current) => Math.max(0, current - 1));
      setMessage(`Submitted translation and recording for "${item.text}". Next item is ready.`);
      await loadDashboard();
      if (vocabularyItems.length <= 15) {
        await loadVocabulary();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit this translation.");
    } finally {
      setVocabularySubmitting((current) => ({ ...current, [item.id]: false }));
    }
  }

  function translateCorpusItem(item: Task) {
    setSourceLanguageCode(item.language_code === "sw" ? "sw" : "en");
    window.sessionStorage.setItem(selectedCorpusItemKey, JSON.stringify(item));
    resetContributionWorkspace();
    setTasks([item]);
    setActiveTask(item);
    navigateView("contribute");
  }

  useEffect(() => {
    if (activeView === "vocabulary" && token) loadVocabulary();
  }, [activeView, token, vocabularyUnit, sourceLanguageCode, vocabularyDomain, languageCode]);

  useEffect(() => {
    const syncRoute = () => {
      const nextView = routeViews[window.location.pathname];
      if (nextView) setActiveView(nextView);
    };
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  useEffect(() => {
    if (activeView !== "contribute") return;
    const stored = window.sessionStorage.getItem(selectedCorpusItemKey);
    if (!stored) return;
    try {
      const item = JSON.parse(stored) as Task;
      setSourceLanguageCode(item.language_code === "sw" ? "sw" : "en");
      setTasks([item]);
      setActiveTask(item);
      setMessage(`Ready to translate "${item.text}".`);
    } catch {
      window.sessionStorage.removeItem(selectedCorpusItemKey);
    }
  }, [activeView]);

  function getPreferredAudioType() {
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
  }

  async function getMicrophonePermissionState() {
    try {
      if (!navigator.permissions?.query) return "";
      const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
      return status.state;
    } catch {
      return "";
    }
  }

  async function requestMicrophoneStream() {
    stopMicrophoneStream();
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      if (error instanceof DOMException && ["OverconstrainedError", "ConstraintNotSatisfiedError", "NotFoundError"].includes(error.name)) {
        return navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      }
      throw error;
    }
  }

  function shouldUseNativeAudioCapture() {
    if (typeof navigator === "undefined") return false;
    return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
  }

  function openNativeAudioCapture(input?: HTMLInputElement | null) {
    if (!input) return false;
    input.value = "";
    setRecordingStatus("Opening your phone recorder. Save the recording, then return to Sema AI.");
    input.click();
    return true;
  }

  function describeRecordingError(error: unknown, permissionState: string) {
    const permissionSummary = permissionState ? ` Permission state: ${permissionState}.` : "";
    if (error instanceof DOMException) {
      if (error.name === "NotAllowedError" || error.name === "SecurityError") {
        return `Microphone permission is blocked. Click the lock icon in the address bar, allow microphone access for Sema AI, then press Record again.${permissionSummary}`;
      }
      if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        return `Chrome could not open a microphone for this site.${permissionSummary} Check the lock icon mic setting, Windows/phone microphone privacy, then press Enable mic again.`;
      }
      if (error.name === "NotReadableError" || error.name === "TrackStartError") {
        return `Your microphone is busy or blocked by another app.${permissionSummary} Close other apps using the mic and try again.`;
      }
      if (error.name === "AbortError") {
        return `The browser stopped microphone startup before recording began.${permissionSummary} Try again, or refresh once if it repeats.`;
      }
      return `${error.name}: ${error.message || "The browser refused microphone recording."}${permissionSummary}`;
    }
    return error instanceof Error ? `${error.message}${permissionSummary}` : `Could not start recording.${permissionSummary}`;
  }

  function stopMicrophoneStream() {
    wavProcessor.current?.disconnect();
    wavProcessor.current = null;
    wavSource.current?.disconnect();
    wavSource.current = null;
    audioContext.current?.close().catch(() => {});
    audioContext.current = null;
    microphoneStream.current?.getTracks().forEach((track) => track.stop());
    microphoneStream.current = null;
    setMicReady(false);
  }

  async function startWavFallbackRecording(stream: MediaStream) {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error("This browser cannot create a recording engine.");
    }

    const context = new AudioContextCtor();
    if (context.state === "suspended") {
      await context.resume();
    }
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const silentGain = context.createGain();
    silentGain.gain.value = 0;

    wavChunks.current = [];
    wavSampleRate.current = context.sampleRate;
    processor.onaudioprocess = (event) => {
      wavChunks.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };

    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(context.destination);
    wavSource.current = source;
    wavProcessor.current = processor;
    audioContext.current = context;
    microphoneStream.current = stream;
    recordingStartedAt.current = Date.now();
    setIsRecording(true);
    setMicReady(true);
    setRecordingStatus("Recording live with fallback audio engine. Speak naturally, then press Stop.");
  }

  function stopWavFallbackRecording() {
    const blob = encodeWav(mergeAudioBuffers(wavChunks.current), wavSampleRate.current);
    const duration = Date.now() - recordingStartedAt.current;
    stopMicrophoneStream();
    setRecordingBlob(blob.size ? blob : null);
    setRecordingMs(duration);
    setIsRecording(false);
    setRecordingStatus(blob.size ? "Recording captured as WAV. Preview it, then submit." : "No audio was captured. Press Record again and speak after the recording indicator appears.");
  }

  async function enableMicrophone(fallbackInput?: HTMLInputElement | null) {
    setRecordingStatus("Opening microphone permission prompt...");
    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      const next = "Microphone recording needs HTTPS. Open the secure Sema AI site and try again.";
      setRecordingStatus(next);
      return null;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      const next = "This browser does not support live microphone recording.";
      setRecordingStatus(next);
      return null;
    }
    try {
      const stream = await requestMicrophoneStream();
      const audioTracks = stream.getAudioTracks();
      if (!audioTracks.length) {
        stream.getTracks().forEach((track) => track.stop());
        setRecordingStatus("The browser opened media access, but no audio input track was returned.");
        return null;
      }
      microphoneStream.current = stream;
      setMicReady(true);
      setRecordingStatus("Microphone is enabled. Press Record to start.");
      return stream;
    } catch (error) {
      stopMicrophoneStream();
      const permissionState = await getMicrophonePermissionState();
      const next = describeRecordingError(error, permissionState);
      setRecordingStatus(next);
      return null;
    }
  }

  async function startRecording(fallbackInput?: HTMLInputElement | null) {
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      stopRecording();
      return;
    }
    setRecordingStatus("Requesting microphone access...");
    setRecordingBlob(null);
    setRecordingMs(0);
    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      const next = "Microphone recording needs HTTPS. Open the secure Sema AI site and press Record again.";
      setRecordingStatus(next);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      const next = "This browser does not support live microphone recording. Use the audio file option below.";
      setRecordingStatus(next);
      return;
    }
    try {
      const stream = microphoneStream.current?.active ? microphoneStream.current : await enableMicrophone(fallbackInput);
      if (!stream) return;
      if (typeof MediaRecorder === "undefined") {
        await startWavFallbackRecording(stream);
        return;
      }
      const preferredType = getPreferredAudioType();
      const recorder = preferredType ? new MediaRecorder(stream, { mimeType: preferredType }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = (event) => {
        stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        const errorMessage = event instanceof ErrorEvent ? event.message : "Recording failed. Please try again.";
        setRecordingStatus(errorMessage);
      };
      recorder.onstop = () => {
        stopMicrophoneStream();
        const blobType = chunks[0]?.type || preferredType || "audio/webm";
        const nextBlob = new Blob(chunks, { type: blobType });
        setRecordingBlob(nextBlob.size ? nextBlob : null);
        setRecordingMs(Date.now() - recordingStartedAt.current);
        setIsRecording(false);
        const next = nextBlob.size ? "Recording captured. Preview it, then submit." : "No audio was captured. Press Record again and speak after the recording indicator appears.";
        setRecordingStatus(next);
      };
      recordingStartedAt.current = Date.now();
      mediaRecorder.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      setRecordingStatus("Recording live. Speak naturally, then press Stop.");
    } catch (error) {
      try {
        const stream = microphoneStream.current?.active ? microphoneStream.current : await requestMicrophoneStream();
        await startWavFallbackRecording(stream);
      } catch (fallbackError) {
        setIsRecording(false);
        stopMicrophoneStream();
        const permissionState = await getMicrophonePermissionState();
        const nativeHint = shouldUseNativeAudioCapture() ? " If the browser still refuses live mic, use Device recorder on this card." : "";
        const next = `${describeRecordingError(fallbackError, permissionState)}${nativeHint}`;
        setRecordingStatus(next);
      }
    }
  }

  async function startVocabularyRecording(item: Task) {
    if (isRecording) return;
    setActiveVocabularyRecordingId(item.id);
    setActiveTask(item);
    setRecordingBlob(null);
    setRecordingMs(0);
    await startRecording(document.getElementById(`audio-file-${item.id}`) as HTMLInputElement | null);
  }

  function stopRecording() {
    if (audioContext.current) {
      setRecordingStatus("Stopping recording...");
      stopWavFallbackRecording();
      return;
    }
    if (!mediaRecorder.current || mediaRecorder.current.state === "inactive") {
      setRecordingStatus("No active recording to stop.");
      return;
    }
    setRecordingStatus("Stopping recording...");
    mediaRecorder.current.requestData();
    mediaRecorder.current.stop();
  }

  function useAudioFile(file: File | null, item?: Task) {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setRecordingStatus("Choose an audio recording, not a document or image.");
      setMessage("Choose an audio recording before submitting.");
      return;
    }
    if (item) {
      setActiveVocabularyRecordingId(item.id);
      setActiveTask(item);
    }
    setRecordingBlob(file);
    setRecordingMs(3000);
    setIsRecording(false);
    setRecordingStatus(`Audio file ready: ${file.name}`);
    setMessage("Audio file ready. You can submit after writing the translation.");
  }

  async function uploadRecordingForTask(task: Task, blob: Blob, durationMs: number) {
    const signed = await api<{ bucket: string; path: string; token: string }>("/api/storage/signed-upload", {
      method: "POST",
      body: JSON.stringify({
        corpusItemId: task.id,
        languageCode,
      contentType: normalizeAudioContentType(blob.type),
        byteSize: blob.size
      })
    });
    const { error } = await supabase.storage
      .from(signed.bucket)
      .uploadToSignedUrl(signed.path, signed.token, blob);
    if (error) throw error;
    await api("/api/recordings", {
      method: "POST",
      body: JSON.stringify({
        corpusItemId: task.id,
        languageCode,
        storagePath: signed.path,
        durationMs,
        sampleRate: 48000,
        environment: "quiet_room",
        speakerProfileId,
        consentRecordId: consentId,
        qa: { autoPass: durationMs > 750, silenceRatio: 0, clippingRatio: 0 }
      })
    });
  }

  async function submitRecording() {
    if (!activeTask || !recordingBlob) return;
    if (!consentId || !speakerProfileId) {
      setMessage("Save profile and consent before recording.");
      return;
    }
    await uploadRecordingForTask(activeTask, recordingBlob, recordingMs);
    setRecordingBlob(null);
    setMessage("Recording uploaded and submitted.");
    await loadDashboard();
  }

  if (!authReady) {
    return (
      <main className="appBoot">
        <img src="/sema-ai-brand.png" alt="Sema AI" />
        <strong>Opening Sema workspace...</strong>
        <span>Checking your secure session.</span>
      </main>
    );
  }

  if (!session || passwordRecovery) {
    const isSignup = authMode === "sign-up";
    const isForgot = authMode === "forgot";
    const isCheckEmail = authMode === "check-email";
    return (
      <main className="authShell">
        <section className="authIdentity" aria-label="About Sema Studio">
          <div className="authBrand">
            <img src="/sema-ai-brand.png" alt="Sema AI - Every Language. Every Voice. One Kenya." />
          </div>
          <div className="authPromise">
            <p className="eyebrow">Every language. Every voice. One Kenya.</p>
            <h1>Language technology that sounds like home.</h1>
            <p>Help Kenyan languages thrive in the technology people use every day.</p>
          </div>
        </section>

        <section className="authPanel">
          <div className="authMobileBrand">
            <img src="/sema-ai-brand.png" alt="Sema AI" />
          </div>

          {passwordRecovery ? (
            <form
              className="authForm"
              onSubmit={(event) => {
                event.preventDefault();
                updateRecoveredPassword();
              }}
            >
              <p className="eyebrow">Secure account recovery</p>
              <h2>Choose a new password</h2>
              <p className="authIntro">Create a password you have not used for this account before.</p>
              <label>
                New password
                <input
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  required
                />
              </label>
              <p className="passwordRule">At least 10 characters, one uppercase letter, and one number.</p>
              <label>
                Confirm new password
                <input
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  type="password"
                  required
                />
              </label>
              {message && <p className="authMessage" role="status">{message}</p>}
              <button className="primaryButton authSubmit" type="submit" disabled={authBusy}>
                {authBusy ? "Updating..." : "Update password"}
              </button>
            </form>
          ) : isCheckEmail ? (
            <div className="authConfirmation">
              <span className="confirmationIcon" aria-hidden="true">✓</span>
              <p className="eyebrow">Check your inbox</p>
              <h2>Verify your email</h2>
              <p>{message}</p>
              <p className="authHint">Open the link sent to <strong>{email}</strong>. You can close this page after verification.</p>
              <button className="primaryButton authSubmit" type="button" onClick={() => setAuthMode("sign-in")}>
                Return to sign in
              </button>
              <button className="ghostButton authSubmit" type="button" onClick={resendVerification} disabled={authBusy}>
                {authBusy ? "Sending..." : "Resend verification email"}
              </button>
            </div>
          ) : (
            <form
              className="authForm"
              onSubmit={(event) => {
                event.preventDefault();
                isForgot ? sendPasswordReset() : authenticate();
              }}
            >
              <p className="eyebrow">{isSignup ? "Contributor registration" : isForgot ? "Account recovery" : "Contributor access"}</p>
              <h2>{isSignup ? "Create your account" : isForgot ? "Reset your password" : "Welcome back"}</h2>
              <p className="authIntro">
                {isSignup
                  ? "Join the people building more useful and representative language technology."
                  : isForgot
                    ? "We will send a secure reset link to your registered email."
                    : "Sign in to continue your contribution work."}
              </p>

              {isSignup && (
                <label>
                  Full name
                  <input
                    autoComplete="name"
                    value={signupName}
                    onChange={(event) => setSignupName(event.target.value)}
                    placeholder="Your full name"
                    required
                  />
                </label>
              )}
              <label>
                Email address
                <input
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  required
                />
              </label>
              {!isForgot && (
                <label>
                  <span className="labelRow">
                    Password
                    {!isSignup && (
                      <button className="textButton" type="button" onClick={() => { setAuthMode("forgot"); setMessage(""); }}>
                        Forgot password?
                      </button>
                    )}
                  </span>
                  <span className="passwordField">
                    <input
                      autoComplete={isSignup ? "new-password" : "current-password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      type={showPassword ? "text" : "password"}
                      required
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}>
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </span>
                </label>
              )}
              {isSignup && (
                <>
                  <p className="passwordRule">At least 10 characters, one uppercase letter, and one number.</p>
                  <label>
                    Confirm password
                    <input
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      type={showPassword ? "text" : "password"}
                      required
                    />
                  </label>
                  <label className="checkLabel">
                    <input type="checkbox" checked={legalAccepted} onChange={(event) => setLegalAccepted(event.target.checked)} />
                    <span>I agree to the Contributor Terms and acknowledge the Privacy Notice.</span>
                  </label>
                </>
              )}

              {message && <p className="authMessage" role="status">{message}</p>}
              <button className="primaryButton authSubmit" type="submit" disabled={authBusy}>
                {authBusy ? "Please wait..." : isSignup ? "Create contributor account" : isForgot ? "Send reset link" : "Sign in"}
              </button>

              <div className="authSwitch">
                <span>{isSignup ? "Already a contributor?" : isForgot ? "Remembered your password?" : "New to Sema?"}</span>
                <button
                  className="textButton"
                  type="button"
                  onClick={() => {
                    setAuthMode(isSignup || isForgot ? "sign-in" : "sign-up");
                    setMessage("");
                  }}
                >
                  {isSignup || isForgot ? "Sign in" : "Create an account"}
                </button>
              </div>
            </form>
          )}
        </section>
      </main>
    );
  }

  const stats = dashboard?.stats ?? {
    total: 0,
    today: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
    activeClaims: tasks.length,
    audioSeconds: 0,
    points: 0
  };
  const canReview = dashboard?.roles.some((role) =>
    ["reviewer", "expert", "language_lead", "ops_admin"].includes(role.role)
  ) ?? false;
  const hasMultilingualAccess = canReview;
  const isLanguageLocked = Boolean(profile?.home_language_code) && !hasMultilingualAccess;
  const dailyGoal = 10;
  const dailyProgress = Math.min(stats.today, dailyGoal);
  const approvalRate = stats.approved + stats.rejected
    ? Math.round((stats.approved / (stats.approved + stats.rejected)) * 100)
    : 100;
  const accountName =
    profile?.display_name?.trim() ||
    displayName.trim() ||
    (typeof session.user.user_metadata?.display_name === "string" ? session.user.user_metadata.display_name.trim() : "") ||
    (typeof session.user.user_metadata?.full_name === "string" ? session.user.user_metadata.full_name.trim() : "") ||
    "Contributor";
  const accountInitial = accountName.slice(0, 1).toUpperCase();
  const firstName = accountName.split(/\s+/)[0] || "contributor";
  const reputationLevel = dashboard?.reputation?.level ?? (stats.approved >= 500 ? "Language expert" : stats.approved >= 100 ? "Trusted contributor" : stats.total >= 25 ? "Verified contributor" : "New contributor");
  const reputationScore = dashboard?.reputation?.reputation_score ?? Math.min(100, Math.round((approvalRate * 0.55) + (Math.min(stats.total, 200) / 200) * 25 + (Math.min(stats.audioSeconds, 7200) / 7200) * 20));
  const metricByLanguage = new Map(languageMetrics.map((metric) => [metric.language_code, metric]));
  const languageReadiness = languages.map((language) => {
    const metric = metricByLanguage.get(language.code);
    const score = metric?.readiness_score ?? 0;
    return {
      ...language,
      score,
      textCoverage: metric?.text_coverage ?? 0,
      audioCoverage: metric?.audio_coverage ?? 0,
      reviewCoverage: metric?.review_coverage ?? 0,
      sourceItems: metric?.source_items ?? 0,
      translationsApproved: metric?.translations_approved ?? 0,
      recordingsApproved: metric?.recordings_approved ?? 0,
      contributors: metric?.contributor_count ?? 0
    };
  });
  const missionRows = missions.length
    ? missions
    : missionTemplates.map((mission) => ({
      id: mission.id,
      slug: mission.id,
      title: mission.title,
      description: mission.description,
      domain: mission.domain,
      language_codes: mission.languages,
      target_items: mission.target,
      status: "active",
      priority: 50,
      governance_notes: null,
      approvedItems: 0,
      progress: 0
    }));
  const activeMissions = missionRows.map((mission) => ({
    ...mission,
    languageMatch: mission.language_codes.includes(languageCode),
    contributionProgress: mission.approvedItems,
    target: mission.target_items,
    languages: mission.language_codes
  }));
  const navItems: Array<{ id: AppView; label: string; icon: string }> = [
    { id: "home", label: "Home", icon: "H" },
    { id: "contribute", label: "Contribute", icon: "C" },
    { id: "vocabulary", label: "Vocabulary", icon: "W" },
    { id: "missions", label: "Missions", icon: "N" },
    { id: "intelligence", label: "Map", icon: "I" },
    { id: "history", label: "My work", icon: "M" },
    { id: "languages", label: "Languages", icon: "L" },
    { id: "governance", label: "Governance", icon: "G" },
    { id: "profile", label: "Profile", icon: "P" },
    { id: "settings", label: "Settings", icon: "S" }
  ];

  return (
    <main className={`portalShell ${largeControls ? "largeControls" : ""}`}>
      <aside className="portalSidebar" aria-label="Sema navigation">
        <div className="brand">
          <img src="/sema-ai-brand.png" alt="Sema AI contributor platform" />
        </div>
        <nav className="portalNav">
          {navItems.map((item) => (
            <button
              className={activeView === item.id ? "active" : ""}
              type="button"
              key={item.id}
              onClick={() => navigateView(item.id)}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebarProgress">
          <div className="progressLabel">
            <span>Daily goal</span>
            <strong>{dailyProgress}/{dailyGoal}</strong>
          </div>
          <div className="progressTrack"><span style={{ width: `${(dailyProgress / dailyGoal) * 100}%` }} /></div>
          <small>{dailyGoal - dailyProgress > 0 ? `${dailyGoal - dailyProgress} contributions to go` : "Goal complete"}</small>
        </div>
        <button className="accountButton" type="button" onClick={() => navigateView("profile")}>
          <span>{accountInitial}</span>
          <span><strong>{accountName}</strong><small>{activeLanguage?.name}</small></span>
        </button>
      </aside>

      <section className="portalMain">
        <header className="portalTopbar">
          <div>
            <strong>{navItems.find((item) => item.id === activeView)?.label}</strong>
            <span>{message}</span>
          </div>
          <div className="topbarActions">
            <button className="languageSelector" type="button" onClick={() => navigateView("languages")}>
              {activeLanguage?.name ?? languageCode}
            </button>
            <button className="avatarButton" type="button" onClick={() => navigateView("profile")} aria-label="Open profile">
              {accountInitial}
            </button>
          </div>
        </header>

        <div className="portalContent">
          {activeView === "home" && (
            <>
              <section className="welcomeBand">
                <div>
                  <p className="eyebrow">Your contribution space</p>
                  <h1>Good to see you, {firstName}.</h1>
                  <p>Every accepted contribution helps technology understand {activeLanguage?.name ?? "your language"} more naturally.</p>
                </div>
                <button className="primaryButton" type="button" onClick={() => navigateView("contribute")}>
                  Start contributing
                </button>
              </section>

              {!profile && (
                <section className="setupNotice">
                  <div><strong>Finish setting up your contributor profile</strong><span>Add your language, region, consent, and speaker information before recording.</span></div>
                  <button type="button" onClick={() => navigateView("profile")}>Complete profile</button>
                </section>
              )}

              <section className="statStrip">
                <article><span>Total contributions</span><strong>{stats.total}</strong><small>Across text and voice</small></article>
                <article><span>Approved</span><strong>{stats.approved}</strong><small>{approvalRate}% quality rate</small></article>
                <article><span>Awaiting review</span><strong>{stats.pending}</strong><small>Community validation</small></article>
                <article><span>Voice contributed</span><strong>{Math.floor(stats.audioSeconds / 60)}m</strong><small>{stats.audioSeconds % 60}s recorded</small></article>
              </section>

              <section className="tutorialPanel">
                <div className="sectionTitle">
                  <div>
                    <p className="eyebrow">Start here</p>
                    <h2>How to move around Sema AI</h2>
                  </div>
                  <button className="textButton" type="button" onClick={() => navigateView("settings")}>Settings</button>
                </div>
                <div className="tutorialSteps">
                  {tutorialSteps.map((step, index) => (
                    <article key={step.title}>
                      <span>{index + 1}</span>
                      <div>
                        <h3>{step.title}</h3>
                        <p>{step.body}</p>
                        <button type="button" onClick={() => navigateView(step.view)}>{step.action}</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="homeGrid">
                <article className="homeSection">
                  <div className="sectionTitle"><div><p className="eyebrow">Choose a task</p><h2>How would you like to help?</h2></div></div>
                  <div className="taskModeGrid">
                    <button type="button" onClick={() => { resetContributionWorkspace(); navigateView("contribute"); }}>
                      <span className="modeIcon teal">T</span><strong>Translate and record</strong><small>Submit written meaning plus your voice for the same item</small><b>Start contributing</b>
                    </button>
                    <button type="button" onClick={() => navigateView("vocabulary")}>
                      <span className="modeIcon coral">W</span><strong>Browse vocabulary</strong><small>Pick words, translate them, and record audio inline</small><b>Open word bank</b>
                    </button>
                    <button type="button" onClick={() => navigateView("missions")}>
                      <span className="modeIcon gold">N</span><strong>Join a mission</strong><small>Work on focused language packs for health, agriculture, public services, and culture</small><b>Open missions</b>
                    </button>
                    <button type="button" onClick={() => navigateView("intelligence")}>
                      <span className="modeIcon green">I</span><strong>Language intelligence map</strong><small>See coverage, readiness, and gaps across Kenyan languages</small><b>View map</b>
                    </button>
                    <button type="button" onClick={() => navigateView("history")}>
                      <span className="modeIcon blue">M</span><strong>My contribution record</strong><small>Track submitted translations, recordings, review status, and points</small><b>View my work</b>
                    </button>
                  </div>
                </article>

                <aside className="goalPanel">
                  <p className="eyebrow">Today</p>
                  <div className="goalRing" style={{ "--goal": `${(dailyProgress / dailyGoal) * 360}deg` } as React.CSSProperties}>
                    <span><strong>{dailyProgress}</strong><small>of {dailyGoal}</small></span>
                  </div>
                  <h3>{dailyProgress >= dailyGoal ? "Daily goal complete" : "Keep your momentum"}</h3>
                  <p>{dailyProgress >= dailyGoal ? "You made meaningful progress for your language today." : "Small, consistent sessions create stronger datasets."}</p>
                </aside>
              </section>

              <section className="homeSection">
                <div className="sectionTitle">
                  <div><p className="eyebrow">Recent activity</p><h2>Your latest contributions</h2></div>
                  <button className="textButton" type="button" onClick={() => navigateView("history")}>View all</button>
                </div>
                <div className="activityList">
                  {dashboard?.recent.slice(0, 4).map((item) => (
                    <article key={item.id}>
                      <span className="activityType">{item.type.slice(0, 1)}</span>
                      <div><strong>{item.title}</strong><small>{item.type} · {item.languageCode} · {new Date(item.createdAt).toLocaleDateString()}</small></div>
                      <span className={`reviewState ${item.status}`}>{item.status.replace("_", " ")}</span>
                    </article>
                  ))}
                  {!dashboard?.recent.length && <div className="emptyState"><strong>Your contribution history starts here.</strong><span>Complete a translation or recording to see its review journey.</span></div>}
                </div>
              </section>
            </>
          )}

          {activeView === "missions" && (
            <section className="standardPage">
              <div className="pageHeading">
                <div><p className="eyebrow">Focused missions</p><h1>Build language packs that matter.</h1><p>Missions keep Sema focused on high-value domains without payments for now: impact, quality, and readiness first.</p></div>
                <span className="queueCount">{activeMissions.filter((mission) => mission.languageMatch).length} for {activeLanguage?.name}</span>
              </div>
              <div className="missionGrid">
                {activeMissions.map((mission) => (
                  <article key={mission.id} className={mission.languageMatch ? "featured" : ""}>
                    <div><span>{mission.domain}</span><b>{mission.languageMatch ? "Open for your language" : "Community mission"}</b></div>
                    <h2>{mission.title}</h2>
                    <p>{mission.description}</p>
                    <div className="coverageTrack"><span style={{ width: `${Math.max(4, mission.progress)}%` }} /></div>
                    <small>{mission.contributionProgress.toLocaleString()} of {mission.target.toLocaleString()} target items prepared</small>
                    <div className="missionLanguages">{mission.languages.map((code) => <span key={code}>{languages.find((language) => language.code === code)?.name ?? code}</span>)}</div>
                    <button className="primaryButton" type="button" onClick={() => { setDomain(mission.domain); resetContributionWorkspace(); navigateView("contribute"); }}>Work on this mission</button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeView === "intelligence" && (
            <section className="standardPage">
              <div className="pageHeading">
                <div><p className="eyebrow">Language intelligence map</p><h1>Know what Kenya’s AI can understand.</h1><p>Track readiness by language, family, text coverage, audio coverage, and review depth.</p></div>
                <span className="queueCount">{languages.length} languages</span>
              </div>
              <section className="intelligenceSummary">
                <article><span>Active languages</span><strong>{languages.length}</strong><small>Kenyan languages and varieties</small></article>
                <article><span>Priority languages</span><strong>{languages.filter((language) => language.priority === "priority").length}</strong><small>High-demand pilot targets</small></article>
                <article><span>Endangered languages</span><strong>{languages.filter((language) => language.priority === "endangered").length}</strong><small>Need careful community governance</small></article>
                <article><span>Your reputation</span><strong>{reputationScore}%</strong><small>{reputationLevel}</small></article>
              </section>
              <div className="languageIntelligenceGrid">
                {languageReadiness.map((language) => (
                  <article key={language.code} className={language.code === languageCode ? "selected" : ""}>
                    <div><strong>{language.name}</strong><span>{language.family}</span></div>
                    <b className={`reviewState ${language.priority}`}>{language.priority}</b>
                    <div className="coverageTrack"><span style={{ width: `${language.score}%` }} /></div>
                    <dl>
                      <div><dt>Text</dt><dd>{language.textCoverage}%</dd></div>
                      <div><dt>Audio</dt><dd>{language.audioCoverage}%</dd></div>
                      <div><dt>Review</dt><dd>{language.reviewCoverage}%</dd></div>
                    </dl>
                    <button className="ghostButton" type="button" onClick={() => { setLanguageCode(language.code); navigateView("contribute"); }}>Contribute</button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeView === "governance" && (
            <section className="standardPage">
              <div className="pageHeading">
                <div><p className="eyebrow">Community governance</p><h1>Trust is the product.</h1><p>Sema should beat generic platforms by proving consent, provenance, reviewer accountability, and language-community control.</p></div>
              </div>
              <div className="governanceGrid">
                <article><span>Consent</span><h2>Contributor and speaker consent</h2><p>Every usable audio submission requires consent before it enters review, export, or training.</p><b>{consentId ? "Saved for you" : "Needs setup"}</b></article>
                <article><span>Provenance</span><h2>Dataset traceability ledger</h2><p>Each item tracks source text, language, domain, contributor, review state, and export readiness.</p><b>{stats.total.toLocaleString()} personal records</b></article>
                <article><span>Review</span><h2>Human quality layers</h2><p>Submissions move through community review, expert review, consensus, and language lead decisions.</p><b>{stats.pending.toLocaleString()} awaiting review</b></article>
                <article><span>Anti-abuse</span><h2>Reputation and audit trails</h2><p>Quality score, revision history, duplicate prevention, and reviewer separation protect the dataset.</p><b>{reputationLevel}</b></article>
                <article><span>Community rights</span><h2>Language community control</h2><p>Low-resource and endangered communities need governance choices before broad commercial use.</p><b>No open release by default</b></article>
                <article><span>Client trust</span><h2>Export-ready evidence</h2><p>Clients should receive only approved data with provenance, review history, consent metadata, and model release links.</p><b>Admin controlled</b></article>
              </div>
            </section>
          )}

          {activeView === "contribute" && (
            <section className="contributionLayout">
              <div className="contributionMain">
                <div className="pageHeading">
                  <div><p className="eyebrow">Contribution workspace</p><h1>Make {activeLanguage?.name} understood.</h1><p>Translate the item, record yourself saying it, then submit both for review.</p></div>
                  <span className="queueCount">{tasks.length} in your queue</span>
                </div>
                <div className="queueControls">
                  <label>Translate from<select value={sourceLanguageCode} onChange={(event) => setSourceLanguageCode(event.target.value as "en" | "sw")}><option value="en">English</option><option value="sw">Kiswahili</option></select></label>
                  <label>Topic<select value={domain} onChange={(event) => setDomain(event.target.value)}><option value="">All topics</option>{domains.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
                  <button className="primaryButton" type="button" onClick={claimTasks} disabled={claimBusy}>{claimBusy ? "Finding tasks..." : tasks.length ? "Add more tasks" : "Get a task batch"}</button>
                </div>
                {activeTask ? (
                  <article className="focusedTask">
                    <div className="taskMeta"><span>{activeTask.domain}</span><span>{activeTask.difficulty}</span><strong>{tasks.findIndex((item) => item.id === activeTask.id) + 1} of {tasks.length}</strong></div>
                    <p className="sourceLabel">Source text</p>
                    <h2>{activeTask.text}</h2>
                    <label>Your {activeLanguage?.name} translation<textarea value={translation} onChange={(event) => setTranslation(event.target.value)} placeholder="Write this as you would naturally say it..." /></label>
                    <div className="recordingStudio">
                      <div className={`recordingVisual ${isRecording ? "live" : ""}`}><span /><span /><span /><span /><span /><span /><span /></div>
                      <p>{recordingStatus}</p>
                      {recordingBlob && <audio controls src={URL.createObjectURL(recordingBlob)} />}
                      <div className="actions">
                        <button className="ghostButton" type="button" onClick={() => enableMicrophone(contributionAudioInput.current)} disabled={submitBusy || micReady}>{micReady ? "Mic enabled" : "Enable mic"}</button>
                        <button className="recordButton" type="button" onClick={isRecording ? stopRecording : () => startRecording(contributionAudioInput.current)} disabled={submitBusy}>{isRecording ? "Stop recording" : recordingBlob ? "Record again" : "Start recording"}</button>
                        <label className="fileRecordButton">
                          Upload audio
                          <input ref={contributionAudioInput} type="file" accept="audio/*" capture onChange={(event) => useAudioFile(event.target.files?.[0] ?? null)} />
                        </label>
                        <button className="primaryButton" type="button" onClick={submitFullContribution} disabled={submitBusy || !translation.trim() || !recordingBlob}>{submitBusy ? "Submitting..." : "Submit translation + recording"}</button>
                      </div>
                    </div>
                  </article>
                ) : (
                  <div className="largeEmptyState"><span>C</span><h2>Your queue is ready when you are.</h2><p>Claim a batch of ten focused tasks for {activeLanguage?.name}.</p><button className="primaryButton" type="button" onClick={claimTasks} disabled={claimBusy}>{claimBusy ? "Finding tasks..." : "Get a task batch"}</button></div>
                )}
              </div>
              <aside className="guidancePanel">
                <p className="eyebrow">Quality guide</p>
                <h3>Meaning first, then voice.</h3>
                <ul><li>Use everyday language people actually speak.</li><li>Record the translation, not the source text.</li><li>Listen once before submitting.</li></ul>
                <button className="ghostButton" type="button" onClick={() => { setSearch(activeTask?.text ?? ""); runSearch(); }}>Check similar corpus text</button>
              </aside>
            </section>
          )}

          {activeView === "vocabulary" && (
            <section className="standardPage">
              <div className="pageHeading">
                <div>
                  <p className="eyebrow">Corpus library</p>
                  <h1>Words and language units</h1>
                  <p>Browse the real source corpus, choose an item, and translate it into {activeLanguage?.name}.</p>
                </div>
                <span className="queueCount">{vocabularyCount.toLocaleString()} matching units</span>
              </div>
              <div className="vocabularyToolbar">
                <div className="modeTabs vocabularyTabs" role="tablist">
                  {(["word", "phrase", "sentence", "term", "idiom", "proverb", "all"] as const).map((unit) => (
                    <button className={vocabularyUnit === unit ? "active" : ""} type="button" key={unit} onClick={() => setVocabularyUnit(unit)}>
                      {unit === "all" ? "All units" : `${unit}s`}
                    </button>
                  ))}
                </div>
                <div className="vocabularyFilters">
                  <input value={vocabularySearch} onChange={(event) => setVocabularySearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && loadVocabulary()} placeholder="Search corpus words and expressions..." />
                  <select value={sourceLanguageCode} onChange={(event) => setSourceLanguageCode(event.target.value as "en" | "sw")}><option value="en">English source</option><option value="sw">Kiswahili source</option></select>
                  <select value={vocabularyDomain} onChange={(event) => setVocabularyDomain(event.target.value)}><option value="">All topics</option>{domains.map((item) => <option value={item} key={item}>{item}</option>)}</select>
                  <button className="primaryButton" type="button" onClick={loadVocabulary}>Search</button>
                </div>
              </div>
              <div className="vocabularyGrid">
                {vocabularyItems.map((item) => (
                  <article key={item.id}>
                    <div>
                      <span>{item.metadata?.unit_type ?? "unit"}</span>
                      <small>{item.domain}</small>
                    </div>
                    <strong>{item.text}</strong>
                    <textarea
                      value={vocabularyDrafts[item.id] ?? ""}
                      onChange={(event) => setVocabularyDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                      placeholder={`Translate into ${activeLanguage?.name ?? "your language"}...`}
                    />
                    <div className={`inlineRecorder ${activeVocabularyRecordingId === item.id ? "active" : ""}`}>
                      <div className={`recordingVisual ${isRecording && activeVocabularyRecordingId === item.id ? "live" : ""}`}><span /><span /><span /><span /><span /><span /><span /></div>
                      <p>
                        {isRecording && activeVocabularyRecordingId === item.id
                          ? "Recording..."
                          : activeVocabularyRecordingId === item.id && recordingBlob
                            ? recordingStatus
                            : "Record your translation"}
                      </p>
                      {activeVocabularyRecordingId === item.id && recordingBlob && <audio controls src={URL.createObjectURL(recordingBlob)} />}
                      <div className="inlineRecorderActions">
                        <button
                          className="ghostButton"
                          type="button"
                          disabled={Boolean(vocabularySubmitting[item.id]) || micReady}
                          onClick={() => {
                            setActiveVocabularyRecordingId(item.id);
                            setActiveTask(item);
                            enableMicrophone(document.getElementById(`audio-file-${item.id}`) as HTMLInputElement | null);
                          }}
                        >
                          {micReady && activeVocabularyRecordingId === item.id ? "Mic enabled" : "Enable mic"}
                        </button>
                        <button
                          className="recordButton"
                          type="button"
                          disabled={Boolean(vocabularySubmitting[item.id])}
                          onClick={() => activeVocabularyRecordingId === item.id && isRecording ? stopRecording() : startVocabularyRecording(item)}
                        >
                          {activeVocabularyRecordingId === item.id && isRecording ? "Stop recording" : activeVocabularyRecordingId === item.id && recordingBlob ? "Record again" : "Record"}
                        </button>
                        <label className="fileRecordButton">
                          Upload audio
                          <input id={`audio-file-${item.id}`} type="file" accept="audio/*" capture onChange={(event) => useAudioFile(event.target.files?.[0] ?? null, item)} />
                        </label>
                      </div>
                    </div>
                    <div className="vocabularyActions">
                      <button
                        className="primaryButton"
                        type="button"
                        onClick={() => submitVocabularyTranslation(item)}
                        disabled={vocabularySubmitting[item.id] || !vocabularyDrafts[item.id]?.trim() || activeVocabularyRecordingId !== item.id || !recordingBlob}
                      >
                        {vocabularySubmitting[item.id] ? "Submitting..." : "Submit translation + recording"}
                      </button>
                      <button className="ghostButton" type="button" onClick={() => translateCorpusItem(item)}>Open full workspace</button>
                    </div>
                  </article>
                ))}
                {!vocabularyItems.length && <div className="largeEmptyState"><span>W</span><h2>No matching corpus units yet.</h2><p>Change the source, unit type, topic, or search text.</p></div>}
              </div>
            </section>
          )}

          {activeView === "history" && (
            <section className="standardPage">
              <div className="pageHeading"><div><p className="eyebrow">My work</p><h1>Contribution history</h1><p>Follow every submission from contribution through community review.</p></div><span className="queueCount">{stats.total} total</span></div>
              <div className="historyTable">
                <div className="historyHead"><span>Contribution</span><span>Language</span><span>Date</span><span>Status</span><span>Ledger</span></div>
                {dashboard?.recent.map((item) => (
                  <article key={item.id}>
                    <div><span className="activityType">{item.type.slice(0, 1)}</span><span><strong>{item.title}</strong><small>{item.type}{item.source ? ` - ${item.source}` : ""}</small></span></div>
                    <span>{item.languageCode}</span>
                    <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                    <span className={`reviewState ${item.status}`}>{item.status.replace("_", " ")}</span>
                    <button className="ghostButton compact" type="button" onClick={() => loadProvenance(item)} disabled={provenanceBusy === item.id}>{provenanceBusy === item.id ? "Loading" : "Provenance"}</button>
                  </article>
                ))}
                {!dashboard?.recent.length && <div className="emptyState"><strong>No submissions yet.</strong><span>Your completed work and review outcomes will appear here.</span></div>}
              </div>
              {provenance && (
                <section className="provenancePanel">
                  <div className="sectionTitle">
                    <div><p className="eyebrow">Provenance ledger</p><h2>{provenance.source?.text ?? provenance.contribution.text ?? provenance.target.type}</h2></div>
                    <b className={`reviewState ${provenance.exportReady ? "approved" : "submitted"}`}>{provenance.exportReady ? "export ready" : "not export ready"}</b>
                  </div>
                  <div className="governanceGrid">
                    <article><span>Source</span><h2>{provenance.source?.domain ?? "Unknown domain"}</h2><p>{provenance.source?.text ?? "No source record found."}</p><b>{provenance.source?.source_language_code ?? "source missing"}</b></article>
                    <article><span>Contribution</span><h2>{provenance.target.status.replace("_", " ")}</h2><p>{provenance.contribution.text ?? `${Math.round((provenance.contribution.durationMs ?? 0) / 1000)} second recording`}</p><b>{provenance.target.languageCode ?? "language missing"}</b></article>
                    <article><span>Rights</span><h2>{provenance.rights.consent ? "Consent attached" : "Consent missing"}</h2><p>Source license: {String(provenance.rights.sourceLicense ?? "not recorded")}</p><b>{provenance.rights.speaker ? "speaker metadata attached" : "speaker metadata missing"}</b></article>
                    <article><span>Review</span><h2>{provenance.reviewTrail.length} decisions</h2><p>{provenance.reviewTrail.map((review) => `${review.reviewerName}: ${review.decision}`).join("; ") || "No review decisions yet."}</p><b>{provenance.consensusTrail.length} consensus records</b></article>
                  </div>
                </section>
              )}
            </section>
          )}

          {activeView === "languages" && (
            <section className="standardPage">
              <div className="pageHeading"><div><p className="eyebrow">Language communities</p><h1>Choose where you contribute</h1><p>Sema supports 68 Kenyan languages and language varieties.</p></div></div>
              <div className="languageSearch"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a language..." /></div>
              <div className="languageCards">
                {languages.filter((language) => language.name.toLowerCase().includes(search.toLowerCase())).map((language) => (
                  <button
                    className={language.code === languageCode ? "selected" : ""}
                    type="button"
                    key={language.code}
                    disabled={isLanguageLocked && language.code !== languageCode}
                    onClick={() => {
                      if (isLanguageLocked && language.code !== languageCode) {
                        setMessage("Your primary language is locked. Ask an administrator for multilingual access.");
                        return;
                      }
                      setLanguageCode(language.code);
                    }}
                  >
                    <span>{language.name.slice(0, 2).toUpperCase()}</span><div><strong>{language.name}</strong><small>{language.family} · {language.priority}</small></div>{language.code === languageCode ? <b>Current</b> : isLanguageLocked ? <b>Locked</b> : null}
                  </button>
                ))}
              </div>
            </section>
          )}

          {activeView === "profile" && (
            <section className="standardPage profilePage">
              <div className="pageHeading"><div><p className="eyebrow">Contributor profile</p><h1>Your language identity</h1><p>Keep your language and speaker information accurate so contributions carry useful context.</p></div></div>
              <div className="profileGrid">
                <article className="settingsPanel">
                  <h2>Profile details</h2>
                  <div className="settingsForm">
                    <label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
                    <label>County or region<input value={county} onChange={(event) => setCounty(event.target.value)} /></label>
                    <label>Primary language<select value={languageCode} disabled={isLanguageLocked} onChange={(event) => setLanguageCode(event.target.value)}>{languages.map((language) => <option value={language.code} key={language.code}>{language.name} · {language.family}</option>)}</select></label>
                    {isLanguageLocked && <p className="formHint">Your primary contribution language is locked to protect dataset quality. Multilingual access is granted by reviewers or admins.</p>}
                    <label>Email address<input value={session.user.email ?? ""} disabled /></label>
                    <div className="formSectionHeader">
                      <h3>Contributor payout details</h3>
                      <p>Optional details for future funded missions, stipends, or reimbursements. This does not guarantee payment.</p>
                    </div>
                    <label>Preferred payout method
                      <select value={payoutMethod} onChange={(event) => setPayoutMethod(event.target.value as typeof payoutMethod)}>
                        <option value="none">Not set</option>
                        <option value="mpesa">M-Pesa</option>
                        <option value="airtel_money">Airtel Money</option>
                        <option value="bank_transfer">Bank transfer</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label>Mobile money or payout phone<input value={payoutPhone} onChange={(event) => setPayoutPhone(event.target.value)} placeholder="+254..." /></label>
                    <label>Registered payout name<input value={payoutName} onChange={(event) => setPayoutName(event.target.value)} placeholder="Name on wallet or account" /></label>
                    <label className="fullField">Payout notes<textarea value={payoutNotes} onChange={(event) => setPayoutNotes(event.target.value)} placeholder="Optional notes for finance verification, e.g. preferred contact time." /></label>
                    <label className="toggleRow">
                      <span><strong>Allow payout contact use</strong><small>Sema may use these details only for approved contributor payouts if funded missions are launched.</small></span>
                      <input type="checkbox" checked={payoutOptIn} onChange={(event) => setPayoutOptIn(event.target.checked)} />
                    </label>
                    <button className="primaryButton" type="button" onClick={saveProfile}>Save profile and consent</button>
                  </div>
                </article>
                <aside className="profileSummary">
                  <span className="largeAvatar">{accountInitial}</span>
                  <h2>{accountName}</h2>
                  <p>{activeLanguage?.name} contributor · {county || "Region not set"}</p>
                  <dl><div><dt>Quality score</dt><dd>{profile?.reviewer_score || approvalRate}%</dd></div><div><dt>Contributions</dt><dd>{stats.total}</dd></div><div><dt>Points</dt><dd>{stats.points}</dd></div></dl>
                  <button className="ghostButton" type="button" onClick={() => navigateView("settings")}>Open settings</button>
                </aside>
              </div>
            </section>
          )}

          {activeView === "settings" && (
            <section className="standardPage profilePage">
              <div className="pageHeading">
                <div><p className="eyebrow">Account settings</p><h1>Control your Sema workspace.</h1><p>Manage identity, contribution preferences, accessibility, and security actions.</p></div>
              </div>
              <div className="profileGrid">
                <article className="settingsPanel">
                  <h2>Contribution preferences</h2>
                  <div className="settingsForm">
                    <label className="toggleRow"><span><strong>Email progress digest</strong><small>Receive occasional updates about accepted work and review feedback.</small></span><input type="checkbox" checked={emailDigest} onChange={(event) => setEmailDigest(event.target.checked)} /></label>
                    <label className="toggleRow"><span><strong>Auto-load fresh tasks</strong><small>Open a new batch after your queue is completed.</small></span><input type="checkbox" checked={autoLoadTasks} onChange={(event) => setAutoLoadTasks(event.target.checked)} /></label>
                    <label className="toggleRow"><span><strong>Large mobile controls</strong><small>Keep recording and submit controls thumb-friendly on phones.</small></span><input type="checkbox" checked={largeControls} onChange={(event) => setLargeControls(event.target.checked)} /></label>
                    <button className="primaryButton" type="button" onClick={() => { window.localStorage.setItem(`sema:settings:${session.user.id}`, JSON.stringify({ emailDigest, autoLoadTasks, largeControls })); setMessage("Settings saved on this device."); }}>Save settings</button>
                  </div>
                </article>
                <aside className="profileSummary">
                  <span className="largeAvatar">{accountInitial}</span>
                  <h2>{accountName}</h2>
                  <p>{session.user.email ?? "Email not available"}</p>
                  <dl><div><dt>Primary language</dt><dd>{activeLanguage?.name ?? languageCode}</dd></div><div><dt>Consent</dt><dd>{consentId ? "Saved" : "Needed"}</dd></div><div><dt>Speaker profile</dt><dd>{speakerProfileId ? "Saved" : "Needed"}</dd></div></dl>
                  <button className="ghostButton" type="button" onClick={() => navigateView("profile")}>Edit profile</button>
                  <button className="dangerButton" type="button" onClick={() => supabase.auth.signOut()}>Sign out</button>
                </aside>
              </div>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
