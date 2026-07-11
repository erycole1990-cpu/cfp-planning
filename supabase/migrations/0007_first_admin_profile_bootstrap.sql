drop policy if exists "user_profiles_first_admin_insert" on user_profiles;
create policy "user_profiles_first_admin_insert" on user_profiles for insert to authenticated with check (
  id = auth.uid()
  and lower(email) = 'raycole_nkg1990@hotmail.com'
  and role = 'admin'
  and status = 'active'
);

drop policy if exists "audit_logs_admin_write" on audit_logs;
create policy "audit_logs_admin_write" on audit_logs for insert to authenticated with check (cfp_is_admin());
