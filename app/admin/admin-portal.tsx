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
  quality?: {
    approvalRate: number;
    needsRevision: number;
    rejected: number;
    expertReview: number;
    consensusDecisions: number;
    openAlerts: Array<{
      id: string;
      severity: string;
      source: string;
      message: string;
      created_at: string;
    }>;
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
  readiness: Array<{
    area: string;
    status: string;
    progress: number;
    target: string;
    nextStep: string;
  }>;
  pipeline: {
    pilot: {
      targetContributors: number;
      targetLanguages: number;
      targetDomains: string[];
      contributorProgress: number;
      languageProgress: number;
      status: string;
    };
    counts: {
      clientIngests: number;
      trainingJobs: number;
      modelReleases: number;
      publishedModels: number;
      clientApiKeys: number;
      usageEvents: number;
      datasetReleases: number;
      evaluationRuns: number;
      reputationProfiles: number;
    };
    clientIngests: Array<{
      id: string;
      name: string;
      status: string;
      language_codes: string[];
      domains: string[];
      unit_count: number;
      audio_hours: number;
      quality_score: number | null;
      rejection_reasons: string[];
      created_at: string;
    }>;
    trainingJobs: Array<{
      id: string;
      model_type: string;
      status: string;
      language_codes: string[];
      domains: string[];
      training_provider: string | null;
      endpoint_url: string | null;
      metrics: Record<string, unknown>;
      error: string | null;
      created_at: string;
      updated_at: string;
    }>;
    modelReleases: Array<{
      id: string;
      slug: string;
      name: string;
      model_type: string;
      version: string;
      status: string;
      quality_score: number;
      endpoint_url: string | null;
      language_codes: string[];
      domains: string[];
      created_at: string;
    }>;
  };
  missions: Array<{
    id: string;
    slug: string;
    title: string;
    description: string;
    domain: string;
    language_codes: string[];
    target_items: number;
    status: string;
    priority: number;
    governance_notes: string | null;
    updated_at: string;
  }>;
  languageMetrics: Array<{
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
  }>;
  governance: {
    reputationProfiles: number;
    missionCount: number;
    languageMetricCount: number;
    provenanceEndpoint: string;
  };
};

function relation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function AdminPortal() {
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [data, setData] = useState<AdminData | null>(null);
  const [status, setStatus] = useState("Sign in with an administrator account.");
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<"overview" | "recordings" | "translations" | "corpus" | "missions" | "governance" | "pipeline" | "readiness">("overview");
  const [missionForm, setMissionForm] = useState({
    slug: "",
    title: "",
    description: "",
    domain: "health",
    languageCodes: "sw, sheng",
    targetItems: "500",
    status: "active",
    priority: "50",
    governanceNotes: ""
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: auth }) => {
      setSession(auth.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAuthReady(true);
    });
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

  async function saveMission(event: React.FormEvent) {
    event.preventDefault();
    if (!session?.access_token) return;
    setStatus("Saving mission...");
    try {
      const response = await fetch("/api/missions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          slug: missionForm.slug.trim(),
          title: missionForm.title.trim(),
          description: missionForm.description.trim(),
          domain: missionForm.domain.trim(),
          languageCodes: missionForm.languageCodes.split(",").map((item) => item.trim()).filter(Boolean),
          targetItems: Number(missionForm.targetItems),
          status: missionForm.status,
          priority: Number(missionForm.priority),
          governanceNotes: missionForm.governanceNotes.trim() || undefined
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not save mission.");
      setStatus("Mission saved.");
      setMissionForm((current) => ({ ...current, slug: "", title: "", description: "", governanceNotes: "" }));
      await loadOverview();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save mission.");
    }
  }

  if (!authReady) {
    return (
      <main className="appBoot">
        <img src="/sema-ai-brand.png" alt="Sema AI" />
        <strong>Opening administration...</strong>
        <span>Checking your secure session.</span>
      </main>
    );
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
          {(["overview", "recordings", "translations", "corpus", "missions", "governance", "pipeline", "readiness"] as const).map((section) => (
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
                <section className="adminPanel">
                  <div className="adminPanelTitle"><div><h2>Quality controls</h2><p>Consensus, revision, and escalation health across the live dataset.</p></div></div>
                  <div className="coverageGrid">
                    <Coverage label="Approval rate" value={data.quality?.approvalRate ?? 0} target={100} />
                    <Coverage label="Needs revision" value={data.quality?.needsRevision ?? 0} target={Math.max(1, data.counts.translations + data.counts.recordings)} />
                    <Coverage label="Expert review" value={data.quality?.expertReview ?? 0} target={Math.max(1, data.counts.pending)} />
                    <Coverage label="Consensus decisions" value={data.quality?.consensusDecisions ?? 0} target={Math.max(1, data.counts.approved)} />
                  </div>
                  <div className="importList">
                    {(data.quality?.openAlerts ?? []).map((alert) => (
                      <article key={alert.id}>
                        <div><strong>{alert.message}</strong><small>{alert.source} · {new Date(alert.created_at).toLocaleString()}</small></div>
                        <b className={`reviewState ${alert.severity}`}>{alert.severity}</b>
                      </article>
                    ))}
                    {!(data.quality?.openAlerts ?? []).length && <div className="emptyState"><strong>No open quality alerts.</strong><span>Training, ingest, and evaluation warnings will appear here.</span></div>}
                  </div>
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
            {activeSection === "missions" && <MissionsPanel data={data} form={missionForm} setForm={setMissionForm} onSubmit={saveMission} />}
            {activeSection === "governance" && <GovernancePanel data={data} onRefreshMetrics={async () => {
              if (!session?.access_token) return;
              setStatus("Refreshing language metrics...");
              const response = await fetch("/api/language-metrics", { headers: { authorization: `Bearer ${session.access_token}` } });
              if (!response.ok) setStatus("Language metrics refresh failed.");
              else setStatus("Language metrics refreshed.");
              await loadOverview();
            }} />}
            {activeSection === "pipeline" && <PipelinePanel data={data} />}
            {activeSection === "readiness" && <ReadinessPanel items={data.readiness} />}
          </>
        )}
      </section>
    </main>
  );
}

function MissionsPanel({
  data,
  form,
  setForm,
  onSubmit
}: {
  data: AdminData;
  form: {
    slug: string;
    title: string;
    description: string;
    domain: string;
    languageCodes: string;
    targetItems: string;
    status: string;
    priority: string;
    governanceNotes: string;
  };
  setForm: React.Dispatch<React.SetStateAction<{
    slug: string;
    title: string;
    description: string;
    domain: string;
    languageCodes: string;
    targetItems: string;
    status: string;
    priority: string;
    governanceNotes: string;
  }>>;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <section className="adminPanel">
      <div className="adminPanelTitle">
        <div><h2>Mission controls</h2><p>Create focused contribution campaigns for priority domains and language communities.</p></div>
      </div>
      <form className="adminFormGrid" onSubmit={onSubmit}>
        <label>Slug<input value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} placeholder="health-access" required /></label>
        <label>Title<input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Health access sprint" required /></label>
        <label>Domain<input value={form.domain} onChange={(event) => setForm((current) => ({ ...current, domain: event.target.value }))} required /></label>
        <label>Language codes<input value={form.languageCodes} onChange={(event) => setForm((current) => ({ ...current, languageCodes: event.target.value }))} placeholder="sw, sheng, giri" required /></label>
        <label>Target items<input type="number" min="1" value={form.targetItems} onChange={(event) => setForm((current) => ({ ...current, targetItems: event.target.value }))} required /></label>
        <label>Priority<input type="number" min="0" max="100" value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))} required /></label>
        <label>Status<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="archived">Archived</option></select></label>
        <label className="wide">Governance notes<textarea value={form.governanceNotes} onChange={(event) => setForm((current) => ({ ...current, governanceNotes: event.target.value }))} placeholder="Reviewer rules, community permissions, release restrictions..." /></label>
        <label className="wide">Description<textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="What this mission collects and why it matters." required /></label>
        <button className="primaryButton" type="submit">Save mission</button>
      </form>
      <div className="importList">
        {data.missions.map((mission) => (
          <article key={mission.id}>
            <div>
              <strong>{mission.title}</strong>
              <small>{mission.domain} - {mission.language_codes.join(", ")} - target {mission.target_items.toLocaleString()} - updated {new Date(mission.updated_at).toLocaleDateString()}</small>
            </div>
            <span>priority {mission.priority}</span>
            <b className={`reviewState ${mission.status}`}>{mission.status}</b>
          </article>
        ))}
        {!data.missions.length && <div className="emptyState"><strong>No missions table rows yet.</strong><span>Apply the production features migration, then create your first mission here.</span></div>}
      </div>
    </section>
  );
}

function GovernancePanel({ data, onRefreshMetrics }: { data: AdminData; onRefreshMetrics: () => void }) {
  return (
    <section className="adminPanel">
      <div className="adminPanelTitle">
        <div><h2>Governance and trust</h2><p>Operational controls for reputation, language readiness, provenance, consent, and release safety.</p></div>
        <button type="button" onClick={onRefreshMetrics}>Refresh language metrics</button>
      </div>
      <div className="adminMetrics">
        <article><span>Reputation rows</span><strong>{data.governance.reputationProfiles.toLocaleString()}</strong><small>Persisted contributor trust records</small></article>
        <article><span>Missions</span><strong>{data.governance.missionCount.toLocaleString()}</strong><small>Focused data campaigns</small></article>
        <article><span>Language metrics</span><strong>{data.governance.languageMetricCount.toLocaleString()}</strong><small>Real readiness rows</small></article>
        <article><span>Provenance API</span><strong>Live</strong><small>{data.governance.provenanceEndpoint}</small></article>
      </div>
      <div className="readinessGrid">
        {data.languageMetrics.map((metric) => (
          <article key={metric.language_code}>
            <div className="readinessTop"><span>{metric.language_code}</span><b className={`reviewState ${metric.readiness_score >= 70 ? "approved" : "submitted"}`}>{metric.readiness_score}%</b></div>
            <div className="coverageTrack"><span style={{ width: `${Math.max(metric.readiness_score, metric.readiness_score ? 4 : 0)}%` }} /></div>
            <p>{metric.source_items.toLocaleString()} sources, {metric.translations_approved.toLocaleString()} approved translations, {metric.recordings_approved.toLocaleString()} approved recordings.</p>
            <small>Text {metric.text_coverage}% - Audio {metric.audio_coverage}% - Review {metric.review_coverage}% - Contributors {metric.contributor_count}</small>
          </article>
        ))}
        {!data.languageMetrics.length && <div className="emptyState"><strong>No language metrics yet.</strong><span>Run the language metrics API after applying the migration.</span></div>}
      </div>
    </section>
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

function PipelinePanel({ data }: { data: AdminData }) {
  const counts = data.pipeline.counts;
  return (
    <section className="adminPanel">
      <div className="adminPanelTitle">
        <div>
          <h2>Production pipeline</h2>
          <p>Controlled pilot, client data intake, training jobs, evaluations, and published model endpoints.</p>
        </div>
      </div>

      <div className="adminMetrics">
        <article><span>Pilot status</span><strong>{data.pipeline.pilot.status}</strong><small>{data.pipeline.pilot.targetDomains.join(", ")}</small></article>
        <article><span>Client ingests</span><strong>{counts.clientIngests.toLocaleString()}</strong><small>Data entering QA</small></article>
        <article><span>Training jobs</span><strong>{counts.trainingJobs.toLocaleString()}</strong><small>Queued through published</small></article>
        <article><span>Published models</span><strong>{counts.publishedModels.toLocaleString()}</strong><small>Client-callable releases</small></article>
        <article><span>API keys</span><strong>{counts.clientApiKeys.toLocaleString()}</strong><small>Active client keys</small></article>
        <article><span>Usage events</span><strong>{counts.usageEvents.toLocaleString()}</strong><small>Client API calls logged</small></article>
      </div>

      <div className="coverageGrid">
        <Coverage label="Pilot contributors" value={Math.round((data.pipeline.pilot.contributorProgress / 100) * data.pipeline.pilot.targetContributors)} target={data.pipeline.pilot.targetContributors} />
        <Coverage label="Pilot languages" value={Math.round((data.pipeline.pilot.languageProgress / 100) * data.pipeline.pilot.targetLanguages)} target={data.pipeline.pilot.targetLanguages} />
        <Coverage label="Dataset releases" value={counts.datasetReleases} target={Math.max(1, counts.clientIngests)} />
        <Coverage label="Evaluation runs" value={counts.evaluationRuns} target={Math.max(1, counts.trainingJobs)} />
      </div>

      <section className="adminTwoColumn">
        <article className="adminPanel">
          <div className="adminPanelTitle"><div><h2>Client data intake</h2><p>Only consented, licensed data should enter training.</p></div></div>
          <div className="importList">
            {data.pipeline.clientIngests.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.language_codes.join(", ")} · {item.unit_count.toLocaleString()} units · {Number(item.audio_hours).toFixed(1)} audio hours</small>
                </div>
                <span>{item.quality_score ?? "not scored"}</span>
                <b className={`reviewState ${item.status}`}>{item.status.replace("_", " ")}</b>
              </article>
            ))}
            {!data.pipeline.clientIngests.length && <div className="emptyState"><strong>No client ingests yet.</strong><span>Client datasets submitted through the API will appear here.</span></div>}
          </div>
        </article>

        <article className="adminPanel">
          <div className="adminPanelTitle"><div><h2>Training jobs</h2><p>GPU trainer and evaluator status for approved data.</p></div></div>
          <div className="importList">
            {data.pipeline.trainingJobs.map((job) => (
              <article key={job.id}>
                <div>
                  <strong>{job.model_type.replaceAll("_", " ")}</strong>
                  <small>{job.language_codes.join(", ")} · {job.training_provider ?? "trainer pending"} · {new Date(job.updated_at).toLocaleString()}</small>
                </div>
                <span>{job.endpoint_url ? "endpoint set" : "no endpoint"}</span>
                <b className={`reviewState ${job.status}`}>{job.status.replace("_", " ")}</b>
              </article>
            ))}
            {!data.pipeline.trainingJobs.length && <div className="emptyState"><strong>No training jobs yet.</strong><span>Accepted ingests create jobs for translation, STT, or TTS.</span></div>}
          </div>
        </article>
      </section>

      <article className="adminPanel">
        <div className="adminPanelTitle"><div><h2>Model releases</h2><p>Client APIs only use published releases with endpoint URLs.</p></div></div>
        <div className="importList">
          {data.pipeline.modelReleases.map((model) => (
            <article key={model.id}>
              <div>
                <strong>{model.name} {model.version}</strong>
                <small>{model.model_type.replaceAll("_", " ")} · {model.language_codes.join(", ")} · quality {model.quality_score}</small>
              </div>
              <span>{model.endpoint_url ? "connected" : "missing endpoint"}</span>
              <b className={`reviewState ${model.status}`}>{model.status}</b>
            </article>
          ))}
          {!data.pipeline.modelReleases.length && <div className="emptyState"><strong>No model releases yet.</strong><span>Published releases appear after evaluation gates pass.</span></div>}
        </div>
      </article>
    </section>
  );
}

function ReadinessPanel({ items }: { items: AdminData["readiness"] }) {
  return (
    <section className="adminPanel">
      <div className="adminPanelTitle">
        <div>
          <h2>Production readiness</h2>
          <p>The remaining work to move Sema from contribution platform to dependable AI language infrastructure.</p>
        </div>
      </div>
      <div className="readinessGrid">
        {items.map((item) => (
          <article key={item.area}>
            <div className="readinessTop">
              <span>{item.area}</span>
              <b className={`reviewState ${item.status}`}>{item.status}</b>
            </div>
            <div className="coverageTrack"><span style={{ width: `${Math.max(item.progress, item.progress ? 4 : 0)}%` }} /></div>
            <strong>{item.progress}%</strong>
            <p>{item.target}</p>
            <small>{item.nextStep}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
