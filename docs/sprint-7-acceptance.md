# Sprint 7 acceptance

Sprint 7 turns the automated checks into a release gate against an isolated
staging environment. The workflow deliberately fails when configuration is
missing; it never skips the browser journeys and it explicitly rejects the
production Supabase project.

## GitHub `staging` environment

Create an environment named `staging` and configure these non-sensitive
variables:

| Variable | Purpose |
| --- | --- |
| `E2E_ENABLED` | Must be exactly `true` to activate the mandatory gate. |
| `STAGING_SUPABASE_PROJECT_REF` | Project reference of the isolated staging project. |
| `STAGING_SUPABASE_URL` | Staging project URL. Production is rejected. |
| `STAGING_SUPABASE_PUBLISHABLE_KEY` | Staging publishable/anon key. |

Configure these encrypted environment secrets:

| Secret | Purpose |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Deploy migrations and Edge Functions. |
| `STAGING_SUPABASE_DB_PASSWORD` | Link and migrate staging. |
| `E2E_SUPABASE_SERVICE_ROLE_KEY` | Seed and clean isolated E2E data. |
| `E2E_CANDIDATE_EMAIL`, `E2E_CANDIDATE_PASSWORD` | Stable candidate account. |
| `E2E_STAFF_EMAIL`, `E2E_STAFF_PASSWORD` | Stable backoffice account. |
| `E2E_REGISTRATION_EMAIL` | Disposable inbox used for registration confirmation. |
| `E2E_DELIVERY_EMAIL` | Real inbox used to prove backoffice delivery. |
| `E2E_RESEND_API_KEY` | Read delivery events from Resend. |
| `CLOUDFLARE_API_TOKEN` | Apply CORS to the staging R2 bucket. |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Verify the staging deployment for the tested commit. |

## Staging Edge Function secrets

Set these on the staging Supabase project before enabling the gate:

- `R2_ACCOUNT_ID`, `R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`; use the dedicated
  `medibridge-candidate-documents-staging` bucket.
- `DOCUMENTS_ALLOWED_ORIGINS` with the staging Vercel origin only.
- `DOCUMENT_SCANNER_URL`, `DOCUMENT_SCANNER_TOKEN` and
  `DOCUMENT_SCANNER_PROVIDER=cloudmersive` (or the generic scanner contract).
- `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL` sender.

## Automated evidence

`npm run test:e2e` covers registration, confirmation delivery, password reset,
candidate intake, profile/language/avatar, clean document upload, preview,
replacement and deletion, malware rejection, jobs/interests/application,
privacy requests, candidate isolation, backoffice filtering, notes, document
review, candidate status, transactional email delivery and privacy completion.

Acceptance is complete only when the GitHub `End-to-end tests (Playwright)` job
passes with zero skipped tests. The workflow retains its Playwright report for
14 days as release evidence.
