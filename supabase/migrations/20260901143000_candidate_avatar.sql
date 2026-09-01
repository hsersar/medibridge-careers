alter table public.candidates add column if not exists avatar_path text;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('candidate-avatars','candidate-avatars',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy "Candidates upload own avatar" on storage.objects for insert to authenticated with check(bucket_id='candidate-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Candidates read own avatar" on storage.objects for select to authenticated using(bucket_id='candidate-avatars' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_backoffice_user()));
create policy "Candidates delete own avatar" on storage.objects for delete to authenticated using(bucket_id='candidate-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
