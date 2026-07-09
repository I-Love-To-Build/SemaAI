"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/browser-supabase";

type AdminData = {
  generatedAt: string;
  counts: {
    contributors: number;
    corpus: number;
    translations: number;
    recordings: number;
    approved: number;
    pending: number;
    languages: number;
  };
  targets: {
    corpus: number;
    translations: number;
    recordings: number;
  };
  recordings: Array<{
    id: string;
    language_code: string;
    status: string;
    duration_ms: number;
    created_at: string;
    playbackUrl: string | null;
    profiles?: { display_name?: string } | Array<{ display_name?: string }> | null;
    corpus_items?: { text?: string; domain?: string } | Array<{ text?: string; domain?: string }> | null;
  }>;
  translations: Array<{
    id: string;
    language_code: string;
    status: string;
    text: string;
    created_at: string;
    profiles?: { display_name?: string } | Array<{ display_name?: string }> | null;
    corpus_items?: { text?: string; domain?: string } | Array<{ text?: string; domain?: string }> | null;
  }>;
  imports: Array<{
    id: string;
    name: string;
    status: string;
    item_count: number;
    created_at: string;
  }>;
};

function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function AdminPortal() {
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [data, setData] = useState<AdminData | null>(null);
  const [status, setStatus] = useState("Sign in with an administrator account.");
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<"overview" | "recordings" | "translations" | "corpus">("overview");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: auth }) => setSession(auth.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  const loadOverview = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const response = await fetch("/api/admin/overview", {
        cache: "no-store",
        headers: { authorization: `Bearer ${session.access_token}` }
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load admin data");
      setData(payload);
      setStatus("Live data refreshed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load admin data.");
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    loadOverview();
    const timer = window.setInterval(loadOverview, 10_000);
    const refresh = () => document.visibilityState === "visible" && loadOverview();
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [session, loadOverview]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setStatus("Checking administrator access...");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setStatus(error.message);
  }

  if (!session) {
    return (
      <main className="adminLogin">
        <section className="adminLoginBrand">
          <img src="/sema-ai-brand.png" alt="Sema AI" />
          <div><p>Administration</p><h1>Protect the quality of Kenya&apos;s language data.</h1></div>
        </section>
        <form className="adminLoginPanel" onSubmit={signIn}>
          <p className="eyebrow">Restricted access</p>
          <h2>Administrator sign in</h2>
          <p>Use an account with the Sema operations administrator role.</p>
          <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <p className="authMessage" role="status">{status}</p>
          <button className="primaryButton" type="submit" disabled={loading}>{loading ? "Signing in..." : "Open admin portal"}</button>
          <a href="/">Return to contributor portal</a>
        </form>
      </main>
    );
  }

  return (
    <main className="adminShell">
      <aside className="adminSidebar">
        <img src="/sema-ai-brand.png" alt="Sema AI" />
        <p>Administration</p>
        <nav>
          {(["overview", "recordings", "translations", "corpus"] as const).map((section) => (
            <button className={activeSection === section ? "active" : ""} type="button" key={section} onClick={() => setActiveSection(section)}>
              {section}
            </button>
          ))}
        </nav>
        <div><small>{session.user.email}</small><button type="button" onClick={() => supabase.auth.signOut()}>Sign out</button></div>
      </aside>
      <section className="adminMain">
        <header><div><p className="eyebrow">Operations console</p><h1>{activeSection}</h1></div><div className="liveStatus"><span />Live · 10 second refresh<button type="button" onClick={loadOverview}>Refresh now</button></div></header>
        {!data ? <div className="largeEmptyState"><h2>{status}</h2><p>This session must have the operations administrator role.</p><button className="primaryButton" type="button" onClick={() => supabase.auth.signOut()}>Sign out and switch account</button></div> : (
          <>
            {activeSection === "overview" && (
              <>
                <section className="adminMetrics">
                  <article><span>Corpus items</span><strong>{data.counts.corpus.toLocaleString()}</strong><small>Licensed source queue</small></article>
                  <article><span>Translations</span><strong>{data.counts.translations.toLocaleString()}</strong><small>All submission states</small></article>
                  <article><span>Recordings</span><strong>{data.counts.recordings.toLocaleString()}</strong><small>Private audio objects</small></article>
                  <article><span>Contributors</span><strong>{data.counts.contributors.toLocaleString()}</strong><small>Registered profiles</small></article>
                  <article><span>Awaiting review</span><strong>{data.counts.pending.toLocaleString()}</strong><small>Quality queue</small></article>
                  <article><span>Approved</span><strong>{data.counts.approved.toLocaleString()}</strong><small>Release candidates</small></article>
                </section>
                <section className="adminTwoColumn">
                  <article className="adminPanel"><div className="adminPanelTitle"><h2>Latest recordings</h2><button type="button" onClick={() => setActiveSection("recordings")}>View all</button></div><RecordingRows rows={data.recordings.slice(0, 5)} /></article>
                  <article className="adminPanel"><div className="adminPanelTitle"><h2>Latest translations</h2><button type="button" onClick={() => setActiveSection("translations")}>View all</button></div><TranslationRows rows={data.translations.slice(0, 5)} /></article>
                </section>
              </>
            )}
            {activeSection === "recordings" && <section className="adminPanel"><div className="adminPanelTitle"><div><h2>Recording library</h2><p>Signed playback links expire after ten minutes.</p></div></div><RecordingRows rows={data.recordings} /></section>}
            {activeSection === "translations" && <section className="adminPanel"><div className="adminPanelTitle"><div><h2>Translation submissions</h2><p>Live contributor output across languages.</p></div></div><TranslationRows rows={data.translations} /></section>}
            {activeSection === "corpus" && <section className="adminPanel"><div className="adminPanelTitle"><div><h2>Corpus coverage</h2><p>Measured against licensed source items and reviewed language outputs.</p></div></div><div className="coverageGrid"><Coverage label="Source corpus" value={data.counts.corpus} target={data.targets.corpus} /><Coverage label="Translation coverage" value={data.counts.translations} target={data.targets.translations} /><Coverage label="Recording coverage" value={data.counts.recordings} target={data.targets.recordings} /></div><div className="adminPanelTitle"><div><h2>Import history</h2><p>{data.counts.corpus.toLocaleString()} actual source items across {data.counts.languages} active languages.</p></div></div><div className="importList">{data.imports.map((item) => <article key={item.id}><div><strong>{item.name}</strong><small>{new Date(item.created_at).toLocaleString()}</small></div><span>{item.item_count} items</span><b className={`reviewState ${item.status}`}>{item.status}</b></article>)}{!data.imports.length && <div className="emptyState"><strong>No corpus imports yet.</strong><span>Imports will appear here with verified item counts.</span></div>}</div></section>}
          </>
        )}
      </section>
    </main>
  );
}

function RecordingRows({ rows }: { rows: AdminData["recordings"] }) {
  return <div className="adminRows">{rows.map((item) => <article key={item.id}><div><strong>{relation(item.corpus_items)?.text ?? "Voice recording"}</strong><small>{relation(item.profiles)?.display_name ?? "Contributor"} · {item.language_code} · {Math.round(item.duration_ms / 1000)}s</small></div>{item.playbackUrl ? <audio controls preload="none" src={item.playbackUrl} /> : <span>Audio unavailable</span>}<b className={`reviewState ${item.status}`}>{item.status.replace("_", " ")}</b></article>)}{!rows.length && <div className="emptyState"><strong>No recordings yet.</strong></div>}</div>;
}

function TranslationRows({ rows }: { rows: AdminData["translations"] }) {
  return <div className="adminRows">{rows.map((item) => <article key={item.id}><div><strong>{item.text}</strong><small>{relation(item.profiles)?.display_name ?? "Contributor"} · {item.language_code} · {relation(item.corpus_items)?.domain ?? "general"}</small></div><span>{new Date(item.created_at).toLocaleDateString()}</span><b className={`reviewState ${item.status}`}>{item.status.replace("_", " ")}</b></article>)}{!rows.length && <div className="emptyState"><strong>No translations yet.</strong></div>}</div>;
}

function Coverage({ label, value, target }: { label: string; value: number; target: number }) {
  const percent = Math.min(100, (value / target) * 100);
  return <article><div><span>{label}</span><strong>{value.toLocaleString()} <small>of {target.toLocaleString()}</small></strong></div><div className="coverageTrack"><span style={{ width: `${Math.max(percent, value ? 0.3 : 0)}%` }} /></div><b>{percent < 0.01 && value ? "<0.01" : percent.toFixed(2)}%</b></article>;
}
