create or replace function public.is_backoffice_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.backoffice_users where user_id = auth.uid() and role = 'admin') $$;

drop policy "Admins manage backoffice users" on public.backoffice_users;
create policy "Admins manage backoffice users" on public.backoffice_users for all
using (public.is_backoffice_admin())
with check (public.is_backoffice_admin());

drop policy "Admins read audit logs" on public.audit_logs;
create policy "Admins read audit logs" on public.audit_logs for select
using (public.is_backoffice_admin());
