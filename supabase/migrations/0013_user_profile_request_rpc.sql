create or replace function public.cfp_request_user_profile(
  requested_role text default 'client',
  requested_full_name text default null
)
returns public.user_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  next_role text;
  next_status text;
  profile public.user_profiles;
begin
  if actor_id is null or actor_email is null then
    raise exception 'Login is required to request access.' using errcode = '42501';
  end if;

  if actor_email = 'raycole_nkg1990@hotmail.com' then
    next_role := 'admin';
    next_status := 'active';
  else
    next_role := case when requested_role = 'agent' then 'agent' else 'client' end;
    next_status := 'pending';
  end if;

  insert into public.user_profiles (id, email, full_name, role, status)
  values (
    actor_id,
    actor_email,
    coalesce(nullif(requested_full_name, ''), actor_email),
    next_role,
    next_status
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(nullif(excluded.full_name, ''), user_profiles.full_name, excluded.email),
    role = case when user_profiles.status = 'pending' then excluded.role else user_profiles.role end,
    status = case when user_profiles.status = 'pending' then excluded.status else user_profiles.status end
  returning * into profile;

  return profile;
end;
$$;

grant execute on function public.cfp_request_user_profile(text, text) to authenticated;
