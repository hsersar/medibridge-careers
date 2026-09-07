create table if not exists public.candidate_saved_jobs (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(candidate_id, job_id)
);

create table if not exists public.candidate_notifications (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.candidate_applications (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  status text not null default 'submitted' check(status in ('submitted','reviewing','interview','offer','accepted','rejected','withdrawn')),
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(candidate_id, job_id)
);

create table if not exists public.candidate_interviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  application_id uuid references public.candidate_applications(id) on delete cascade,
  scheduled_at timestamptz not null,
  meeting_url text,
  status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled')),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.candidate_saved_jobs enable row level security;
alter table public.candidate_notifications enable row level security;
alter table public.candidate_applications enable row level security;
alter table public.candidate_interviews enable row level security;

drop policy if exists "Candidates manage own saved jobs" on public.candidate_saved_jobs;
drop policy if exists "Staff manage saved jobs" on public.candidate_saved_jobs;
drop policy if exists "Staff read saved jobs" on public.candidate_saved_jobs;
drop policy if exists "Candidates read own notifications" on public.candidate_notifications;
drop policy if exists "Candidates update own notifications" on public.candidate_notifications;
drop policy if exists "Staff manage notifications" on public.candidate_notifications;
drop policy if exists "Candidates manage own applications" on public.candidate_applications;
drop policy if exists "Staff manage applications" on public.candidate_applications;
drop policy if exists "Candidates read own interviews" on public.candidate_interviews;
drop policy if exists "Staff manage interviews" on public.candidate_interviews;

create policy "Candidates manage own saved jobs" on public.candidate_saved_jobs for all using(auth.uid()=candidate_id) with check(auth.uid()=candidate_id);
create policy "Staff manage saved jobs" on public.candidate_saved_jobs for all using(public.is_backoffice_user()) with check(public.is_backoffice_user());
create policy "Candidates read own notifications" on public.candidate_notifications for select using(auth.uid()=candidate_id);
create policy "Candidates update own notifications" on public.candidate_notifications for update using(auth.uid()=candidate_id) with check(auth.uid()=candidate_id);
create policy "Staff manage notifications" on public.candidate_notifications for all using(public.is_backoffice_user()) with check(public.is_backoffice_user());
create policy "Candidates manage own applications" on public.candidate_applications for all using(auth.uid()=candidate_id) with check(auth.uid()=candidate_id);
create policy "Staff manage applications" on public.candidate_applications for all using(public.is_backoffice_user()) with check(public.is_backoffice_user());
create policy "Candidates read own interviews" on public.candidate_interviews for select using(auth.uid()=candidate_id);
create policy "Staff manage interviews" on public.candidate_interviews for all using(public.is_backoffice_user()) with check(public.is_backoffice_user());

create index if not exists candidate_notifications_candidate_idx on public.candidate_notifications(candidate_id, created_at desc);
create index if not exists candidate_applications_candidate_idx on public.candidate_applications(candidate_id, updated_at desc);
