-- Sprint 7: retain the provider identifier required to prove transactional
-- email delivery (not merely successful queuing) during release acceptance.

alter table public.candidate_emails
  add column if not exists provider_message_id text,
  add column if not exists delivery_status text;

create index if not exists candidate_emails_provider_message_id_idx
  on public.candidate_emails(provider_message_id)
  where provider_message_id is not null;

-- Rollback:
-- drop index if exists public.candidate_emails_provider_message_id_idx;
-- alter table public.candidate_emails drop column if exists delivery_status;
-- alter table public.candidate_emails drop column if exists provider_message_id;
