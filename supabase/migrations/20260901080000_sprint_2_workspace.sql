alter table public.candidates alter column full_name drop not null;
alter table public.candidates alter column email drop not null;
alter table public.candidates add column if not exists reference_number text unique;
alter table public.candidates add column if not exists verification_note text;
alter table public.candidates add column if not exists last_draft_saved_at timestamptz;

create table if not exists public.candidate_job_preferences (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null unique references public.candidates(id) on delete cascade,
  desired_role text not null default '',
  preferred_region text not null default '',
  possible_start text not null default '',
  workplace text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.candidate_job_preferences enable row level security;
create policy "Candidates manage own job preferences" on public.candidate_job_preferences for all using (auth.uid() = candidate_id) with check (auth.uid() = candidate_id);
