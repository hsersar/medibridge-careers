-- pgTAP suite: candidate-owned data is isolated by Row Level Security.
--
-- Run locally with the Supabase CLI (spins up a local Postgres instance with
-- the `auth`/`storage` schemas and pgTAP preinstalled):
--   supabase start
--   supabase test db
-- CI runs the same suite via `npm run test:migrations` (scripts/test-migrations.sh).
begin;
select plan(6);

-- Two candidates with minimal profiles.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'candidate-a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'candidate-b@example.com');

insert into public.candidates (id, full_name, email) values
  ('11111111-1111-1111-1111-111111111111', 'Candidate A', 'candidate-a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'Candidate B', 'candidate-b@example.com');

insert into public.candidate_intakes (candidate_id, answers) values
  ('11111111-1111-1111-1111-111111111111', '{"note":"a"}'),
  ('22222222-2222-2222-2222-222222222222', '{"note":"b"}');

-- Simulate an authenticated request from Candidate A.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text,
  true
);

select is(
  (select count(*) from public.candidates)::int,
  1,
  'Candidate A only sees their own candidate row'
);
select is(
  (select full_name from public.candidates limit 1),
  'Candidate A',
  'Candidate A cannot read Candidate B''s profile'
);
select is(
  (select count(*) from public.candidate_intakes)::int,
  1,
  'Candidate A only sees their own intake answers'
);

select lives_ok(
  $$ update public.candidates set full_name = 'Hijacked' where id = '22222222-2222-2222-2222-222222222222' $$,
  'Candidate A cannot update Candidate B''s profile'
);

-- Switch to Candidate B and confirm the same isolation holds in reverse.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text,
  true
);

select is(
  (select count(*) from public.candidates)::int,
  1,
  'Candidate B only sees their own candidate row'
);
select is(
  (select full_name from public.candidates limit 1),
  'Candidate B',
  'Candidate B cannot read Candidate A''s profile'
);

select * from finish();
rollback;
