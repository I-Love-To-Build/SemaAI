create extension if not exists pgcrypto;

create type contributor_role as enum ('contributor', 'reviewer', 'expert', 'language_lead', 'ops_admin');
create type contribution_status as enum ('draft', 'submitted', 'peer_review', 'expert_review', 'needs_revision', 'approved', 'rejected', 'exported');
create type corpus_source_type as enum ('upload', 'api', 'crawler', 'partner', 'manual');
create type audio_environment as enum ('quiet_room', 'outdoor', 'market', 'vehicle', 'office', 'other');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  home_language_code text,
  county text,
  reviewer_score numeric(5,2) not null default 0,
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

create table consensus_decisions (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id uuid not null,
  final_state contribution_status not null,
  confidence numeric(5,2) not null,
  decided_by uuid references profiles(id),
  decided_at timestamptz not null default now()
);

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
alter table export_manifests enable row level security;
alter table audit_events enable row level security;

create policy "languages are readable" on languages for select using (true);
create policy "dialects are readable" on dialects for select using (true);
create policy "contributors read own profile" on profiles for select using (auth.uid() = id);
create policy "contributors update own profile" on profiles for update using (auth.uid() = id);
create policy "contributors create own profile" on profiles for insert with check (auth.uid() = id);
create policy "contributors read own roles" on user_roles for select using (auth.uid() = user_id);
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
