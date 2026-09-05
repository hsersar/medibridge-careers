# Production runbook

## Required services

- Configure Supabase URL, publishable key, database migrations, Auth redirect URLs and SMTP.
- Configure Cloudflare R2 and deploy `candidate-documents`.
- Configure `DOCUMENT_SCANNER_URL` and `DOCUMENT_SCANNER_TOKEN`; uploads fail closed when scanning is unavailable.
- Configure `RESEND_API_KEY` and `RESEND_FROM_EMAIL` for backoffice email delivery.
- Configure `SUPABASE_DATABASE_URL` as a GitHub Actions secret for the scheduled backup workflow.

## Monitoring

- Monitor `GET /api/health` from the hosting provider every minute.
- Review the `app_errors` table for client errors and alert on increasing volume.
- Review Supabase Auth, Edge Function and R2 logs daily.
- Test restoration of the backup artifact at least monthly.

## Data deletion

Administrators process verified deletion requests through `purge-candidate-data`. The function deletes the candidate row and its cascading profile, intake, documents, saved jobs and interests. Storage objects must be removed by the retention job before the request is marked complete.
