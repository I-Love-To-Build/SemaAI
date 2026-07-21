alter table profiles
  add column if not exists payout_method text not null default 'none',
  add column if not exists payout_phone text,
  add column if not exists payout_name text,
  add column if not exists payout_notes text,
  add column if not exists payout_opt_in boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_payout_method_check'
  ) then
    alter table profiles
      add constraint profiles_payout_method_check
      check (payout_method in ('none', 'mpesa', 'airtel_money', 'bank_transfer', 'other'));
  end if;
end $$;

create table if not exists missions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null,
  domain text not null,
  language_codes text[] not null default '{}',
  target_items integer not null default 100,
  status text not null default 'active' check (status in ('draft', 'active', 'paused', 'completed', 'archived')),
  priority integer not null default 50,
  governance_notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists contributor_reputation (
  contributor_id uuid primary key references profiles(id) on delete cascade,
  reputation_score integer not null default 0 check (reputation_score >= 0 and reputation_score <= 100),
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

create table if not exists language_metrics (
  language_code text primary key references languages(code) on delete cascade,
  source_items integer not null default 0,
  translations_total integer not null default 0,
  translations_approved integer not null default 0,
  recordings_total integer not null default 0,
  recordings_approved integer not null default 0,
  audio_seconds integer not null default 0,
  review_decisions integer not null default 0,
  contributor_count integer not null default 0,
  text_coverage numeric(5,2) not null default 0,
  audio_coverage numeric(5,2) not null default 0,
  review_coverage numeric(5,2) not null default 0,
  readiness_score integer not null default 0 check (readiness_score >= 0 and readiness_score <= 100),
  updated_at timestamptz not null default now()
);

create index if not exists missions_status_priority_idx on missions(status, priority, updated_at);
create index if not exists contributor_reputation_score_idx on contributor_reputation(reputation_score, updated_at);
create index if not exists language_metrics_readiness_idx on language_metrics(readiness_score, updated_at);

alter table missions enable row level security;
alter table contributor_reputation enable row level security;
alter table language_metrics enable row level security;

drop policy if exists "active missions readable" on missions;
create policy "active missions readable" on missions for select using (status in ('active', 'completed'));

drop policy if exists "contributors read own reputation" on contributor_reputation;
create policy "contributors read own reputation" on contributor_reputation for select using (auth.uid() = contributor_id);

drop policy if exists "language metrics readable" on language_metrics;
create policy "language metrics readable" on language_metrics for select using (true);

insert into missions (slug, title, description, domain, language_codes, target_items, status, priority, governance_notes) values
  ('health-access', 'Health access sprint', 'Translate and record urgent clinic, pharmacy, maternal health, and emergency-care language.', 'health', array['sw','sheng','giri','poko'], 500, 'active', 95, 'Requires careful medical meaning review before export.'),
  ('agriculture-extension', 'Agriculture extension pack', 'Build farmer-facing vocabulary for crops, weather, pests, markets, and extension support.', 'agriculture', array['sw','kikuyu','kamba','dholuo'], 600, 'active', 90, 'Prioritize natural field language and county extension terminology.'),
  ('public-services', 'Public services access', 'Cover citizen-service tasks like hospitals, IDs, county offices, schools, and help lines.', 'public services', array['sw','sheng','gusii','meru'], 700, 'active', 85, 'Must keep names, locations, dates, and numbers accurate.'),
  ('endangered-voices', 'Endangered language preservation', 'Prioritize careful, community-reviewed text and speech for low-resource Kenyan languages.', 'culture', array['yaaku','dahalo','elmolo','aweer'], 300, 'active', 100, 'Community governance and consent must be confirmed before broad release.')
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
