drop policy if exists "user_profiles_first_admin_insert" on user_profiles;
create policy "user_profiles_first_admin_insert" on user_profiles for insert to authenticated with check (
  id = auth.uid()
  and lower(email) = 'raycole_nkg1990@hotmail.com'
  and role = 'admin'
  and status = 'active'
);

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

insert into user_profiles (id, email, full_name, role, status)
select
  id,
  lower(email),
  coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', email),
  'admin',
  'active'
from auth.users
where lower(email) = 'raycole_nkg1990@hotmail.com'
on conflict (id) do update
set email = excluded.email,
    full_name = coalesce(user_profiles.full_name, excluded.full_name),
    role = 'admin',
    status = 'active';

drop policy if exists "audit_logs_admin_write" on audit_logs;
create policy "audit_logs_admin_write" on audit_logs for insert to authenticated with check (cfp_is_admin());
