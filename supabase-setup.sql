-- MeshGrid Pipeline Manager relational Supabase setup
-- Run this in Supabase Dashboard > SQL Editor.
--
-- This replaces the earlier JSON-blob table design with row-based tables:
-- projects, team_members, issues, deployment_sites.

drop table if exists public.team cascade;
drop table if exists public.deployment cascade;
drop table if exists public.projects cascade;
drop table if exists public.team_members cascade;
drop table if exists public.issues cascade;
drop table if exists public.deployment_sites cascade;
drop table if exists public.tasks cascade;

create table public.projects (
  id bigint primary key,
  name text not null,
  developer text,
  state text,
  stage text,
  "clusterLead" text,
  rag text,
  size numeric,
  connections integer default 0,
  "pvCapacity" numeric default 0,
  loi boolean default false,
  jda boolean default false,
  credit boolean default false,
  fc boolean default false,
  "startDate" date,
  "targetCompletion" date,
  "actualCompletion" date,
  "subsidyExpected" numeric default 0,
  "capexPerConn" numeric default 0,
  duration integer default 0,
  issue text,
  "lastUpdate" date,
  "targetClose" text,
  "updateCompliance" integer default 100,
  "evidenceCompliance" integer default 100,
  jdacost numeric default 0,
  updated_at timestamptz not null default now()
);

create table public.team_members (
  id bigint primary key,
  name text not null,
  role text,
  assigned integer default 0,
  "tasksDue" integer default 0,     -- auto-maintained: count of Overdue tasks assigned to member
  pendingtasks integer default 0,   -- auto-maintained: count of Pending tasks assigned to member
  completedtasks integer default 0, -- auto-maintained: count of Completed tasks assigned to member
  updated_at timestamptz not null default now()
);

create table public.issues (
  id bigint primary key,
  project text,
  owner text,
  status text,
  due date,
  updated_at timestamptz not null default now()
);

create table public.deployment_sites (
  id bigint primary key,
  sitename text not null,
  project text,
  state text,
  "LGA" text,
  connections integer default 0,
  "PV" numeric default 0,
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id bigint primary key,
  activityname text not null,
  project text,
  projectstage text check (projectstage in ('Preliminary Assessment','Project Preparation','Project Development','Project Finance')),
  vertical text check (vertical in ('Technical','PUE','ESG','Legal','Procurement')),
  "assignedTo" text,
  "startDate" date,
  "dueDate" date,
  status text not null default 'Pending' check (status in ('Pending','In Progress','Completed','Overdue')),
  updated_at timestamptz not null default now()
);

-- Auto-set status to Overdue on insert/update if dueDate has passed and task is not Completed
create or replace function public.set_task_overdue()
returns trigger
language plpgsql
as $$
begin
  if new."dueDate" is not null
     and new."dueDate" < current_date
     and new.status not in ('Completed','Overdue') then
    new.status := 'Overdue';
  end if;
  return new;
end;
$$;

create trigger tasks_auto_overdue
before insert or update on public.tasks
for each row execute function public.set_task_overdue();

-- Daily batch: mark all past-due non-completed tasks as Overdue.
-- Enable pg_cron in Supabase Dashboard → Database → Extensions, then run:
--   select cron.schedule('mark-overdue-tasks','0 0 * * *',
--     $$update public.tasks set status='Overdue'
--       where "dueDate" < current_date and status not in ('Completed','Overdue')$$);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create trigger set_team_members_updated_at
before update on public.team_members
for each row execute function public.set_updated_at();

create trigger set_issues_updated_at
before update on public.issues
for each row execute function public.set_updated_at();

create trigger set_deployment_sites_updated_at
before update on public.deployment_sites
for each row execute function public.set_updated_at();

create trigger set_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

-- Sync task counts on team_members whenever a task is inserted, updated, or deleted
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
    update public.team_members set
      "tasksDue"     = (select count(*) from public.tasks where "assignedTo" = old_name and status = 'Overdue'),
      pendingtasks   = (select count(*) from public.tasks where "assignedTo" = old_name and status = 'Pending'),
      completedtasks = (select count(*) from public.tasks where "assignedTo" = old_name and status = 'Completed')
    where name = old_name;
  end if;

  if new_name is not null then
    update public.team_members set
      "tasksDue"     = (select count(*) from public.tasks where "assignedTo" = new_name and status = 'Overdue'),
      pendingtasks   = (select count(*) from public.tasks where "assignedTo" = new_name and status = 'Pending'),
      completedtasks = (select count(*) from public.tasks where "assignedTo" = new_name and status = 'Completed')
    where name = new_name;
  end if;

  return null;
end;
$$;

create trigger tasks_sync_member_counts
after insert or update or delete on public.tasks
for each row execute function public.sync_member_task_counts();

alter table public.projects enable row level security;
alter table public.team_members enable row level security;
alter table public.issues enable row level security;
alter table public.deployment_sites enable row level security;
alter table public.tasks enable row level security;

create policy "Allow browser access projects"
on public.projects for all
to anon
using (true)
with check (true);

create policy "Allow browser access team_members"
on public.team_members for all
to anon
using (true)
with check (true);

create policy "Allow browser access issues"
on public.issues for all
to anon
using (true)
with check (true);

create policy "Allow browser access deployment_sites"
on public.deployment_sites for all
to anon
using (true)
with check (true);

create policy "Allow browser access tasks"
on public.tasks for all
to anon
using (true)
with check (true);

insert into public.projects (id, name, developer, state, stage, "clusterLead", rag, size) values
  (1, 'Kwali Cluster MeshGrid', 'SolarNG Ltd', 'FCT', 'Project Development', 'Amaka O.', 'Green', 12.8),
  (2, 'Bwari Rural MeshGrid', 'GreenPower NG', 'FCT', 'Project Preparation', 'Emeka T.', 'Amber', 8.4),
  (3, 'Kuje East MeshGrid', 'Volts Africa', 'FCT', 'Project Preparation', 'Fatima K.', 'Red', 9.6),
  (4, 'Nasarawa South MeshGrid', 'EnergyCo NG', 'Nasarawa', 'Preliminary Assessment', 'Amaka O.', 'Green', 7.7),
  (5, 'Ogun West MeshGrid', 'BrightGrid Ltd', 'Ogun', 'Preliminary Assessment', 'Uche B.', 'Green', 24.8);

insert into public.team_members (id, name, role, assigned, "tasksDue") values
  (1, 'Amaka O.', 'Cluster Lead', 2, 5),
  (2, 'Emeka T.', 'Cluster Lead', 1, 3),
  (3, 'Fatima K.', 'Cluster Lead', 1, 4),
  (4, 'Uche B.', 'Technical Analyst', 1, 6),
  (5, 'Ngozi P.', 'Commercial Analyst', 2, 4);

insert into public.issues (id, project, owner, status, due) values
  (1, 'Bwari Rural MeshGrid', 'Emeka T.', 'Open', '2026-05-10'),
  (2, 'Kuje East MeshGrid', 'Fatima K.', 'Escalated', '2026-05-05'),
  (3, 'Kwali Cluster MeshGrid', 'Amaka O.', 'Open', '2026-05-12');

insert into public.deployment_sites (id, sitename, project, state, "LGA", connections, "PV") values
  (1, 'Kwali North', 'Kwali Cluster MeshGrid', 'FCT', 'Kwali', 140, 42),
  (2, 'Kwali South', 'Kwali Cluster MeshGrid', 'FCT', 'Gwagwalada', 180, 54),
  (3, 'Bwari East', 'Bwari Rural MeshGrid', 'FCT', 'Bwari', 80, 24);

-- ─── MIGRATION (tasks): run this block on an existing database to add the tasks table ───
-- create table if not exists public.tasks (
--   id bigint primary key,
--   activityname text not null,
--   project text,
--   projectstage text check (projectstage in ('Preliminary Assessment','Project Preparation','Project Development','Project Finance')),
--   vertical text check (vertical in ('Technical','PUE','ESG','Legal','Procurement')),
--   "assignedTo" text,
--   "startDate" date,
--   "dueDate" date,
--   status text not null default 'Pending' check (status in ('Pending','In Progress','Completed','Overdue')),
--   updated_at timestamptz not null default now()
-- );
-- create or replace function public.set_task_overdue() returns trigger language plpgsql as $$
-- begin
--   if new."dueDate" is not null and new."dueDate" < current_date and new.status not in ('Completed','Overdue') then
--     new.status := 'Overdue';
--   end if;
--   return new;
-- end;
-- $$;
-- create trigger tasks_auto_overdue before insert or update on public.tasks for each row execute function public.set_task_overdue();
-- create trigger set_tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();
-- alter table public.tasks enable row level security;
-- create policy "Allow browser access tasks" on public.tasks for all to anon using (true) with check (true);

-- ─── MIGRATION: run this block on existing databases instead of the full script ─
-- alter table public.projects add column if not exists connections integer default 0;
-- alter table public.projects add column if not exists "pvCapacity" numeric default 0;
-- alter table public.projects add column if not exists loi boolean default false;
-- alter table public.projects add column if not exists jda boolean default false;
-- alter table public.projects add column if not exists credit boolean default false;
-- alter table public.projects add column if not exists fc boolean default false;
-- alter table public.projects add column if not exists "startDate" date;
-- alter table public.projects add column if not exists "targetCompletion" date;
-- alter table public.projects add column if not exists "actualCompletion" date;
-- alter table public.projects add column if not exists "subsidyExpected" numeric default 0;
-- alter table public.projects add column if not exists "capexPerConn" numeric default 0;
-- alter table public.projects add column if not exists duration integer default 0;
-- alter table public.projects add column if not exists issue text;
-- alter table public.projects add column if not exists "lastUpdate" date;
-- alter table public.projects add column if not exists "targetClose" text;
-- alter table public.projects add column if not exists "updateCompliance" integer default 100;
-- alter table public.projects add column if not exists "evidenceCompliance" integer default 100;
-- alter table public.projects drop column if exists "connectionsInstalled";
-- alter table public.projects drop column if exists "dailyRate";
-- alter table public.projects drop column if exists arpu;
-- alter table public.projects drop column if exists "subsidyReceived";
-- alter table public.projects drop column if exists owner;
-- alter table public.projects drop column if exists opex;
-- alter table public.projects drop column if exists "timeToFirstPower";
-- alter table public.projects rename column "stageStart" to "startDate";
