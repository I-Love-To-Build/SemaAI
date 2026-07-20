import { LANGUAGES } from "@/lib/languages";
import { getClientCatalog } from "@/lib/client-platform";

const clientSegments = [
  "Hospitals and clinics",
  "Banks and fintech",
  "Government services",
  "Telcos and contact centers",
  "Schools and edtech",
  "Media and creators"
];

const pipeline = [
  "Contribute",
  "Verify",
  "Train",
  "Evaluate",
  "Publish",
  "Use"
];

export default async function ClientPlatformPage() {
  const catalog = await getClientCatalog();
  const priorityLanguages = LANGUAGES.filter((language) => language.priority === "priority").slice(0, 12);

  return (
    <main className="clientConsole">
      <section className="clientHero">
        <nav className="clientNav">
          <img src="/sema-ai-brand.png" alt="Sema AI" />
          <div>
            <a href="/">Contributor portal</a>
            <a href="/admin">Admin</a>
          </div>
        </nav>
        <div className="clientHeroGrid">
          <div>
            <p className="eyebrow">Client AI services console</p>
            <h1>Put trained Kenyan language intelligence to work.</h1>
            <p>
              Access approved datasets, AI voices, translation, transcription, and language services after community
              contribution, review, training, and release.
            </p>
            <span className="clientDataSource">{catalog.source === "database" ? "Connected to release registry" : "Using fallback release catalog until database migration is applied"}</span>
            <div className="clientHeroActions">
              <a className="primaryButton" href="#services">Explore services</a>
              <a className="ghostButton" href="#datasets">View data releases</a>
            </div>
          </div>
          <aside className="clientSignalPanel">
            <span>Live release pipeline</span>
            {pipeline.map((step, index) => (
              <div key={step}>
                <strong>{step}</strong>
                <small>{index < 4 ? "Quality controlled" : index === 4 ? "Approved assets" : "Client endpoints"}</small>
              </div>
            ))}
          </aside>
        </div>
      </section>

      <section className="clientBand">
        {clientSegments.map((segment) => (
          <span key={segment}>{segment}</span>
        ))}
      </section>

      <section className="clientSection" id="services">
        <div className="clientSectionHeader">
          <div>
            <p className="eyebrow">Services</p>
            <h2>Everything clients need after training.</h2>
          </div>
          <p>Each service is fed by approved contributor data, review decisions, audio QA, model evaluation, and export manifests.</p>
        </div>
        <div className="clientServiceGrid">
          {catalog.services.map((service) => (
            <article key={service.slug}>
              <div>
                <span>{service.status}</span>
                <strong>{service.metric}</strong>
              </div>
              <h3>{service.title}</h3>
              <p>{service.description}</p>
              <button type="button">Configure</button>
            </article>
          ))}
        </div>
      </section>

      <section className="clientTwoColumn">
        <div className="clientSection" id="datasets">
          <div className="clientSectionHeader compact">
            <div>
              <p className="eyebrow">Datasets</p>
              <h2>Approved releases.</h2>
            </div>
          </div>
          <div className="datasetList">
            {catalog.datasets.map((dataset) => (
              <article key={dataset.slug}>
                <div>
                  <strong>{dataset.name}</strong>
                  <small>{dataset.domains.join(", ")} - {dataset.language_codes.join(", ")}</small>
                </div>
                <span>{dataset.unit_count.toLocaleString()}</span>
                <b>{dataset.version}</b>
              </article>
            ))}
          </div>
        </div>

        <div className="clientSection">
          <div className="clientSectionHeader compact">
            <div>
              <p className="eyebrow">AI voices</p>
              <h2>Voice models.</h2>
            </div>
          </div>
          <div className="voiceList">
            {catalog.voices.map((voice) => (
              <article key={voice.slug}>
                <div>
                  <strong>{voice.display_name}</strong>
                  <small>{voice.language_code} - {voice.tone}</small>
                </div>
                <span><i style={{ width: `${voice.readiness_score}%` }} /></span>
                <b>{voice.readiness_score}%</b>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="clientSection">
        <div className="clientSectionHeader">
          <div>
            <p className="eyebrow">Language coverage</p>
            <h2>Built for Kenya first.</h2>
          </div>
          <p>Clients choose language packs by region, audience, channel, risk, and service domain.</p>
        </div>
        <div className="clientLanguageGrid">
          {priorityLanguages.map((language) => (
            <article key={language.code}>
              <strong>{language.name}</strong>
              <span>{language.family}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="clientApiPanel">
        <div>
          <p className="eyebrow">Developer access</p>
          <h2>One API surface for language intelligence.</h2>
          <p>Clients integrate translation, transcription, voice synthesis, review escalation, and dataset release metadata.</p>
        </div>
        <pre>{`POST /v1/translate
{
  "source": "en",
  "target": "sw",
  "domain": "health",
  "text": "Where is the nearest clinic?"
}`}</pre>
      </section>
    </main>
  );
}
