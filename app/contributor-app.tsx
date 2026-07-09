"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
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

type ReviewQueue = {
  translations: Array<{
    id: string;
    language_code: string;
    text: string;
    corpus_items?: { text: string; domain: string } | null;
  }>;
  recordings: Array<{
    id: string;
    language_code: string;
    storage_path: string;
    duration_ms: number;
    corpus_items?: { text: string; domain: string } | null;
  }>;
};

type Profile = {
  id: string;
  display_name: string;
  home_language_code: string | null;
  county: string | null;
  reviewer_score: number;
};

type DashboardData = {
  stats: {
    total: number;
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
};

export type AppView = "home" | "contribute" | "vocabulary" | "validate" | "history" | "languages" | "profile";

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

export default function ContributorApp({ languages, initialView = "home" }: { languages: SemaLanguage[]; initialView?: AppView }) {
  const router = useRouter();
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [session, setSession] = useState<Session | null>(null);
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
  const [sourceLanguageCode, setSourceLanguageCode] = useState<"en" | "sw">("en");
  const [domain, setDomain] = useState("health");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [translation, setTranslation] = useState("");
  const [reviewQueue, setReviewQueue] = useState<ReviewQueue>({ translations: [], recordings: [] });
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Task[]>([]);
  const [vocabularySearch, setVocabularySearch] = useState("");
  const [vocabularyUnit, setVocabularyUnit] = useState<"word" | "phrase" | "sentence" | "term" | "idiom" | "proverb" | "all">("word");
  const [vocabularyDomain, setVocabularyDomain] = useState("");
  const [vocabularyItems, setVocabularyItems] = useState<Task[]>([]);
  const [vocabularyCount, setVocabularyCount] = useState(0);
  const [consentId, setConsentId] = useState("");
  const [speakerProfileId, setSpeakerProfileId] = useState("");
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [recordingMs, setRecordingMs] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [message, setMessage] = useState("Ready");
  const [activeView, setActiveView] = useState<AppView>(initialView);
  const [contributionMode, setContributionMode] = useState<"translate" | "record">("translate");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordingStartedAt = useRef<number>(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
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
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => loadDashboard(), 10_000);
    const refresh = () => {
      if (document.visibilityState === "visible") loadDashboard();
    };
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [session?.access_token]);

  const token = session?.access_token;
  const activeLanguage = languages.find((language) => language.code === languageCode);
  const viewRoutes: Record<AppView, string> = {
    home: "/",
    contribute: "/contribute",
    vocabulary: "/vocabulary",
    validate: "/validate",
    history: "/my-work",
    languages: "/languages",
    profile: "/profile"
  };

  function navigateView(view: AppView) {
    setActiveView(view);
    router.push(viewRoutes[view]);
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
      setMessage("Profile loaded.");
    } catch (error) {
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
    await api("/api/profile", {
      method: "PUT",
      body: JSON.stringify({
        displayName,
        county,
        homeLanguageCode: languageCode,
        languages: [languageCode]
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
    setMessage("Profile, consent, and speaker profile saved.");
  }

  async function claimTasks() {
    const data = await api<{ tasks: Task[] }>("/api/tasks/claim", {
      method: "POST",
      body: JSON.stringify({
        languageCode,
        sourceLanguageCode,
        taskType: contributionMode === "record" ? "recording" : "translation",
        domain,
        limit: 10
      })
    });
    setTasks(data.tasks);
    setActiveTask(data.tasks[0] ?? null);
    setMessage(data.tasks.length ? `Claimed ${data.tasks.length} tasks.` : "No tasks found. Seed or import corpus items.");
  }

  function switchContributionMode(mode: "translate" | "record") {
    setContributionMode(mode);
    setTasks([]);
    setActiveTask(null);
    setTranslation("");
    setRecordingBlob(null);
  }

  async function submitTranslation() {
    if (!activeTask) return;
    await api("/api/translations", {
      method: "POST",
      body: JSON.stringify({
        corpusItemId: activeTask.id,
        languageCode,
        text: translation
      })
    });
    setTranslation("");
    const remaining = tasks.filter((task) => task.id !== activeTask.id);
    setTasks(remaining);
    setActiveTask(remaining[0] ?? null);
    setMessage("Translation submitted for review.");
    await loadDashboard();
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

  function translateCorpusItem(item: Task) {
    setSourceLanguageCode(item.language_code === "sw" ? "sw" : "en");
    switchContributionMode("translate");
    setTasks([item]);
    setActiveTask(item);
    navigateView("contribute");
  }

  useEffect(() => {
    if (activeView === "vocabulary" && token) loadVocabulary();
  }, [activeView, token, vocabularyUnit, sourceLanguageCode, vocabularyDomain]);

  async function loadReviewQueue() {
    const data = await api<ReviewQueue>("/api/reviews/queue");
    setReviewQueue(data);
    setMessage("Review queue loaded.");
  }

  async function submitReview(targetType: "translation" | "recording", targetId: string, state: "approved" | "rejected") {
    await api("/api/reviews", {
      method: "POST",
      body: JSON.stringify({
        targetType,
        targetId,
        state,
        score: state === "approved" ? 95 : 20,
        reasons: state === "approved" ? ["accurate"] : ["needs_revision"]
      })
    });
    await loadReviewQueue();
    setMessage(`Review ${state}.`);
  }

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      setRecordingBlob(new Blob(chunks, { type: "audio/webm" }));
      setRecordingMs(Date.now() - recordingStartedAt.current);
      setIsRecording(false);
      setMessage("Recording captured. Preview and submit it.");
    };
    recordingStartedAt.current = Date.now();
    mediaRecorder.current = recorder;
    recorder.start();
    setIsRecording(true);
    setMessage("Recording...");
  }

  function stopRecording() {
    mediaRecorder.current?.stop();
  }

  async function submitRecording() {
    if (!activeTask || !recordingBlob) return;
    if (!consentId || !speakerProfileId) {
      setMessage("Save profile and consent before recording.");
      return;
    }
    const signed = await api<{ bucket: string; path: string; token: string }>("/api/storage/signed-upload", {
      method: "POST",
      body: JSON.stringify({
        corpusItemId: activeTask.id,
        languageCode,
        contentType: "audio/webm",
        byteSize: recordingBlob.size
      })
    });
    const { error } = await supabase.storage
      .from(signed.bucket)
      .uploadToSignedUrl(signed.path, signed.token, recordingBlob);
    if (error) throw error;
    await api("/api/recordings", {
      method: "POST",
      body: JSON.stringify({
        corpusItemId: activeTask.id,
        languageCode,
        storagePath: signed.path,
        durationMs: recordingMs,
        sampleRate: 48000,
        environment: "quiet_room",
        speakerProfileId,
        consentRecordId: consentId,
        qa: { autoPass: recordingMs > 750, silenceRatio: 0, clippingRatio: 0 }
      })
    });
    setRecordingBlob(null);
    setMessage("Recording uploaded and submitted.");
    await loadDashboard();
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
  const dailyGoal = 10;
  const dailyProgress = Math.min(stats.total, dailyGoal);
  const approvalRate = stats.approved + stats.rejected
    ? Math.round((stats.approved / (stats.approved + stats.rejected)) * 100)
    : 100;
  const navItems: Array<{ id: AppView; label: string; icon: string }> = [
    { id: "home", label: "Home", icon: "H" },
    { id: "contribute", label: "Contribute", icon: "C" },
    { id: "vocabulary", label: "Vocabulary", icon: "W" },
    ...(canReview ? [{ id: "validate" as AppView, label: "Validate", icon: "V" }] : []),
    { id: "history", label: "My work", icon: "M" },
    { id: "languages", label: "Languages", icon: "L" },
    { id: "profile", label: "Profile", icon: "P" }
  ];

  return (
    <main className="portalShell">
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
          <span>{(profile?.display_name || session.user.email || "S").slice(0, 1).toUpperCase()}</span>
          <span><strong>{profile?.display_name || "Contributor"}</strong><small>{activeLanguage?.name}</small></span>
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
              {(profile?.display_name || session.user.email || "S").slice(0, 1).toUpperCase()}
            </button>
          </div>
        </header>

        <div className="portalContent">
          {activeView === "home" && (
            <>
              <section className="welcomeBand">
                <div>
                  <p className="eyebrow">Your contribution space</p>
                  <h1>Good to see you, {profile?.display_name?.split(" ")[0] || "contributor"}.</h1>
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

              <section className="homeGrid">
                <article className="homeSection">
                  <div className="sectionTitle"><div><p className="eyebrow">Choose a task</p><h2>How would you like to help?</h2></div></div>
                  <div className="taskModeGrid">
                    <button type="button" onClick={() => { switchContributionMode("translate"); navigateView("contribute"); }}>
                      <span className="modeIcon teal">T</span><strong>Translate text</strong><small>Write natural, local-language translations</small><b>Start translating</b>
                    </button>
                    <button type="button" onClick={() => { switchContributionMode("record"); navigateView("contribute"); }}>
                      <span className="modeIcon coral">R</span><strong>Record your voice</strong><small>Read approved prompts in your natural voice</small><b>Start recording</b>
                    </button>
                    <button type="button" onClick={() => canReview ? navigateView("validate") : navigateView("history")}>
                      <span className="modeIcon blue">V</span><strong>Validate work</strong><small>{canReview ? "Review community translations and audio" : "Unlocks after quality onboarding"}</small><b>{canReview ? "Start validating" : "View progress"}</b>
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

          {activeView === "contribute" && (
            <section className="contributionLayout">
              <div className="contributionMain">
                <div className="pageHeading">
                  <div><p className="eyebrow">Contribution workspace</p><h1>Make {activeLanguage?.name} understood.</h1><p>Choose a mode, claim a small batch, and work at your own pace.</p></div>
                  <span className="queueCount">{tasks.length} in your queue</span>
                </div>
                <div className="modeTabs" role="tablist">
                  <button className={contributionMode === "translate" ? "active" : ""} type="button" onClick={() => switchContributionMode("translate")}>Translate</button>
                  <button className={contributionMode === "record" ? "active" : ""} type="button" onClick={() => switchContributionMode("record")}>Record</button>
                </div>
                <div className="queueControls">
                  {contributionMode === "translate" && <label>Translate from<select value={sourceLanguageCode} onChange={(event) => setSourceLanguageCode(event.target.value as "en" | "sw")}><option value="en">English</option><option value="sw">Kiswahili</option></select></label>}
                  <label>Topic<select value={domain} onChange={(event) => setDomain(event.target.value)}>{domains.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
                  <button className="primaryButton" type="button" onClick={claimTasks}>{tasks.length ? "Add more tasks" : "Get a task batch"}</button>
                </div>
                {activeTask ? (
                  <article className="focusedTask">
                    <div className="taskMeta"><span>{activeTask.domain}</span><span>{activeTask.difficulty}</span><strong>{tasks.findIndex((item) => item.id === activeTask.id) + 1} of {tasks.length}</strong></div>
                    <p className="sourceLabel">Source text</p>
                    <h2>{activeTask.text}</h2>
                    {contributionMode === "translate" ? (
                      <>
                        <label>Your {activeLanguage?.name} translation<textarea value={translation} onChange={(event) => setTranslation(event.target.value)} placeholder="Write this as you would naturally say it..." /></label>
                        <div className="taskFooter"><span>Use natural wording. Preserve the original meaning.</span><button className="primaryButton" type="button" onClick={submitTranslation} disabled={!translation.trim()}>Submit and continue</button></div>
                      </>
                    ) : (
                      <div className="recordingStudio">
                        <div className={`recordingVisual ${isRecording ? "live" : ""}`}><span /><span /><span /><span /><span /><span /><span /></div>
                        <p>{isRecording ? "Recording now. Speak naturally and clearly." : recordingBlob ? "Recording ready for review." : "Find a quiet place and read the source text aloud."}</p>
                        {recordingBlob && <audio controls src={URL.createObjectURL(recordingBlob)} />}
                        <div className="actions">
                          <button className="recordButton" type="button" onClick={isRecording ? stopRecording : startRecording}>{isRecording ? "Stop recording" : recordingBlob ? "Record again" : "Start recording"}</button>
                          <button className="primaryButton" type="button" onClick={submitRecording} disabled={!recordingBlob}>Submit recording</button>
                        </div>
                      </div>
                    )}
                  </article>
                ) : (
                  <div className="largeEmptyState"><span>C</span><h2>Your queue is ready when you are.</h2><p>Claim a batch of ten focused tasks for {activeLanguage?.name}.</p><button className="primaryButton" type="button" onClick={claimTasks}>Get a task batch</button></div>
                )}
              </div>
              <aside className="guidancePanel">
                <p className="eyebrow">Quality guide</p>
                <h3>{contributionMode === "translate" ? "Translate meaning, not words." : "Your natural voice is the right voice."}</h3>
                <ul>{contributionMode === "translate" ? <><li>Use everyday language people actually speak.</li><li>Keep names and numbers accurate.</li><li>Flag text that feels unsafe or unclear.</li></> : <><li>Use your normal accent and pace.</li><li>Avoid music and background conversations.</li><li>Listen once before submitting.</li></>}</ul>
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
                    <button className="ghostButton" type="button" onClick={() => translateCorpusItem(item)}>Translate</button>
                  </article>
                ))}
                {!vocabularyItems.length && <div className="largeEmptyState"><span>W</span><h2>No matching corpus units yet.</h2><p>Change the source, unit type, topic, or search text.</p></div>}
              </div>
            </section>
          )}

          {activeView === "validate" && (
            <section className="standardPage">
              <div className="pageHeading"><div><p className="eyebrow">Community quality</p><h1>Validate contributions</h1><p>Compare the source and submission, then make a fair language judgment.</p></div><button className="primaryButton" type="button" onClick={loadReviewQueue}>Load review queue</button></div>
              <div className="reviewGrid">
                {reviewQueue.translations.map((item) => <article className="reviewCard" key={item.id}><span>{item.language_code} translation</span><small>Source</small><p>{item.corpus_items?.text}</p><small>Submission</small><strong>{item.text}</strong><div className="actions"><button className="primaryButton" type="button" onClick={() => submitReview("translation", item.id, "approved")}>Approve</button><button className="dangerButton" type="button" onClick={() => submitReview("translation", item.id, "rejected")}>Needs changes</button></div></article>)}
                {reviewQueue.recordings.map((item) => <article className="reviewCard" key={item.id}><span>{item.language_code} recording</span><strong>{item.corpus_items?.text ?? "Voice contribution"}</strong><p>{Math.round(item.duration_ms / 1000)} second recording</p><div className="actions"><button className="primaryButton" type="button" onClick={() => submitReview("recording", item.id, "approved")}>Approve</button><button className="dangerButton" type="button" onClick={() => submitReview("recording", item.id, "rejected")}>Needs changes</button></div></article>)}
                {!reviewQueue.translations.length && !reviewQueue.recordings.length && <div className="largeEmptyState"><span>V</span><h2>No review items loaded.</h2><p>Load the queue to begin validating work for your language.</p></div>}
              </div>
            </section>
          )}

          {activeView === "history" && (
            <section className="standardPage">
              <div className="pageHeading"><div><p className="eyebrow">My work</p><h1>Contribution history</h1><p>Follow every submission from contribution through community review.</p></div><span className="queueCount">{stats.total} total</span></div>
              <div className="historyTable">
                <div className="historyHead"><span>Contribution</span><span>Language</span><span>Date</span><span>Status</span></div>
                {dashboard?.recent.map((item) => <article key={item.id}><div><span className="activityType">{item.type.slice(0, 1)}</span><span><strong>{item.title}</strong><small>{item.type}{item.source ? ` · ${item.source}` : ""}</small></span></div><span>{item.languageCode}</span><span>{new Date(item.createdAt).toLocaleDateString()}</span><span className={`reviewState ${item.status}`}>{item.status.replace("_", " ")}</span></article>)}
                {!dashboard?.recent.length && <div className="emptyState"><strong>No submissions yet.</strong><span>Your completed work and review outcomes will appear here.</span></div>}
              </div>
            </section>
          )}

          {activeView === "languages" && (
            <section className="standardPage">
              <div className="pageHeading"><div><p className="eyebrow">Language communities</p><h1>Choose where you contribute</h1><p>Sema supports 68 Kenyan languages and language varieties.</p></div></div>
              <div className="languageSearch"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a language..." /></div>
              <div className="languageCards">
                {languages.filter((language) => language.name.toLowerCase().includes(search.toLowerCase())).map((language) => (
                  <button className={language.code === languageCode ? "selected" : ""} type="button" key={language.code} onClick={() => setLanguageCode(language.code)}>
                    <span>{language.name.slice(0, 2).toUpperCase()}</span><div><strong>{language.name}</strong><small>{language.family} · {language.priority}</small></div>{language.code === languageCode && <b>Current</b>}
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
                    <label>Primary language<select value={languageCode} onChange={(event) => setLanguageCode(event.target.value)}>{languages.map((language) => <option value={language.code} key={language.code}>{language.name} · {language.family}</option>)}</select></label>
                    <label>Email address<input value={session.user.email ?? ""} disabled /></label>
                    <button className="primaryButton" type="button" onClick={saveProfile}>Save profile and consent</button>
                  </div>
                </article>
                <aside className="profileSummary">
                  <span className="largeAvatar">{(profile?.display_name || session.user.email || "S").slice(0, 1).toUpperCase()}</span>
                  <h2>{profile?.display_name || "New contributor"}</h2>
                  <p>{activeLanguage?.name} contributor · {county || "Region not set"}</p>
                  <dl><div><dt>Quality score</dt><dd>{profile?.reviewer_score || approvalRate}%</dd></div><div><dt>Contributions</dt><dd>{stats.total}</dd></div><div><dt>Points</dt><dd>{stats.points}</dd></div></dl>
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
