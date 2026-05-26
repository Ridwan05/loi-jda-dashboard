-- LOI → JDA Conversion Tracker — Supabase schema
-- Run in Supabase Dashboard › SQL Editor to replicate the database.
-- Safe to re-run: drops existing tables before recreating.

drop table if exists public.issues   cascade;
drop table if exists public.lois     cascade;
drop table if exists public.settings cascade;

-- Legacy tables from prior versions of this app — drop if present.
drop table if exists public.issues_ci           cascade;
drop table if exists public.lois_ci             cascade;
drop table if exists public.settings_ci         cascade;
drop table if exists public.tasks_ci            cascade;
drop table if exists public.deployment_sites_ci cascade;
drop table if exists public.team_members_ci     cascade;
drop table if exists public.activities_ci       cascade;
drop table if exists public.projects_ci         cascade;

-- ─── TABLES ──────────────────────────────────────────────────────────────────

create table public.lois (
  id              bigint primary key,
  developer       text   default '',
  state           text   default '',
  "clusterLead"   text   default '',
  "loiSignedDate" date,
  jda             boolean default false,
  "jdaSignedDate" date,
  notes           text   default '',
  updated_at      timestamptz not null default now()
);

create table public.issues (
  id          bigint primary key,
  "loiId"     bigint references public.lois(id) on delete cascade,
  description text default '',
  owner       text default '',
  raised      date,
  due         date,
  status      text default 'Open'
              check (status in ('Open', 'In Progress', 'Escalated', 'Resolved')),
  updated_at  timestamptz not null default now()
);

create index issues_loi_id_idx on public.issues ("loiId");

-- Singleton key/value table for app-wide settings (e.g. JDA SLA in working days).
create table public.settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

insert into public.settings (key, value) values ('jda_sla_working_days', '30')
on conflict (key) do nothing;

-- ─── TRIGGERS ────────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_lois_updated_at
  before update on public.lois
  for each row execute function public.set_updated_at();

create trigger set_issues_updated_at
  before update on public.issues
  for each row execute function public.set_updated_at();

create trigger set_settings_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────

alter table public.lois     enable row level security;
alter table public.issues   enable row level security;
alter table public.settings enable row level security;

create policy "Allow browser access lois"
  on public.lois for all to anon using (true) with check (true);

create policy "Allow browser access issues"
  on public.issues for all to anon using (true) with check (true);

create policy "Allow browser access settings"
  on public.settings for all to anon using (true) with check (true);
