create extension if not exists pgcrypto;

create type contributor_role as enum ('contributor', 'reviewer', 'expert', 'language_lead', 'ops_admin');
create type contribution_status as enum ('draft', 'submitted', 'peer_review', 'expert_review', 'needs_revision', 'approved', 'rejected', 'exported');
create type corpus_source_type as enum ('upload', 'api', 'crawler', 'partner', 'manual');
create type audio_environment as enum ('quiet_room', 'outdoor', 'market', 'vehicle', 'office', 'other');
create type client_service_type as enum ('translation', 'speech_to_text', 'text_to_speech', 'dataset', 'assistant', 'human_review');
create type release_status as enum ('draft', 'training', 'qa', 'evaluation', 'published', 'deprecated');
create type client_subscription_status as enum ('trial', 'active', 'paused', 'cancelled');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  home_language_code text,
  county text,
  reviewer_score numeric(5,2) not null default 0,
  payout_method text not null default 'none' check (payout_method in ('none', 'mpesa', 'airtel_money', 'bank_transfer', 'other')),
  payout_phone text,
  payout_name text,
  payout_notes text,
  payout_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_roles (
  user_id uuid not null references profiles(id) on delete cascade,
  role contributor_role not null,
  language_code text,
  granted_at timestamptz not null default now(),
  primary key (user_id, role, language_code)
);

create table languages (
  code text primary key,
  name text not null,
  family text not null,
  priority text not null check (priority in ('priority', 'seeded', 'endangered')),
  active boolean not null default true
);

create table dialects (
  id uuid primary key default gen_random_uuid(),
  language_code text not null references languages(code),
  name text not null,
  region text,
  notes text,
  unique (language_code, name)
);

create table consent_records (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid not null references profiles(id),
  consent_version text not null,
  allows_training boolean not null default true,
  allows_open_release boolean not null default false,
  signed_at timestamptz not null default now()
);

create table speaker_profiles (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid not null references profiles(id),
  language_code text not null references languages(code),
  dialect_id uuid references dialects(id),
  age_band text,
  gender text,
  region text,
  microphone_type text,
  created_at timestamptz not null default now()
);

create table corpus_imports (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type corpus_source_type not null,
  item_count integer not null default 0,
  status text not null default 'queued',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table corpus_items (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references corpus_imports(id),
  language_code text not null references languages(code),
  source_language_code text references languages(code),
  text text not null,
  domain text not null,
  license text not null,
  source_uri text,
  difficulty text not null,
  metadata jsonb not null default '{}'::jsonb,
  hash text generated always as (encode(digest(lower(trim(text)), 'sha256'), 'hex')) stored,
  status contribution_status not null default 'draft',
  created_at timestamptz not null default now()
);

create unique index corpus_items_language_hash_idx on corpus_items(language_code, hash);
create index corpus_items_queue_idx on corpus_items(language_code, domain, status, difficulty);

create table task_claims (
  id uuid primary key default gen_random_uuid(),
  corpus_item_id uuid not null references corpus_items(id) on delete cascade,
  contributor_id uuid not null references profiles(id) on delete cascade,
  task_type text not null check (task_type in ('translation', 'recording', 'transcription', 'review')),
  status text not null default 'claimed' check (status in ('claimed', 'submitted', 'expired', 'released')),
  claimed_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  unique (corpus_item_id, contributor_id, task_type)
);

create index task_claims_contributor_idx on task_claims(contributor_id, status, expires_at);

create table translations (
  id uuid primary key default gen_random_uuid(),
  corpus_item_id uuid not null references corpus_items(id),
  language_code text not null references languages(code),
  contributor_id uuid references profiles(id),
  text text not null,
  dialect_id uuid references dialects(id),
  status contribution_status not null default 'submitted',
  created_at timestamptz not null default now()
);

create unique index translations_one_active_contributor_idx
on translations(corpus_item_id, language_code, contributor_id)
where status in ('submitted', 'peer_review', 'expert_review', 'approved');

create table recordings (
  id uuid primary key default gen_random_uuid(),
  corpus_item_id uuid not null references corpus_items(id),
  language_code text not null references languages(code),
  contributor_id uuid references profiles(id),
  speaker_profile_id uuid references speaker_profiles(id),
  consent_record_id uuid not null references consent_records(id),
  storage_path text not null,
  duration_ms integer not null,
  sample_rate integer not null,
  device_label text,
  environment audio_environment not null,
  qa jsonb not null default '{}'::jsonb,
  status contribution_status not null default 'submitted',
  created_at timestamptz not null default now()
);

create index recordings_queue_idx on recordings(language_code, status, created_at);
create unique index recordings_storage_path_idx on recordings(storage_path);

create table transcriptions (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references recordings(id),
  contributor_id uuid references profiles(id),
  text text not null,
  status contribution_status not null default 'submitted',
  created_at timestamptz not null default now()
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_id uuid references profiles(id),
  target_type text not null check (target_type in ('corpus_item', 'translation', 'recording', 'transcription')),
  target_id uuid not null,
  state contribution_status not null,
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  reasons text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);

create index reviews_target_idx on reviews(target_type, target_id, created_at);
create unique index reviews_one_per_reviewer_target_idx on reviews(reviewer_id, target_type, target_id);

create table consensus_decisions (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id uuid not null,
  final_state contribution_status not null,
  confidence numeric(5,2) not null,
  decided_by uuid references profiles(id),
  decided_at timestamptz not null default now()
);

create index consensus_target_idx on consensus_decisions(target_type, target_id, decided_at);
create index translations_status_language_idx on translations(status, language_code, created_at);
create index recordings_status_language_idx on recordings(status, language_code, created_at);
create index issue_reports_status_severity_idx on issue_reports(status, severity, created_at);

create table issue_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references profiles(id),
  target_type text not null,
  target_id uuid,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  issue_type text not null,
  description text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table reward_ledger (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid not null references profiles(id),
  contribution_type text not null,
  contribution_id uuid not null,
  points integer not null,
  quality_multiplier numeric(5,2) not null default 1,
  payout_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table missions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null,
  domain text not null,
  language_codes text[] not null default '{}',
  target_items integer not null default 0,
  status text not null default 'active' check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  priority integer not null default 50,
  governance_notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contributor_reputation (
  contributor_id uuid primary key references profiles(id) on delete cascade,
  reputation_score numeric(5,2) not null default 0,
  level text not null default 'New contributor',
  total_contributions integer not null default 0,
  approved_contributions integer not null default 0,
  rejected_contributions integer not null default 0,
  pending_contributions integer not null default 0,
  audio_seconds integer not null default 0,
  review_accuracy numeric(5,2) not null default 0,
  badges text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table language_metrics (
  language_code text primary key references languages(code),
  source_items integer not null default 0,
  translations_total integer not null default 0,
  translations_approved integer not null default 0,
  recordings_total integer not null default 0,
  recordings_approved integer not null default 0,
  audio_seconds integer not null default 0,
  review_decisions integer not null default 0,
  contributor_count integer not null default 0,
  text_coverage numeric(6,2) not null default 0,
  audio_coverage numeric(6,2) not null default 0,
  review_coverage numeric(6,2) not null default 0,
  readiness_score numeric(6,2) not null default 0,
  updated_at timestamptz not null default now()
);

create index missions_status_priority_idx on missions(status, priority, updated_at);
create index contributor_reputation_score_idx on contributor_reputation(reputation_score, updated_at);
create index language_metrics_readiness_idx on language_metrics(readiness_score, updated_at);

create table export_manifests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  language_codes text[] not null,
  domains text[] not null default '{}',
  minimum_review_score numeric(5,2) not null default 90,
  include_audio boolean not null default true,
  item_count integer not null default 0,
  storage_path text,
  status text not null default 'queued',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id),
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table client_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sector text not null,
  billing_email text,
  status text not null default 'trial' check (status in ('trial', 'active', 'paused', 'cancelled')),
  created_at timestamptz not null default now()
);

create table client_users (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references client_organizations(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'developer', 'analyst', 'viewer')),
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table client_api_keys (
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

create table client_services (
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

create table client_service_subscriptions (
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

create table dataset_releases (
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

create table model_releases (
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

create table voice_models (
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

create table client_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references client_organizations(id) on delete cascade,
  api_key_id uuid references client_api_keys(id) on delete set null,
  service_type client_service_type not null,
  units integer not null default 1,
  status text not null check (status in ('success', 'error')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table client_data_ingests (
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

create table training_jobs (
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

create table evaluation_runs (
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

create table alert_events (
  id uuid primary key default gen_random_uuid(),
  severity text not null check (severity in ('info', 'warn', 'critical')),
  source text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index client_usage_org_idx on client_usage_events(organization_id, service_type, created_at);
create index dataset_releases_status_idx on dataset_releases(status, published_at);
create index model_releases_type_status_idx on model_releases(model_type, status, quality_score);
create index client_data_ingests_status_idx on client_data_ingests(status, created_at);
create index training_jobs_status_idx on training_jobs(status, created_at);
create index evaluation_runs_job_idx on evaluation_runs(training_job_id, created_at);
create index alert_events_severity_idx on alert_events(severity, created_at);

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

alter table profiles enable row level security;
alter table user_roles enable row level security;
alter table languages enable row level security;
alter table dialects enable row level security;
alter table consent_records enable row level security;
alter table speaker_profiles enable row level security;
alter table corpus_imports enable row level security;
alter table corpus_items enable row level security;
alter table task_claims enable row level security;
alter table translations enable row level security;
alter table recordings enable row level security;
alter table transcriptions enable row level security;
alter table reviews enable row level security;
alter table consensus_decisions enable row level security;
alter table issue_reports enable row level security;
alter table reward_ledger enable row level security;
alter table missions enable row level security;
alter table contributor_reputation enable row level security;
alter table language_metrics enable row level security;
alter table export_manifests enable row level security;
alter table audit_events enable row level security;
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

create policy "languages are readable" on languages for select using (true);
create policy "dialects are readable" on dialects for select using (true);
create policy "contributors read own profile" on profiles for select using (auth.uid() = id);
create policy "contributors update own profile" on profiles for update using (auth.uid() = id);
create policy "contributors create own profile" on profiles for insert with check (auth.uid() = id);
create policy "contributors read own roles" on user_roles for select using (auth.uid() = user_id);
create policy "active missions readable" on missions for select using (status in ('active', 'completed'));
create policy "contributors read own reputation" on contributor_reputation for select using (auth.uid() = contributor_id);
create policy "language metrics readable" on language_metrics for select using (true);
create policy "contributors read own consent" on consent_records for select using (auth.uid() = contributor_id);
create policy "contributors create own consent" on consent_records for insert with check (auth.uid() = contributor_id);
create policy "contributors read own speaker profiles" on speaker_profiles for select using (auth.uid() = contributor_id);
create policy "contributors create own speaker profiles" on speaker_profiles for insert with check (auth.uid() = contributor_id);
create policy "contributors read approved corpus queue" on corpus_items for select using (status in ('draft', 'needs_revision', 'approved'));
create policy "contributors read own task claims" on task_claims for select using (auth.uid() = contributor_id);
create policy "contributors claim own tasks" on task_claims for insert with check (auth.uid() = contributor_id);
create policy "contributors update own task claims" on task_claims for update using (auth.uid() = contributor_id);
create policy "contributors create translations" on translations for insert with check (auth.uid() = contributor_id);
create policy "contributors create recordings" on recordings for insert with check (auth.uid() = contributor_id);
create policy "contributors create transcriptions" on transcriptions for insert with check (auth.uid() = contributor_id);
create policy "reviewers create reviews" on reviews for insert with check (auth.uid() = reviewer_id);
create policy "contributors create issue reports" on issue_reports for insert with check (auth.uid() = reporter_id);
create policy "contributors read own rewards" on reward_ledger for select using (auth.uid() = contributor_id);
create policy "published client services readable" on client_services for select using (active = true);
create policy "published dataset releases readable" on dataset_releases for select using (status in ('published', 'qa', 'training', 'evaluation'));
create policy "published model releases readable" on model_releases for select using (status in ('published', 'qa', 'training', 'evaluation'));
create policy "published voice models readable" on voice_models for select using (status in ('published', 'qa', 'training', 'evaluation'));
create policy "client users read own org membership" on client_users for select using (auth.uid() = id);
create policy "client users read own org" on client_organizations for select using (
  exists (select 1 from client_users where client_users.organization_id = client_organizations.id and client_users.id = auth.uid())
);
create policy "client users read own subscriptions" on client_service_subscriptions for select using (
  exists (select 1 from client_users where client_users.organization_id = client_service_subscriptions.organization_id and client_users.id = auth.uid())
);
create policy "client users read own data ingests" on client_data_ingests for select using (
  exists (select 1 from client_users where client_users.organization_id = client_data_ingests.organization_id and client_users.id = auth.uid())
);
create policy "client users read own training jobs" on training_jobs for select using (
  exists (select 1 from client_users where client_users.organization_id = training_jobs.organization_id and client_users.id = auth.uid())
);

insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false), ('exports', 'exports', false)
on conflict (id) do nothing;

create policy "contributors upload own recordings"
on storage.objects for insert
with check (
  bucket_id = 'recordings'
  and auth.uid()::text = split_part(name, '/', 2)
);

create policy "contributors read own recordings"
on storage.objects for select
using (
  bucket_id = 'recordings'
  and auth.uid()::text = split_part(name, '/', 2)
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

insert into missions (slug, title, description, domain, language_codes, target_items, status, priority, governance_notes) values
  ('health-access', 'Health access sprint', 'Translate and record urgent clinic, pharmacy, maternal health, and emergency-care language.', 'health', array['sw','sheng','giri','poko'], 500, 'active', 95, 'Prioritize reviewed translations and clear consent for public-service use.'),
  ('agriculture-extension', 'Agriculture extension pack', 'Build farmer-facing vocabulary for crops, weather, pests, markets, and extension support.', 'agriculture', array['sw','kikuyu','kamba','dholuo'], 600, 'active', 85, 'Balance county terminology and avoid one-dialect dominance.'),
  ('public-services', 'Public services access', 'Cover citizen-service tasks like hospitals, IDs, county offices, schools, and help lines.', 'public services', array['sw','sheng','gusii','meru'], 700, 'active', 80, 'Require provenance and reviewer confidence before export.'),
  ('endangered-voices', 'Endangered language preservation', 'Prioritize careful, community-reviewed text and speech for low-resource Kenyan languages.', 'culture', array['yaaku','dahalo','elmolo','aweer'], 300, 'active', 100, 'Community leadership and restricted release by default.')
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  domain = excluded.domain,
  language_codes = excluded.language_codes,
  target_items = excluded.target_items,
  status = excluded.status,
  priority = excluded.priority,
  governance_notes = excluded.governance_notes,
  updated_at = now();
