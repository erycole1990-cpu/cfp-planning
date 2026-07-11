do $$
declare
  admin_email text := 'raycole_nkg1990@hotmail.com';
  target_user_id uuid;
  target_full_name text;
begin
  select
    u.id,
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', u.email)
  into target_user_id, target_full_name
  from auth.users u
  where lower(u.email) = admin_email
  order by u.created_at desc
  limit 1;

  if target_user_id is null then
    raise exception 'No Supabase Auth user found for %', admin_email;
  end if;

  update user_profiles
  set email = concat(email, '.archived.', left(id::text, 8)),
      status = 'inactive'
  where lower(email) = admin_email
    and id <> target_user_id;

  insert into user_profiles (id, email, full_name, role, status)
  values (target_user_id, admin_email, target_full_name, 'admin', 'active')
  on conflict (id) do update
  set email = admin_email,
      full_name = coalesce(user_profiles.full_name, excluded.full_name),
      role = 'admin',
      status = 'active';
end $$;

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

drop policy if exists "audit_logs_admin_write" on audit_logs;
create policy "audit_logs_admin_write" on audit_logs for insert to authenticated with check (cfp_is_admin());
