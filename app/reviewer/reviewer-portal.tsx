"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/browser-supabase";

type Relation<T> = T | T[] | null | undefined;

type ReviewQueue = {
  roles?: Array<{ role: string; language_code: string | null }>;
  translations: Array<{
    id: string;
    language_code: string;
    text: string;
    status: string;
    created_at: string;
    profiles?: Relation<{ display_name?: string }>;
    corpus_items?: Relation<{ text?: string; domain?: string }>;
  }>;
  recordings: Array<{
    id: string;
    language_code: string;
    storage_path: string;
    playbackUrl: string | null;
    duration_ms: number;
    status: string;
    created_at: string;
    profiles?: Relation<{ display_name?: string }>;
    corpus_items?: Relation<{ text?: string; domain?: string }>;
  }>;
};

function relation<T>(value: Relation<T>) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ReviewerPortal() {
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [queue, setQueue] = useState<ReviewQueue>({ translations: [], recordings: [], roles: [] });
  const [activeTab, setActiveTab] = useState<"translations" | "recordings">("translations");
  const [status, setStatus] = useState("Sign in with a reviewer, expert, language lead, or admin account.");
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  const loadQueue = useCallback(async () => {
    if (!session?.access_token) return;
    setBusy(true);
    try {
      const response = await fetch("/api/reviews/queue", {
        cache: "no-store",
        headers: { authorization: `Bearer ${session.access_token}` }
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load review queue.");
      setQueue(payload);
      setStatus(`Loaded ${(payload.translations?.length ?? 0) + (payload.recordings?.length ?? 0)} review items.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load review queue.");
    } finally {
      setBusy(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    loadQueue();
  }, [session, loadQueue]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus("Checking reviewer access...");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setStatus(error.message);
  }

  async function submitReview(targetType: "translation" | "recording", targetId: string, state: "approved" | "rejected" | "expert_review") {
    if (!session?.access_token) return;
    const key = `${targetType}:${targetId}`;
    setReviewing((current) => ({ ...current, [key]: true }));
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          targetType,
          targetId,
          state,
          score: state === "approved" ? 95 : state === "expert_review" ? 65 : 25,
          reasons: state === "approved" ? ["accurate"] : state === "expert_review" ? ["needs_expert_review"] : ["needs_revision"],
          notes: notes[key]?.trim() || undefined
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Review failed.");
      setNotes((current) => ({ ...current, [key]: "" }));
      setStatus(`Review saved. Consensus state: ${payload.consensus?.finalState ?? state}.`);
      await loadQueue();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Review failed.");
    } finally {
      setReviewing((current) => ({ ...current, [key]: false }));
    }
  }

  const translationCount = queue.translations.length;
  const recordingCount = queue.recordings.length;
  const scopedRoles = queue.roles ?? [];

  if (!authReady) {
    return (
      <main className="appBoot">
        <img src="/sema-ai-brand.png" alt="Sema AI" />
        <strong>Opening reviewer portal...</strong>
        <span>Checking your secure session.</span>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="reviewerLogin">
        <section className="reviewerLoginBrand">
          <img src="/sema-ai-brand.png" alt="Sema AI" />
          <div>
            <p>Reviewer portal</p>
            <h1>Guard the meaning, voice, and trust of every language submission.</h1>
          </div>
        </section>
        <form className="reviewerLoginPanel" onSubmit={signIn}>
          <p className="eyebrow">Trusted access</p>
          <h2>Reviewer sign in</h2>
          <p>Use a reviewer, expert, language lead, or operations admin account.</p>
          <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <p className="authMessage" role="status">{status}</p>
          <button className="primaryButton" type="submit" disabled={busy}>{busy ? "Signing in..." : "Open review portal"}</button>
          <a href="/">Return to contributor portal</a>
        </form>
      </main>
    );
  }

  return (
    <main className="reviewerShell">
      <aside className="reviewerSidebar">
        <img src="/sema-ai-brand.png" alt="Sema AI" />
        <p>Review operations</p>
        <nav>
          <button className={activeTab === "translations" ? "active" : ""} type="button" onClick={() => setActiveTab("translations")}>Translations <span>{translationCount}</span></button>
          <button className={activeTab === "recordings" ? "active" : ""} type="button" onClick={() => setActiveTab("recordings")}>Recordings <span>{recordingCount}</span></button>
        </nav>
        <div className="reviewerIdentity">
          <small>{session.user.email}</small>
          <button type="button" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </aside>

      <section className="reviewerMain">
        <header>
          <div>
            <p className="eyebrow">Quality review</p>
            <h1>Reviewer workspace</h1>
            <p>Judge meaning, naturalness, safety, and recording quality before work can move toward release.</p>
          </div>
          <button className="primaryButton" type="button" onClick={loadQueue} disabled={busy}>{busy ? "Refreshing..." : "Refresh queue"}</button>
        </header>

        <section className="reviewerSummary">
          <article><span>Translations</span><strong>{translationCount}</strong><small>Waiting for judgment</small></article>
          <article><span>Recordings</span><strong>{recordingCount}</strong><small>Audio requiring review</small></article>
          <article><span>Reviewer scope</span><strong>{scopedRoles.length}</strong><small>{scopedRoles.map((role) => role.language_code ?? role.role).join(", ") || "No scope loaded"}</small></article>
        </section>

        <p className="reviewerStatus" role="status">{status}</p>

        <section className="reviewerLayout">
          <div className="reviewerQueue">
            {activeTab === "translations" && (
              translationCount ? queue.translations.map((item) => {
                const source = relation(item.corpus_items);
                const contributor = relation(item.profiles);
                const key = `translation:${item.id}`;
                return (
                  <article className="reviewerCard" key={item.id}>
                    <div className="reviewerCardTop"><span>{item.language_code} translation</span><b className={`reviewState ${item.status}`}>{item.status.replace("_", " ")}</b></div>
                    <small>Source · {source?.domain ?? "general"}</small>
                    <h2>{source?.text ?? "Source unavailable"}</h2>
                    <small>Submission by {contributor?.display_name ?? "Contributor"}</small>
                    <p>{item.text}</p>
                    <label>Reviewer note<textarea value={notes[key] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [key]: event.target.value }))} placeholder="Optional note for audit trail or revision guidance..." /></label>
                    <ReviewActions busy={Boolean(reviewing[key])} onApprove={() => submitReview("translation", item.id, "approved")} onReject={() => submitReview("translation", item.id, "rejected")} onEscalate={() => submitReview("translation", item.id, "expert_review")} />
                  </article>
                );
              }) : <EmptyReviewState label="No translation reviews in your queue." />
            )}

            {activeTab === "recordings" && (
              recordingCount ? queue.recordings.map((item) => {
                const source = relation(item.corpus_items);
                const contributor = relation(item.profiles);
                const key = `recording:${item.id}`;
                return (
                  <article className="reviewerCard" key={item.id}>
                    <div className="reviewerCardTop"><span>{item.language_code} recording</span><b className={`reviewState ${item.status}`}>{item.status.replace("_", " ")}</b></div>
                    <small>Prompt · {source?.domain ?? "general"}</small>
                    <h2>{source?.text ?? "Audio prompt unavailable"}</h2>
                    <small>Submission by {contributor?.display_name ?? "Contributor"} · {Math.max(1, Math.round(item.duration_ms / 1000))} seconds</small>
                    {item.playbackUrl ? <audio controls preload="none" src={item.playbackUrl} /> : <p>Audio playback link unavailable.</p>}
                    <label>Reviewer note<textarea value={notes[key] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [key]: event.target.value }))} placeholder="Mention noise, clipping, wrong prompt, or pronunciation concerns..." /></label>
                    <ReviewActions busy={Boolean(reviewing[key])} onApprove={() => submitReview("recording", item.id, "approved")} onReject={() => submitReview("recording", item.id, "rejected")} onEscalate={() => submitReview("recording", item.id, "expert_review")} />
                  </article>
                );
              }) : <EmptyReviewState label="No recording reviews in your queue." />
            )}
          </div>

          <aside className="reviewGuidance">
            <p className="eyebrow">Review standard</p>
            <h2>Quality before volume.</h2>
            <ul>
              <li>Approve only natural language a fluent speaker would actually use.</li>
              <li>Reject spam, copied source text, unsafe text, or machine-like translations.</li>
              <li>For audio, check prompt match, clarity, background noise, clipping, and completeness.</li>
              <li>Escalate dialect disputes, uncertain meaning, sensitive terminology, and low-resource language disagreements.</li>
            </ul>
            <div className="reviewerLinks">
              <a href="/">Contributor portal</a>
              <a href="/admin">Admin console</a>
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}

function ReviewActions({ busy, onApprove, onReject, onEscalate }: { busy: boolean; onApprove: () => void; onReject: () => void; onEscalate: () => void }) {
  return (
    <div className="reviewerActions">
      <button className="primaryButton" type="button" onClick={onApprove} disabled={busy}>{busy ? "Saving..." : "Approve"}</button>
      <button className="ghostButton" type="button" onClick={onEscalate} disabled={busy}>Escalate</button>
      <button className="dangerButton" type="button" onClick={onReject} disabled={busy}>Needs changes</button>
    </div>
  );
}

function EmptyReviewState({ label }: { label: string }) {
  return (
    <div className="largeEmptyState">
      <span>R</span>
      <h2>{label}</h2>
      <p>Refresh later, or ask an operations admin to check language assignment and queue volume.</p>
    </div>
  );
}
