-- Anonymous Supabase identities are not candidate accounts. Keep defence in
-- depth at the database boundary even when anonymous sign-in is enabled in the
-- project settings for another client.

create or replace function public.is_authenticated_user()
returns boolean
language sql
stable
as $$
  select auth.uid() is not null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
$$;

drop policy if exists "Candidates manage own profile" on public.candidates;
create policy "Candidates manage own profile" on public.candidates
for all using (public.is_authenticated_user() and auth.uid() = id)
with check (public.is_authenticated_user() and auth.uid() = id);

drop policy if exists "Candidates manage own intake" on public.candidate_intakes;
create policy "Candidates manage own intake" on public.candidate_intakes
for all using (public.is_authenticated_user() and auth.uid() = candidate_id)
with check (public.is_authenticated_user() and auth.uid() = candidate_id);

drop policy if exists "Candidates manage own document metadata" on public.candidate_documents;
create policy "Candidates manage own document metadata" on public.candidate_documents
for all using (public.is_authenticated_user() and auth.uid() = candidate_id)
with check (public.is_authenticated_user() and auth.uid() = candidate_id);

drop policy if exists "Candidates manage own job preferences" on public.candidate_job_preferences;
create policy "Candidates manage own job preferences" on public.candidate_job_preferences
for all using (public.is_authenticated_user() and auth.uid() = candidate_id)
with check (public.is_authenticated_user() and auth.uid() = candidate_id);

drop policy if exists "Candidates manage own interests" on public.candidate_job_interests;
create policy "Candidates manage own interests" on public.candidate_job_interests
for all using (public.is_authenticated_user() and auth.uid() = candidate_id)
with check (public.is_authenticated_user() and auth.uid() = candidate_id);

drop policy if exists "Candidates manage own saved jobs" on public.candidate_saved_jobs;
create policy "Candidates manage own saved jobs" on public.candidate_saved_jobs
for all using (public.is_authenticated_user() and auth.uid() = candidate_id)
with check (public.is_authenticated_user() and auth.uid() = candidate_id);

drop policy if exists "Candidates manage own applications" on public.candidate_applications;
create policy "Candidates manage own applications" on public.candidate_applications
for all using (public.is_authenticated_user() and auth.uid() = candidate_id)
with check (public.is_authenticated_user() and auth.uid() = candidate_id);

drop policy if exists "Candidates read own notifications" on public.candidate_notifications;
create policy "Candidates read own notifications" on public.candidate_notifications
for select using (public.is_authenticated_user() and auth.uid() = candidate_id);

drop policy if exists "Candidates update own notifications" on public.candidate_notifications;
create policy "Candidates update own notifications" on public.candidate_notifications
for update using (public.is_authenticated_user() and auth.uid() = candidate_id)
with check (public.is_authenticated_user() and auth.uid() = candidate_id);

drop policy if exists "Candidates read own interviews" on public.candidate_interviews;
create policy "Candidates read own interviews" on public.candidate_interviews
for select using (public.is_authenticated_user() and auth.uid() = candidate_id);

drop policy if exists "Candidates create own consent events" on public.consent_events;
create policy "Candidates create own consent events" on public.consent_events
for insert with check (public.is_authenticated_user() and auth.uid() = candidate_id);

drop policy if exists "Candidates read own consent events" on public.consent_events;
create policy "Candidates read own consent events" on public.consent_events
for select using (public.is_authenticated_user() and auth.uid() = candidate_id);

drop policy if exists "Candidates create own privacy requests" on public.data_subject_requests;
create policy "Candidates create own privacy requests" on public.data_subject_requests
for insert with check (public.is_authenticated_user() and auth.uid() = candidate_id);

drop policy if exists "Candidates read own privacy requests" on public.data_subject_requests;
create policy "Candidates read own privacy requests" on public.data_subject_requests
for select using (public.is_authenticated_user() and auth.uid() = candidate_id);

drop policy if exists "Candidates manage own device tokens" on public.candidate_device_tokens;
create policy "Candidates manage own device tokens" on public.candidate_device_tokens
for all using (public.is_authenticated_user() and auth.uid() = candidate_id)
with check (public.is_authenticated_user() and auth.uid() = candidate_id);

drop policy if exists "Candidates upload own avatar" on storage.objects;
create policy "Candidates upload own avatar" on storage.objects for insert to authenticated
with check (
  public.is_authenticated_user()
  and bucket_id = 'candidate-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Candidates read own avatar" on storage.objects;
create policy "Candidates read own avatar" on storage.objects for select to authenticated
using (
  bucket_id = 'candidate-avatars'
  and (
    (public.is_authenticated_user() and (storage.foldername(name))[1] = auth.uid()::text)
    or public.is_backoffice_user()
  )
);

drop policy if exists "Candidates delete own avatar" on storage.objects;
create policy "Candidates delete own avatar" on storage.objects for delete to authenticated
using (
  public.is_authenticated_user()
  and bucket_id = 'candidate-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
