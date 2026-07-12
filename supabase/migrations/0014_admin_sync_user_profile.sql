create or replace function public.cfp_admin_sync_user_profile(
  target_email text,
  target_role text default 'agent',
  target_status text default 'pending',
  target_full_name text default null
)
returns public.user_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_email text := lower(trim(coalesce(target_email, '')));
  clean_role text := case when target_role in ('admin', 'agent', 'client') then target_role else 'agent' end;
  clean_status text := case when target_status in ('active', 'pending', 'inactive') then target_status else 'pending' end;
  auth_user record;
  profile public.user_profiles;
begin
  if auth.uid() is null or not cfp_is_admin() then
    raise exception 'Only active admins can sync user profiles.' using errcode = '42501';
  end if;

  if clean_email = '' then
    raise exception 'Email is required.' using errcode = '22023';
  end if;

  select id, email, raw_user_meta_data
  into auth_user
  from auth.users
  where lower(email) = clean_email
  order by created_at desc
  limit 1;

  if auth_user.id is null then
    raise exception 'No Supabase Auth user exists for % yet. Ask the user to create the account first.', clean_email using errcode = 'P0002';
  end if;

  insert into public.user_profiles (id, email, full_name, role, status)
  values (
    auth_user.id,
    lower(auth_user.email),
    coalesce(
      nullif(target_full_name, ''),
      nullif(auth_user.raw_user_meta_data ->> 'full_name', ''),
      nullif(auth_user.raw_user_meta_data ->> 'name', ''),
      lower(auth_user.email)
    ),
    clean_role,
    clean_status
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(nullif(excluded.full_name, ''), user_profiles.full_name, excluded.email),
    role = excluded.role,
    status = excluded.status
  returning * into profile;

  return profile;
end;
$$;

grant execute on function public.cfp_admin_sync_user_profile(text, text, text, text) to authenticated;
