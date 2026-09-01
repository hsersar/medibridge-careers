create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(), title text not null, region text not null,
  employment_type text not null default 'full_time', salary_text text, german_level text,
  description text not null, support_text text, employer_reference text,
  status text not null default 'draft' check(status in ('draft','published','paused','closed')),
  published_at timestamptz, created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.candidate_job_interests (
  id uuid primary key default gen_random_uuid(), candidate_id uuid not null references public.candidates(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  status text not null default 'expressed' check(status in ('expressed','reviewing','introduced','interview','accepted','declined','withdrawn')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(candidate_id,job_id)
);
create table if not exists public.data_subject_requests (
  id uuid primary key default gen_random_uuid(), candidate_id uuid not null references public.candidates(id) on delete cascade,
  request_type text not null check(request_type in ('access','correction','deletion','withdraw_consent')),
  status text not null default 'received' check(status in ('received','processing','completed','rejected')),
  created_at timestamptz not null default now(), completed_at timestamptz
);
create table if not exists public.pilot_feedback (
  id uuid primary key default gen_random_uuid(), candidate_id uuid references public.candidates(id) on delete set null,
  rating int check(rating between 1 and 5), message text not null, context text,
  created_at timestamptz not null default now()
);
alter table public.jobs enable row level security;alter table public.candidate_job_interests enable row level security;alter table public.data_subject_requests enable row level security;alter table public.pilot_feedback enable row level security;
create policy "Published jobs are visible" on public.jobs for select using(status='published' or public.is_backoffice_user());
create policy "Staff manage jobs" on public.jobs for all using(public.is_backoffice_user()) with check(public.is_backoffice_user());
create policy "Candidates manage own interests" on public.candidate_job_interests for all using(auth.uid()=candidate_id) with check(auth.uid()=candidate_id);
create policy "Staff manage interests" on public.candidate_job_interests for all using(public.is_backoffice_user()) with check(public.is_backoffice_user());
create policy "Candidates create own privacy requests" on public.data_subject_requests for insert with check(auth.uid()=candidate_id);
create policy "Candidates read own privacy requests" on public.data_subject_requests for select using(auth.uid()=candidate_id);
create policy "Staff manage privacy requests" on public.data_subject_requests for all using(public.is_backoffice_user()) with check(public.is_backoffice_user());
create policy "Candidates create pilot feedback" on public.pilot_feedback for insert with check(candidate_id is null or auth.uid()=candidate_id);
create policy "Staff read pilot feedback" on public.pilot_feedback for select using(public.is_backoffice_user());
create index if not exists jobs_status_idx on public.jobs(status,published_at desc);create index if not exists job_interests_job_idx on public.candidate_job_interests(job_id,status);create index if not exists privacy_requests_status_idx on public.data_subject_requests(status,created_at);
