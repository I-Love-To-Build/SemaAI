do $$
begin
  create type client_service_type as enum ('translation', 'speech_to_text', 'text_to_speech', 'dataset', 'assistant', 'human_review');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type release_status as enum ('draft', 'training', 'qa', 'evaluation', 'published', 'deprecated');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type client_subscription_status as enum ('trial', 'active', 'paused', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists client_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sector text not null,
  billing_email text,
  status text not null default 'trial' check (status in ('trial', 'active', 'paused', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists client_users (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references client_organizations(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'developer', 'analyst', 'viewer')),
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table if not exists client_api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references client_organizations(id) on delete cascade,
  name text not null,
  key_hash text not null unique,
  prefix text not null,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'revoked')),
  expires_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists client_services (
  slug text primary key,
  title text not null,
  description text not null,
  service_type client_service_type not null,
  status text not null,
  metric text not null,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists client_service_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references client_organizations(id) on delete cascade,
  service_type client_service_type not null,
  plan text not null,
  status client_subscription_status not null default 'trial',
  monthly_quota integer,
  used_this_month integer not null default 0,
  resets_at timestamptz not null default date_trunc('month', now()) + interval '1 month',
  created_at timestamptz not null default now(),
  unique (organization_id, service_type)
);

create table if not exists dataset_releases (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  version text not null,
  language_codes text[] not null,
  domains text[] not null default '{}',
  unit_count integer not null default 0,
  audio_hours numeric(10,2) not null default 0,
  status release_status not null default 'draft',
  license text not null,
  manifest_id uuid references export_manifests(id),
  storage_path text,
  provenance jsonb not null default '{}'::jsonb,
  evaluation jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists model_releases (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  model_type client_service_type not null,
  version text not null,
  language_codes text[] not null,
  domains text[] not null default '{}',
  dataset_release_ids uuid[] not null default '{}',
  quality_score numeric(5,2) not null default 0,
  status release_status not null default 'training',
  endpoint_url text,
  evaluation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists voice_models (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  language_code text not null references languages(code),
  tone text not null,
  speaker_count integer not null default 0,
  audio_hours numeric(10,2) not null default 0,
  readiness_score integer not null default 0 check (readiness_score >= 0 and readiness_score <= 100),
  status release_status not null default 'training',
  sample_storage_path text,
  created_at timestamptz not null default now()
);

create table if not exists client_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references client_organizations(id) on delete cascade,
  api_key_id uuid references client_api_keys(id) on delete set null,
  service_type client_service_type not null,
  units integer not null default 1,
  status text not null check (status in ('success', 'error')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists client_data_ingests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references client_organizations(id) on delete cascade,
  name text not null,
  source_type text not null check (source_type in ('upload', 'api', 'storage', 'partner')),
  storage_path text,
  language_codes text[] not null,
  domains text[] not null default '{}',
  unit_count integer not null default 0,
  audio_hours numeric(10,2) not null default 0,
  consent jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'validating', 'rejected', 'accepted', 'training_queued', 'completed')),
  quality_score numeric(5,2),
  rejection_reasons text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists training_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references client_organizations(id) on delete set null,
  ingest_id uuid references client_data_ingests(id) on delete set null,
  dataset_release_id uuid references dataset_releases(id) on delete set null,
  model_type client_service_type not null,
  language_codes text[] not null,
  domains text[] not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'sent_to_trainer', 'training', 'evaluation_queued', 'evaluation_failed', 'evaluation_passed', 'published', 'failed')),
  training_provider text,
  external_job_id text,
  endpoint_url text,
  metrics jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  training_job_id uuid not null references training_jobs(id) on delete cascade,
  model_type client_service_type not null,
  language_codes text[] not null,
  domains text[] not null default '{}',
  score numeric(5,2) not null default 0,
  passed boolean not null default false,
  thresholds jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  report text,
  created_at timestamptz not null default now()
);

create table if not exists alert_events (
  id uuid primary key default gen_random_uuid(),
  severity text not null check (severity in ('info', 'warn', 'critical')),
  source text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists client_usage_org_idx on client_usage_events(organization_id, service_type, created_at);
create index if not exists dataset_releases_status_idx on dataset_releases(status, published_at);
create index if not exists model_releases_type_status_idx on model_releases(model_type, status, quality_score);
create index if not exists client_data_ingests_status_idx on client_data_ingests(status, created_at);
create index if not exists training_jobs_status_idx on training_jobs(status, created_at);
create index if not exists evaluation_runs_job_idx on evaluation_runs(training_job_id, created_at);
create index if not exists alert_events_severity_idx on alert_events(severity, created_at);

create or replace function increment_client_subscription_usage(
  target_org_id uuid,
  target_service_type client_service_type,
  increment_by integer
)
returns void
language sql
security definer
as $$
  update client_service_subscriptions
  set used_this_month = used_this_month + greatest(increment_by, 0)
  where organization_id = target_org_id
    and service_type = target_service_type
    and status in ('trial', 'active');
$$;

alter table client_organizations enable row level security;
alter table client_users enable row level security;
alter table client_api_keys enable row level security;
alter table client_services enable row level security;
alter table client_service_subscriptions enable row level security;
alter table dataset_releases enable row level security;
alter table model_releases enable row level security;
alter table voice_models enable row level security;
alter table client_usage_events enable row level security;
alter table client_data_ingests enable row level security;
alter table training_jobs enable row level security;
alter table evaluation_runs enable row level security;
alter table alert_events enable row level security;

drop policy if exists "published client services readable" on client_services;
create policy "published client services readable" on client_services for select using (active = true);

drop policy if exists "published dataset releases readable" on dataset_releases;
create policy "published dataset releases readable" on dataset_releases for select using (status in ('published', 'qa', 'training', 'evaluation'));

drop policy if exists "published model releases readable" on model_releases;
create policy "published model releases readable" on model_releases for select using (status in ('published', 'qa', 'training', 'evaluation'));

drop policy if exists "published voice models readable" on voice_models;
create policy "published voice models readable" on voice_models for select using (status in ('published', 'qa', 'training', 'evaluation'));

drop policy if exists "client users read own org membership" on client_users;
create policy "client users read own org membership" on client_users for select using (auth.uid() = id);

drop policy if exists "client users read own org" on client_organizations;
create policy "client users read own org" on client_organizations for select using (
  exists (select 1 from client_users where client_users.organization_id = client_organizations.id and client_users.id = auth.uid())
);

drop policy if exists "client users read own subscriptions" on client_service_subscriptions;
create policy "client users read own subscriptions" on client_service_subscriptions for select using (
  exists (select 1 from client_users where client_users.organization_id = client_service_subscriptions.organization_id and client_users.id = auth.uid())
);

drop policy if exists "client users read own data ingests" on client_data_ingests;
create policy "client users read own data ingests" on client_data_ingests for select using (
  exists (select 1 from client_users where client_users.organization_id = client_data_ingests.organization_id and client_users.id = auth.uid())
);

drop policy if exists "client users read own training jobs" on training_jobs;
create policy "client users read own training jobs" on training_jobs for select using (
  exists (select 1 from client_users where client_users.organization_id = training_jobs.organization_id and client_users.id = auth.uid())
);

insert into client_services (slug, title, description, service_type, status, metric, sort_order) values
  ('translation-api', 'Translation API', 'Real-time English, Kiswahili, and Kenyan-language translation backed by reviewed community data.', 'translation', 'API ready', '68 languages', 10),
  ('speech-to-text', 'Speech-to-text', 'Transcribe approved Kenyan language audio for support calls, field reports, clinics, and research.', 'speech_to_text', 'Training', 'QA gated', 20),
  ('text-to-speech', 'Text-to-speech voices', 'Natural AI voices for local language IVR, accessibility, learning content, and public messages.', 'text_to_speech', 'Voice bank', 'Multi-speaker', 30),
  ('dataset-licensing', 'Dataset licensing', 'Approved train/dev/test splits with consent, provenance, review history, and export manifests.', 'dataset', 'Exportable', 'Versioned', 40),
  ('language-assistant', 'Language assistant', 'Deploy a client-specific assistant that understands local terms, tone, and service workflows.', 'assistant', 'Private model', 'RAG + voice', 50),
  ('human-review', 'Human review network', 'Route difficult translations, audio, and dialect variants to verified language reviewers.', 'human_review', 'Managed QA', 'Consensus', 60)
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  service_type = excluded.service_type,
  status = excluded.status,
  metric = excluded.metric,
  active = true,
  sort_order = excluded.sort_order;

insert into dataset_releases (slug, name, version, language_codes, domains, unit_count, audio_hours, status, license, provenance, evaluation, published_at) values
  ('everyday-vocabulary-v0-7', 'Everyday vocabulary', 'v0.7', array['en','sw','sheng','kikuyu','dholuo'], array['everyday conversation'], 69423, 0, 'published', 'Commercial evaluation', '{"source":"Kaikki/Wiktionary + Sema reviewed corpus"}', '{"review":"mixed seed and imported corpus"}', now()),
  ('health-access-v0-4', 'Health access pack', 'v0.4', array['en','sw','giri','poko','meru'], array['health'], 12800, 0, 'qa', 'Restricted client pilot', '{"source":"Sema contributor pipeline"}', '{"minimum_review_score":90}', null),
  ('public-services-v0-5', 'Public services pack', 'v0.5', array['en','sw','sheng'], array['public services'], 18200, 0, 'qa', 'Restricted client pilot', '{"source":"Sema contributor pipeline"}', '{"minimum_review_score":90}', null),
  ('voice-seed-bank', 'Voice seed bank', 'QA gated', array['sw','sheng','giri','gusii','maasai'], array['voice'], 2400000, 0, 'training', 'Consent gated', '{"source":"Sema prompted recording queue"}', '{"audio_qa":"required"}', null)
on conflict (slug) do update set
  name = excluded.name,
  version = excluded.version,
  language_codes = excluded.language_codes,
  domains = excluded.domains,
  unit_count = excluded.unit_count,
  audio_hours = excluded.audio_hours,
  status = excluded.status,
  license = excluded.license,
  provenance = excluded.provenance,
  evaluation = excluded.evaluation,
  published_at = excluded.published_at;

insert into model_releases (slug, name, model_type, version, language_codes, domains, quality_score, status, evaluation) values
  ('sema-translate-ke-v0-1', 'Sema Translate KE', 'translation', 'v0.1', array['en','sw'], array['health','everyday conversation'], 78, 'evaluation', '{"bleu":"pending","human_eval":"pilot"}'),
  ('sema-stt-ke-v0-1', 'Sema Speech KE', 'speech_to_text', 'v0.1', array['sw'], array['everyday conversation'], 62, 'training', '{"wer":"pending","audio_qa":"required"}')
on conflict (slug) do update set
  name = excluded.name,
  model_type = excluded.model_type,
  version = excluded.version,
  language_codes = excluded.language_codes,
  domains = excluded.domains,
  quality_score = excluded.quality_score,
  status = excluded.status,
  evaluation = excluded.evaluation;

insert into voice_models (slug, display_name, language_code, tone, speaker_count, audio_hours, readiness_score, status) values
  ('nia-sw', 'Nia', 'sw', 'Warm public-service voice', 24, 18.5, 92, 'qa'),
  ('amani-sheng', 'Amani', 'sheng', 'Youth support and commerce', 18, 9.2, 74, 'training'),
  ('moraa-gusii', 'Moraa', 'gusii', 'Health and education narration', 11, 7.1, 68, 'training'),
  ('lemayan-maa', 'Lemayan', 'maasai', 'Community announcements', 8, 4.8, 61, 'training')
on conflict (slug) do update set
  display_name = excluded.display_name,
  language_code = excluded.language_code,
  tone = excluded.tone,
  speaker_count = excluded.speaker_count,
  audio_hours = excluded.audio_hours,
  readiness_score = excluded.readiness_score,
  status = excluded.status;
