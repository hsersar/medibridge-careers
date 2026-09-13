# Deployment, staging & rollback

This document covers points 6 and part of 8 of the QA/deployment plan:
a staging environment, the deployment flow from feature branch to
production, and the rollback process for both the app and the database.

## Environments

| Environment | App hosting | Database | Purpose |
|---|---|---|---|
| Preview | Vercel preview deployment (per PR) | Staging Supabase project | Reviewer sanity checks per PR; ephemeral. |
| Staging | Separate Vercel project (e.g. `medibridge-careers-staging`), deployed from `main` | Separate Supabase project (not production) | Pre-production verification, manual QA, E2E test target. |
| Production | Vercel production deployment, custom production domain | Production Supabase project | Live candidate/backoffice traffic. |

Set up staging as its own Vercel project connected to this repository with
its production branch set to `main` (or a dedicated `staging` branch if you
want production to require an explicit promotion step instead of deploying
on every merge), and its own Supabase project so RLS/migration mistakes or
test data never touch real candidate data. Configure the staging Vercel
project's environment variables with the staging Supabase project's URL/key
(see `docs/environment-checklist.md`) — never point staging at the
production Supabase project.

## Deployment flow

1. Feature branch is created off `main`; work happens in a PR.
2. CI (`.github/workflows/ci.yml`) runs on every PR: `lint`, `typecheck`,
   `unit-tests`, `build`, `build-tests`, `migrations`, and the mandatory
   staging `e2e` gate. Missing staging configuration fails the gate instead
   of silently skipping browser tests.
   `build-tests` verifies the built worker renders real MediBridge markup
   (not generic starter-demo output) and is a required, blocking check (see
   the comment in the workflow file).
3. All required checks must pass (configure branch protection on `main` to
   require `lint`, `typecheck`, `unit-tests`, `build`, `build-tests`,
   `migrations`, and `End-to-end tests (Playwright)` — see "Branch
   protection" below).
4. On merge to `main`:
   - Vercel automatically deploys the staging project from `main`.
   - Any new Supabase migrations are applied to the staging Supabase project
     (`supabase db push` against the staging project, either manually or via
     a deploy hook/CI step once staging credentials are configured as
     repository secrets).
5. Manual verification on staging: smoke-test the candidate flow (apply,
   upload a document, submit a privacy request) and the backoffice flow
   (login, review a candidate, update status) — the same journeys covered
   by `e2e/*.spec.ts`.
6. Promote to production once staging looks correct:
   - Apply the same migrations to the production Supabase project
     (`supabase db push` against the production project).
   - Promote/deploy the corresponding build to the production Vercel
     project (either by merging/fast-forwarding a `production` branch that
     the production Vercel project tracks, or by promoting the exact staging
     deployment via `vercel promote` if using a single Vercel project with
     multiple environments).
7. Re-verify production immediately after promotion using the environment
   checklist in `docs/environment-checklist.md`.

### Automated production deployment

`.github/workflows/deploy-production.yml` runs on pushes to `main` or by
manual dispatch. It builds the application, applies production migrations,
deploys every Supabase Edge Function, and then deploys the linked Vercel
project.

Configure these secrets in the repository's `production` environment before
running it:

- `SUPABASE_DATABASE_URL`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `CLOUDFLARE_API_TOKEN`

The production Vercel environment variables and Supabase Edge Function
secrets listed in `docs/environment-checklist.md` remain separate from these
deployment credentials and must be configured before promotion.

### Branch protection

Outside of the workflow file itself, configure the `main` branch protection
rule (Settings → Branches) to require the following status checks before
merging: `lint`, `typecheck`, `unit-tests`, `build`, `build-tests`,
`migrations`, and `End-to-end tests (Playwright)`. The staging environment
and all values in `docs/sprint-7-acceptance.md` must therefore be configured
before this rule is enabled.

## Rollback process

### Application (Vercel)

- Vercel keeps every previous deployment. To roll back, open the project's
  Deployments list and "Promote to Production" (or "Instant Rollback" if
  available on the plan) the last known-good deployment. This takes effect
  immediately without a new build.
- Because a rollback can leave the frontend running against a newer
  database schema than it was built for, only roll back the app alone when
  the regression is purely front-end (styling, a broken client-side flow)
  and not tied to a schema change from the same release.

### Database (Supabase)

- Prefer the forward-fix/rollback-migration approach documented in
  `docs/database.md` ("Rollback strategy") over restoring a full database
  backup, since Supabase point-in-time restores are disruptive (they
  overwrite all data since the restore point, including any real candidate
  activity that happened after the bad migration).
- If a migration must be rolled back immediately, apply the down-migration
  SQL documented at the bottom of the offending migration file
  (`supabase db push` or, in an incident, directly via the SQL editor), then
  roll back the application to a version compatible with the restored
  schema.
- Only fall back to a full point-in-time restore for data-loss incidents
  that a schema rollback cannot fix (e.g. an accidental bulk delete), and
  treat it as a last resort given the impact on data created after the
  restore point.

### Incident communication

- Whoever notices/triggers the rollback posts in the team's incident channel
  (or opens a GitHub issue if no dedicated channel exists) with: what broke,
  what was rolled back (app deployment id / migration), and current status.
- Once stable, file a short follow-up issue with the root cause and the
  forward-fix migration/PR, so the rollback is never the final state of the
  codebase.
