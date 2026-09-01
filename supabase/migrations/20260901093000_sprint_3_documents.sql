alter table public.candidate_documents add column if not exists verification_note text;
alter table public.candidate_documents add column if not exists updated_at timestamptz not null default now();
create index if not exists candidate_documents_type_idx on public.candidate_documents(candidate_id, document_type);
