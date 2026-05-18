-- C&I Pipeline Manager — Supabase schema
-- Run in Supabase Dashboard › SQL Editor to replicate the database.
-- Safe to re-run: drops existing tables before recreating.

drop table if exists public.tasks_ci            cascade;
drop table if exists public.deployment_sites_ci cascade;
drop table if exists public.issues_ci           cascade;
drop table if exists public.team_members_ci     cascade;
drop table if exists public.projects_ci         cascade;
drop table if exists public.activities_ci       cascade;

-- ─── TABLES ──────────────────────────────────────────────────────────────────

create table public.projects_ci (
  id                 bigint  primary key,
  name               text    not null,
  developer          text,
  state              text,
  stage              text,
  "clusterLead"      text,
  rag                text,
  size               numeric,
  updated_at         timestamptz not null default now(),
  loi                boolean default false,
  jda                boolean default false,
  credit             boolean default false,
  fc                 boolean default false,
  "startDate"        text default '',
  "targetCompletion" text default '',
  "actualCompletion" text default '',
  "subsidyExpected"  bigint  default 0,
  "capexPerConn"     integer default 0,
  issue              text default '',
  "lastUpdate"       text default '',
  "targetClose"      text default '',
  "updateCompliance" integer default 100,
  "evidenceCompliance" integer default 100,
  "pvCapacity"       numeric default 0,
  duration           integer default 0,
  jdacost            smallint
);

create table public.team_members_ci (
  id             bigint  primary key,
  name           text    not null,
  role           text,
  assigned       integer default 0,
  "tasksDue"     integer default 0,
  updated_at     timestamptz not null default now(),
  pendingtasks   integer default 0,
  completedtasks integer default 0
);

create table public.issues_ci (
  id          bigint primary key,
  project     text,
  category    text default 'Other',
  description text default '',
  owner       text,
  raised      date,
  due         date,
  status      text default 'Open',
  rag         text default 'Amber',
  updated_at  timestamptz not null default now()
);

create table public.deployment_sites_ci (
  id          bigint primary key,
  sitename    text   not null,
  project     text,
  updated_at  timestamptz not null default now(),
  state       text,
  "LGA"       text,
  "PV"        numeric default 0
);

create table public.tasks_ci (
  id           bigint primary key,
  activityname text   not null,
  project      text,
  projectstage text   check (projectstage in (
                 'Preliminary Assessment',
                 'Project Preparation',
                 'Project Development',
                 'Project Finance'
               )),
  vertical     text   check (vertical in (
                 'Technical', 'PUE', 'ESG', 'Legal', 'Procurement'
               )),
  "assignedTo" text,
  "startDate"  date,
  "dueDate"    date,
  status       text   not null default 'Pending'
               check (status in ('Pending', 'In Progress', 'Completed', 'Overdue')),
  updated_at   timestamptz not null default now()
);

create table public.activities_ci (
  id               bigint  primary key,
  activityname     text    not null,
  projectstage     text,
  activitycategory text,
  updated_at       timestamptz not null default now()
);

-- ─── FUNCTIONS & TRIGGERS ────────────────────────────────────────────────────

-- Stamp updated_at on every row update
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_projects_ci_updated_at
  before update on public.projects_ci
  for each row execute function public.set_updated_at();

create trigger set_team_members_ci_updated_at
  before update on public.team_members_ci
  for each row execute function public.set_updated_at();

create trigger set_issues_ci_updated_at
  before update on public.issues_ci
  for each row execute function public.set_updated_at();

create trigger set_deployment_sites_ci_updated_at
  before update on public.deployment_sites_ci
  for each row execute function public.set_updated_at();

create trigger set_tasks_ci_updated_at
  before update on public.tasks_ci
  for each row execute function public.set_updated_at();

create trigger set_activities_ci_updated_at
  before update on public.activities_ci
  for each row execute function public.set_updated_at();

-- Auto-mark tasks as Overdue when dueDate has passed and task is not Completed
create or replace function public.set_task_overdue()
returns trigger language plpgsql as $$
begin
  if new."dueDate" is not null
     and new."dueDate" < current_date
     and new.status not in ('Completed', 'Overdue') then
    new.status := 'Overdue';
  end if;
  return new;
end;
$$;

create trigger tasks_ci_auto_overdue
  before insert or update on public.tasks_ci
  for each row execute function public.set_task_overdue();

-- Keep tasksDue / pendingtasks / completedtasks on team_members_ci in sync
-- with the tasks_ci table on every insert, update, or delete
create or replace function public.sync_member_task_counts()
returns trigger language plpgsql as $$
declare
  old_name text;
  new_name text;
begin
  if tg_op = 'DELETE' then
    old_name := old."assignedTo";
  elsif tg_op = 'INSERT' then
    new_name := new."assignedTo";
  else
    old_name := old."assignedTo";
    new_name := new."assignedTo";
  end if;

  if old_name is not null and (tg_op = 'DELETE' or old_name is distinct from new_name) then
    update public.team_members_ci set
      "tasksDue"     = (select count(*) from public.tasks_ci where "assignedTo" = old_name and status = 'Overdue'),
      pendingtasks   = (select count(*) from public.tasks_ci where "assignedTo" = old_name and status = 'Pending'),
      completedtasks = (select count(*) from public.tasks_ci where "assignedTo" = old_name and status = 'Completed')
    where name = old_name;
  end if;

  if new_name is not null then
    update public.team_members_ci set
      "tasksDue"     = (select count(*) from public.tasks_ci where "assignedTo" = new_name and status = 'Overdue'),
      pendingtasks   = (select count(*) from public.tasks_ci where "assignedTo" = new_name and status = 'Pending'),
      completedtasks = (select count(*) from public.tasks_ci where "assignedTo" = new_name and status = 'Completed')
    where name = new_name;
  end if;

  return null;
end;
$$;

create trigger tasks_ci_sync_member_counts
  after insert or update or delete on public.tasks_ci
  for each row execute function public.sync_member_task_counts();

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────

alter table public.projects_ci          enable row level security;
alter table public.team_members_ci      enable row level security;
alter table public.issues_ci            enable row level security;
alter table public.deployment_sites_ci  enable row level security;
alter table public.tasks_ci             enable row level security;
alter table public.activities_ci        enable row level security;

create policy "Allow browser access projects_ci"
  on public.projects_ci for all to anon using (true) with check (true);

create policy "Allow browser access team_members_ci"
  on public.team_members_ci for all to anon using (true) with check (true);

create policy "Allow browser access issues_ci"
  on public.issues_ci for all to anon using (true) with check (true);

create policy "Allow browser access deployment_sites_ci"
  on public.deployment_sites_ci for all to anon using (true) with check (true);

create policy "Allow browser access tasks_ci"
  on public.tasks_ci for all to anon using (true) with check (true);

create policy "Allow browser access activities_ci"
  on public.activities_ci for all to anon using (true) with check (true);

-- ─── OPTIONAL: enable daily cron to catch any tasks missed by the trigger ─────
Enable pg_cron in Dashboard → Database → Extensions, then run:
select cron.schedule('mark-overdue-tasks', '0 0 * * *',
$$update public.tasks_ci set status = 'Overdue'
where "dueDate" < current_date
and status not in ('Completed', 'Overdue')$$);
