# Production runbook

## Required services

- Configure Supabase URL, publishable key, database migrations, Auth redirect URLs and SMTP.
- Configure Cloudflare R2 and deploy `candidate-documents`.
- Configure `DOCUMENT_SCANNER_URL` and `DOCUMENT_SCANNER_TOKEN`; uploads fail closed when scanning is unavailable.
- Configure `RESEND_API_KEY` and `RESEND_FROM_EMAIL` for backoffice email delivery.
- Configure `FIREBASE_SERVICE_ACCOUNT_JSON` as a Supabase Edge Function secret and add
  the Firebase native configuration files to the protected release pipeline.
- Configure `CLOUDFLARE_API_TOKEN` in the GitHub production environment; deployment
  applies and verifies the committed R2 CORS policy.
- Enable Supabase managed backups/PITR. The scheduled workflow verifies the backup
  schedule through the Management API and never copies production dumps into GitHub.

## Monitoring

- Monitor `GET /api/health` from the hosting provider every minute.
- Review the `app_errors` table for client errors and alert on increasing volume.
- Review Supabase Auth, Edge Function and R2 logs daily.
- Test restoration of the backup artifact at least monthly.

## Data deletion

Administrators process verified deletion requests through `purge-candidate-data`. The function removes Supabase Storage and R2 objects, deletes the Supabase Auth user and cascading candidate records, then retains only a restricted deletion receipt and the completed request record.
