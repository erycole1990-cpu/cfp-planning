drop policy if exists "user_profiles_first_admin_update" on user_profiles;
create policy "user_profiles_first_admin_update" on user_profiles for update to authenticated using (
  id = auth.uid()
  and lower(email) = 'raycole_nkg1990@hotmail.com'
) with check (
  id = auth.uid()
  and lower(email) = 'raycole_nkg1990@hotmail.com'
  and role = 'admin'
  and status = 'active'
);

update user_profiles
set role = 'admin',
    status = 'active'
where lower(email) = 'raycole_nkg1990@hotmail.com';
