-- Backoffice gap closure: role management, master-data editing, job-interest
-- management, transactional status changes, audit logging, e-mail templates
-- and a centralized communication trail.

-- Functions below write audit events. Create the target relation first so a
-- clean database can compile and execute those functions in migration order.
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 1. Staff can edit candidate master data (candidates + intake answers).
create policy "Staff update intakes" on public.candidate_intakes for update using (public.is_backoffice_user()) with check (public.is_backoffice_user());

-- 2. Staff can create and remove job interests on behalf of a candidate.
create policy "Staff insert interests" on public.candidate_job_interests for insert with check (public.is_backoffice_user());
create policy "Staff delete interests" on public.candidate_job_interests for delete using (public.is_backoffice_user());

-- 3. Role management: only admins may manage the backoffice roster.
create policy "Admins manage backoffice users" on public.backoffice_users for all using (
  exists(select 1 from public.backoffice_users bu where bu.user_id = auth.uid() and bu.role = 'admin')
) with check (
  exists(select 1 from public.backoffice_users bu where bu.user_id = auth.uid() and bu.role = 'admin')
);

create or replace function public.admin_set_backoffice_role(target_email text, target_role text, target_display_name text default null)
returns public.backoffice_users
language plpgsql security definer set search_path = public as $$
declare
  target_user_id uuid;
  result public.backoffice_users;
begin
  if not exists(select 1 from public.backoffice_users where user_id = auth.uid() and role = 'admin') then
    raise exception 'NOT_ADMIN';
  end if;
  if target_role not in ('admin', 'reviewer') then
    raise exception 'INVALID_ROLE';
  end if;
  select id into target_user_id from auth.users where lower(email) = lower(target_email);
  if target_user_id is null then
    raise exception 'USER_NOT_FOUND';
  end if;
  -- New users default display_name to their email when none is supplied; existing users keep
  -- their current display_name unless target_display_name is explicitly provided.
  insert into public.backoffice_users (user_id, display_name, role)
  values (target_user_id, coalesce(target_display_name, target_email), target_role)
  on conflict (user_id) do update set role = excluded.role, display_name = coalesce(target_display_name, public.backoffice_users.display_name)
  returning * into result;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'backoffice_user.role_set', 'backoffice_users', target_user_id, jsonb_build_object('role', target_role, 'email', target_email));
  return result;
end;
$$;

create or replace function public.admin_remove_backoffice_user(target_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.backoffice_users where user_id = auth.uid() and role = 'admin') then
    raise exception 'NOT_ADMIN';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'CANNOT_REMOVE_SELF';
  end if;
  delete from public.backoffice_users where user_id = target_user_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'backoffice_user.removed', 'backoffice_users', target_user_id, '{}'::jsonb);
end;
$$;

-- 4. Audit log covering all administrative actions.
alter table public.audit_logs enable row level security;
create policy "Staff insert audit logs" on public.audit_logs for insert with check (public.is_backoffice_user() and actor_id = auth.uid());
create policy "Admins read audit logs" on public.audit_logs for select using (
  exists(select 1 from public.backoffice_users bu where bu.user_id = auth.uid() and bu.role = 'admin')
);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);

-- 5. Transactional status change (status update + history row + audit log).
drop function if exists public.update_candidate_status(uuid,text,text);
create function public.update_candidate_status(candidate_id uuid, new_status text, note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  previous_status text;
  notification_id uuid;
begin
  if not public.is_backoffice_user() then
    raise exception 'NOT_STAFF';
  end if;
  select status into previous_status from public.candidates where id = candidate_id for update;
  if previous_status is null then
    raise exception 'CANDIDATE_NOT_FOUND';
  end if;
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

-- 6. E-mail template management + centralized communication history support.
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  subject text not null,
  body text not null,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.email_templates enable row level security;
create policy "Staff read templates" on public.email_templates for select using (public.is_backoffice_user());
create policy "Staff manage templates" on public.email_templates for all using (public.is_backoffice_user()) with check (public.is_backoffice_user() and updated_by = auth.uid());

insert into public.email_templates (key, label, subject, body, updated_by) values
  ('missing', 'Fehlende Unterlagen', 'MediBridge – fehlende Unterlagen', 'Guten Tag {{name}},\n\nfür die weitere Prüfung Ihres Profils benötigen wir noch folgende Unterlagen:\n\n[Unterlagen ergänzen]\n\nViele Grüße\nMediBridge Maghreb', null),
  ('review', 'Prüfung gestartet', 'MediBridge – Ihre Unterlagen werden geprüft', 'Guten Tag {{name}},\n\nwir haben Ihre Angaben erhalten und mit der persönlichen Prüfung begonnen. Wir melden uns, sobald der nächste Schritt feststeht.\n\nViele Grüße\nMediBridge Maghreb', null),
  ('verified', 'Profil verifiziert', 'MediBridge – Ihr Profil wurde verifiziert', 'Guten Tag {{name}},\n\nIhr Kandidatenprofil wurde erfolgreich verifiziert. Wir prüfen nun passende Möglichkeiten in Deutschland.\n\nViele Grüße\nMediBridge Maghreb', null)
on conflict (key) do nothing;

-- Allow the e-mail edge function (service role) to update delivery status;
-- staff keep the ability to mark a message manually if the provider call
-- itself fails client-side.
create policy "Staff update email status" on public.candidate_emails for update using (public.is_backoffice_user()) with check (public.is_backoffice_user());

-- 7. Data-subject (privacy) request status management is already covered by
-- the "Staff manage privacy requests" policy from the jobs/release migration;
-- add an index to support the backoffice UI list view.
create index if not exists privacy_requests_candidate_idx on public.data_subject_requests(candidate_id, created_at desc);
