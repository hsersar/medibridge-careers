alter table public.candidate_documents
  add column if not exists storage_provider text not null default 'supabase'
    check (storage_provider in ('supabase', 'r2')),
  add column if not exists storage_bucket text not null default 'candidate-documents',
  add column if not exists migrated_at timestamptz;

update public.candidate_documents
set storage_provider = 'supabase',
    storage_bucket = 'candidate-documents'
where storage_provider is null
   or storage_bucket is null;

create index if not exists candidate_documents_storage_provider_idx
  on public.candidate_documents(storage_provider, candidate_id);

comment on column public.candidate_documents.storage_provider is
  'Blob storage backend. Existing rows remain in Supabase Storage; new uploads use Cloudflare R2.';
comment on column public.candidate_documents.storage_bucket is
  'Physical bucket containing the object referenced by storage_path.';
comment on column public.candidate_documents.migrated_at is
  'Timestamp at which a legacy object was copied to its current storage provider.';
