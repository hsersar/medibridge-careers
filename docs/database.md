# Supabase migrations & seed strategy

This document is the reference for point 5 of the QA/deployment plan:
how schema changes reach production safely, how test/staging data is seeded
without touching real candidate data, and how the CI migration job
(`migrations` in `.github/workflows/ci.yml`) verifies migrations before merge.

## Migration naming and review

- Migration files live in `supabase/migrations/` and already follow the
  convention `YYYYMMDDHHMMSS_short_description.sql` (see e.g.
  `20260901110000_sprint_4_backoffice.sql`). Keep using this pattern —
  timestamp-prefixed so the Supabase CLI/Postgres apply them in a
  deterministic order, plus a short slug describing the change.
- Every migration must be idempotent where practical (`create table if not
  exists`, `create policy` guarded by `drop policy if exists` before
  re-creating, etc.), because the CI migration job and any environment reset
  re-applies the full history from scratch.
- Every new or changed table must, in the same migration:
  1. `alter table public.<table> enable row level security;`
  2. Add at least one `create policy` statement scoping access appropriately
     (candidate-owned rows via `auth.uid()`, staff-only rows via
     `public.is_backoffice_user()`).
  - `tests/security/rls-policy-coverage.test.mjs` statically enforces this
    for every migration file and fails CI if a table is missing RLS or a
    policy.
- Pull requests that add or change a migration must include:
  - A one-line rationale in the PR description (what changed and why).
  - Confirmation that `npm run test:migrations` passes locally or in CI
    (applies every migration to a fresh database and runs the pgTAP suite
    under `supabase/tests/database/`).
  - For destructive changes (dropped/renamed columns or tables), a note on
    the rollback plan (see below) and, if candidate-facing, a call-out in
    the PR so reviewers can assess data-loss risk explicitly.
- Do not edit a migration file that has already been applied to production.
  Ship a new, additive migration instead — this keeps the applied history in
  every environment consistent and auditable.

## Applying migrations

- Local development: `supabase start` (Supabase CLI) applies every file in
  `supabase/migrations/` in order against a disposable local Postgres
  instance that also provisions the `auth` and `storage` schemas the
  application and RLS policies depend on.
- Staging/production: apply migrations via `supabase db push` (or the
  Supabase dashboard's migration runner) against the linked project as part
  of the deployment flow described in `docs/deployment.md`. Do not apply
  migrations by hand through the SQL editor outside of this flow — it skips
  the ordering/idempotency guarantees the CI job verifies.

## CI migration test job

`.github/workflows/ci.yml`'s `migrations` job:

1. Installs the Supabase CLI (`supabase/setup-cli`).
2. Runs `npm run test:migrations`, which wraps `scripts/test-migrations.sh`:
   - `supabase start` — builds a throwaway Postgres + Auth + Storage stack
     and applies every migration in `supabase/migrations/` in order. A
     non-zero exit here means a migration has a syntax error, a bad
     dependency ordering, or violates a constraint — the same failure mode
     production would hit.
   - `supabase test db` — runs the pgTAP suite in
     `supabase/tests/database/*.sql`, which exercises RLS behaviour against
     real Postgres roles/JWT claims (candidate isolation, staff visibility;
     see `candidate_rls.test.sql` and `backoffice_rls.test.sql`).
3. Because `supabase start` always begins from an empty database and replays
   every migration, running this job on every PR also proves the full
   migration history stays idempotent/re-appliable — not just the newest
   file.

This complements, but does not replace, the fast static check in
`tests/security/rls-policy-coverage.test.mjs` (which runs in the `unit-tests`
job without needing Docker/Supabase CLI and catches missing RLS/policies
even when the `migrations` job is skipped or slow).

## Seed data strategy

- **Local/CI**: `supabase start` provisions an empty database; the pgTAP
  suite inserts and rolls back its own fixture rows per test (see the
  `begin; ... rollback;` wrapper in each `supabase/tests/database/*.sql`
  file), so no seed file is required or committed for automated tests.
- **Staging**: seed a small number of clearly-fake candidate/backoffice
  accounts (e.g. emails under a `+test@` or `@example.com` convention) via a
  `supabase/seed.sql` maintained separately from production data, or via the
  app's own sign-up/backoffice-invite flow against the staging project.
  Never copy production candidate data (real names, documents, contact
  details) into staging — candidate documents and PII are exactly what RLS
  and the document-scanning pipeline exist to protect, and staging typically
  has looser access control and more collaborators.
- **Production**: no synthetic/seed data. The only rows are those created
  through the real candidate application flow, backoffice invitations, and
  job postings entered by staff.
- Keep synthetic/test accounts identifiable (naming convention above) so
  they can be found and removed by a routine backoffice sweep and are never
  mistaken for a real candidate during manual review.

## Rollback strategy

- Prefer forward-fixing: ship a new migration that reverses the problematic
  change (e.g. `drop column`, `alter table ... add column` with a default)
  rather than editing history, consistent with the "don't edit applied
  migrations" rule above.
- For migrations that are not safely reversible in place (e.g. a `not null`
  backfill), write the corresponding down-migration SQL as a comment block
  at the bottom of the original migration file, so the manual rollback steps
  travel with the change instead of living only in someone's memory.
- If a migration causes a production incident before a forward-fix can be
  reviewed, apply the documented down-migration SQL directly via
  `supabase db push` (or the SQL editor, in an incident's exceptional
  circumstances) and open a follow-up PR with the corrected migration.
- See `docs/deployment.md` for how a schema rollback pairs with a Vercel
  application rollback (a rolled-back frontend must remain compatible with
  whichever schema version is live).
