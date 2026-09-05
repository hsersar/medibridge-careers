create table if not exists public.candidate_saved_jobs (
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (candidate_id, job_id)
);

alter table public.candidate_saved_jobs enable row level security;
create policy "Candidates manage own saved jobs"
  on public.candidate_saved_jobs for all
  using (auth.uid() = candidate_id)
  with check (auth.uid() = candidate_id);
create policy "Staff read saved jobs"
  on public.candidate_saved_jobs for select
  using (public.is_backoffice_user());

alter table public.candidate_documents
  add column if not exists scan_status text not null default 'pending'
    check (scan_status in ('pending','clean','infected','failed')),
  add column if not exists scanned_at timestamptz,
  add column if not exists scan_provider text;

create table if not exists public.app_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  route text not null,
  message text not null,
  stack text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.app_errors enable row level security;
create policy "Users create own error reports"
  on public.app_errors for insert to authenticated
  with check (user_id = auth.uid());
create policy "Staff read error reports"
  on public.app_errors for select
  using (public.is_backoffice_user());

create index if not exists app_errors_created_idx on public.app_errors(created_at desc);
