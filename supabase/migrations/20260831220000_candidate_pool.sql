create extension if not exists pgcrypto;

create table if not exists public.candidates (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  nationality text,
  residence text,
  preferred_language text not null default 'en' check (preferred_language in ('en','de','ar')),
  status text not null default 'draft' check (status in ('draft','submitted','under_review','verified','rejected')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.candidate_intakes (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null unique references public.candidates(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.candidate_documents (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  document_type text not null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  file_size bigint,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  created_at timestamptz not null default now()
);

create index if not exists candidate_documents_candidate_id_idx on public.candidate_documents(candidate_id);

alter table public.candidates enable row level security;
alter table public.candidate_intakes enable row level security;
alter table public.candidate_documents enable row level security;

create policy "Candidates manage own profile" on public.candidates for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "Candidates manage own intake" on public.candidate_intakes for all using (auth.uid() = candidate_id) with check (auth.uid() = candidate_id);
create policy "Candidates manage own document metadata" on public.candidate_documents for all using (auth.uid() = candidate_id) with check (auth.uid() = candidate_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('candidate-documents', 'candidate-documents', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Candidates upload own documents" on storage.objects for insert to authenticated
with check (bucket_id = 'candidate-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Candidates read own documents" on storage.objects for select to authenticated
using (bucket_id = 'candidate-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Candidates delete own documents" on storage.objects for delete to authenticated
using (bucket_id = 'candidate-documents' and (storage.foldername(name))[1] = auth.uid()::text);
