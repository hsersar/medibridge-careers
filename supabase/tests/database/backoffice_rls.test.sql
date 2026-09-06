-- pgTAP suite: backoffice staff can see all candidates, but a plain
-- authenticated candidate cannot read `backoffice_users` or act as staff.
--
-- Run locally with the Supabase CLI (see candidate_rls.test.sql for details).
begin;
select plan(4);

insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'candidate-c@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'staff-a@example.com');

insert into public.candidates (id, full_name, email) values
  ('33333333-3333-3333-3333-333333333333', 'Candidate C', 'candidate-c@example.com');

insert into public.backoffice_users (user_id, display_name, role) values
  ('44444444-4444-4444-4444-444444444444', 'Staff A', 'reviewer');

-- A plain candidate must not be able to read the staff roster or other
-- candidates' rows via the backoffice-only policies.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text,
  true
);

select is(
  (select count(*) from public.backoffice_users)::int,
  0,
  'A candidate cannot read the backoffice_users roster'
);
select is(
  (select count(*) from public.candidates)::int,
  1,
  'A candidate only sees their own candidate row, not the full pool'
);

-- Staff members can read every candidate and their own membership row.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text,
  true
);

select is(
  (select count(*) from public.candidates)::int,
  1,
  'Staff can read the full candidate pool'
);
select is(
  (select display_name from public.backoffice_users where user_id = auth.uid()),
  'Staff A',
  'Staff can read their own backoffice_users membership row'
);

select * from finish();
rollback;
