create table if not exists public.backoffice_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'reviewer' check (role in ('admin','reviewer')),
  created_at timestamptz not null default now()
);

create or replace function public.is_backoffice_user()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.backoffice_users where user_id = auth.uid()) $$;

create table if not exists public.candidate_internal_notes (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  note text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.candidate_status_history (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  changed_by uuid not null references auth.users(id),
  previous_status text,
  new_status text not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.candidate_emails (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  recipient text not null,
  subject text not null,
  body text not null,
  status text not null default 'prepared' check (status in ('prepared','sent','failed')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.backoffice_users enable row level security;
alter table public.candidate_internal_notes enable row level security;
alter table public.candidate_status_history enable row level security;
alter table public.candidate_emails enable row level security;

create policy "Staff read own membership" on public.backoffice_users for select using (user_id = auth.uid());
create policy "Staff read candidates" on public.candidates for select using (public.is_backoffice_user());
create policy "Staff update candidates" on public.candidates for update using (public.is_backoffice_user()) with check (public.is_backoffice_user());
create policy "Staff read intakes" on public.candidate_intakes for select using (public.is_backoffice_user());
create policy "Staff read documents" on public.candidate_documents for select using (public.is_backoffice_user());
create policy "Staff review documents" on public.candidate_documents for update using (public.is_backoffice_user()) with check (public.is_backoffice_user());
create policy "Staff read candidate files" on storage.objects for select to authenticated using (bucket_id = 'candidate-documents' and public.is_backoffice_user());
create policy "Staff manage notes" on public.candidate_internal_notes for all using (public.is_backoffice_user()) with check (public.is_backoffice_user() and author_id = auth.uid());
create policy "Staff manage status history" on public.candidate_status_history for all using (public.is_backoffice_user()) with check (public.is_backoffice_user() and changed_by = auth.uid());
create policy "Staff manage emails" on public.candidate_emails for all using (public.is_backoffice_user()) with check (public.is_backoffice_user() and created_by = auth.uid());

create index if not exists candidate_notes_candidate_idx on public.candidate_internal_notes(candidate_id, created_at desc);
create index if not exists candidate_history_candidate_idx on public.candidate_status_history(candidate_id, created_at desc);
create index if not exists candidate_emails_candidate_idx on public.candidate_emails(candidate_id, created_at desc);
