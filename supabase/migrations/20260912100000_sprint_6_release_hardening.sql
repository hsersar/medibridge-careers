-- Sprint 6: make candidate_saved_jobs compatible with the application model.
-- The table was originally created with a composite primary key. A later
-- create-table-if-missing migration declared an id column, but could not add
-- it to databases where the earlier table already existed.

alter table public.candidate_saved_jobs
  add column if not exists id uuid default gen_random_uuid();

update public.candidate_saved_jobs
set id = gen_random_uuid()
where id is null;

alter table public.candidate_saved_jobs
  alter column id set default gen_random_uuid(),
  alter column id set not null;

create unique index if not exists candidate_saved_jobs_id_key
  on public.candidate_saved_jobs(id);

-- Rollback (only if every consumer has stopped selecting the id column):
-- drop index if exists public.candidate_saved_jobs_id_key;
-- alter table public.candidate_saved_jobs drop column if exists id;
