-- Release blocker closure: durable deletion receipts, native push tokens and
-- an initial anonymised pilot job so the candidate journey is usable on day 1.

alter table public.data_subject_requests
  add column if not exists requester_email text,
  add column if not exists candidate_reference text,
  alter column candidate_id drop not null;

alter table public.data_subject_requests
  drop constraint if exists data_subject_requests_candidate_id_fkey;
alter table public.data_subject_requests
  add constraint data_subject_requests_candidate_id_fkey
  foreign key (candidate_id) references public.candidates(id) on delete set null;

create or replace function public.snapshot_data_subject_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select email, reference_number
    into new.requester_email, new.candidate_reference
    from public.candidates where id = new.candidate_id;
  return new;
end;
$$;

drop trigger if exists snapshot_data_subject_request on public.data_subject_requests;
create trigger snapshot_data_subject_request
before insert on public.data_subject_requests
for each row execute function public.snapshot_data_subject_request();

create table if not exists public.privacy_deletion_receipts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid unique,
  candidate_reference text,
  requested_at timestamptz not null,
  completed_at timestamptz not null default now(),
  deleted_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);
alter table public.privacy_deletion_receipts enable row level security;
create policy "Admins read deletion receipts" on public.privacy_deletion_receipts
for select using (public.is_backoffice_admin());

create table if not exists public.candidate_device_tokens (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios','android','web')),
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.candidate_device_tokens enable row level security;
create policy "Candidates manage own device tokens" on public.candidate_device_tokens
for all using (auth.uid() = candidate_id) with check (auth.uid() = candidate_id);
create policy "Staff read device tokens" on public.candidate_device_tokens
for select using (public.is_backoffice_user());
create index if not exists candidate_device_tokens_candidate_idx
  on public.candidate_device_tokens(candidate_id, enabled);

-- Recreate the transactional status RPC with a notification id return value.
-- This also upgrades environments where the earlier void-returning function
-- has already been applied.
drop function if exists public.update_candidate_status(uuid,text,text);
create function public.update_candidate_status(candidate_id uuid, new_status text, note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  previous_status text;
  notification_id uuid;
begin
  if not public.is_backoffice_user() then raise exception 'NOT_STAFF'; end if;
  select status into previous_status from public.candidates where id = candidate_id for update;
  if previous_status is null then raise exception 'CANDIDATE_NOT_FOUND'; end if;
  update public.candidates set status = new_status, updated_at = now() where id = candidate_id;
  insert into public.candidate_status_history (candidate_id, changed_by, previous_status, new_status, note)
  values (candidate_id, auth.uid(), previous_status, new_status, nullif(note, ''));
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'candidate.status_changed', 'candidates', candidate_id, jsonb_build_object('previous_status', previous_status, 'new_status', new_status));
  insert into public.candidate_notifications (candidate_id, title, message)
  values (candidate_id, 'MediBridge – Statusaktualisierung', 'Dein Kandidatenstatus wurde auf ' || new_status || ' aktualisiert.')
  returning id into notification_id;
  return notification_id;
end;
$$;

insert into public.jobs (
  title, region, employment_type, salary_text, german_level, description,
  support_text, employer_reference, status, published_at
)
select
  'Pflegefachkraft (m/w/d)',
  'Nordrhein-Westfalen',
  'full_time',
  'Vergütung nach Qualifikation und Tarif',
  'Deutsch B2 erwünscht',
  'Ein etablierter Pflegeanbieter in Nordrhein-Westfalen sucht internationale Pflegefachkräfte für eine langfristige Beschäftigung. Die Arbeitgeberidentität wird nach Prüfung des Profils und Zustimmung zum Matching offengelegt.',
  'MediBridge begleitet Dokumentenprüfung, Anerkennungsverfahren, Interviewvorbereitung und Einreiseplanung.',
  'PILOT-NRW-PFLEGE-001',
  'published',
  now()
where not exists (
  select 1 from public.jobs where employer_reference = 'PILOT-NRW-PFLEGE-001'
);
