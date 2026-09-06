alter table public.candidate_intakes add column if not exists consent_version text;

create table if not exists public.consent_events (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  consent_type text not null,
  decision text not null check (decision in ('granted','withdrawn')),
  consent_version text not null,
  language text not null check (language in ('en','de','ar')),
  occurred_at timestamptz not null default now()
);

alter table public.consent_events enable row level security;
create policy "Candidates create own consent events" on public.consent_events for insert with check (auth.uid() = candidate_id);
create policy "Candidates read own consent events" on public.consent_events for select using (auth.uid() = candidate_id);
create policy "Staff manage consent events" on public.consent_events for all using (public.is_backoffice_user()) with check (public.is_backoffice_user());

create table if not exists public.data_retention_rules (
  data_category text primary key,
  retention_days integer not null check (retention_days > 0),
  deletion_action text not null,
  legal_basis text not null,
  updated_at timestamptz not null default now()
);

alter table public.data_retention_rules enable row level security;
create policy "Staff manage retention rules" on public.data_retention_rules for all using (public.is_backoffice_user()) with check (public.is_backoffice_user());

insert into public.data_retention_rules(data_category,retention_days,deletion_action,legal_basis)
values
  ('drafts',90,'delete profile, intake and documents after inactivity','data minimisation'),
  ('submitted_candidates',730,'delete or anonymise profile and documents after last contact','consent / contract preparation'),
  ('legal_records',2555,'retain only records required by statutory obligations','legal obligation')
on conflict (data_category) do nothing;
