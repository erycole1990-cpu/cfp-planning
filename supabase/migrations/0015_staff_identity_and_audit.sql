alter table public.user_profiles
  add column if not exists phone text,
  add column if not exists job_title text,
  add column if not exists agency_name text,
  add column if not exists agency_registration_no text,
  add column if not exists license_no text,
  add column if not exists branch_name text,
  add column if not exists bio text,
  add column if not exists updated_at timestamptz not null default now();

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
    full_name = case
      when nullif(trim(user_profiles.full_name), '') is null
        or lower(trim(user_profiles.full_name)) = lower(user_profiles.email)
      then coalesce(nullif(excluded.full_name, ''), user_profiles.full_name, excluded.email)
      else user_profiles.full_name
    end,
    role = case when user_profiles.status = 'pending' then excluded.role else user_profiles.role end,
    status = case when user_profiles.status = 'pending' then excluded.status else user_profiles.status end
  returning * into profile;

  return profile;
end;
$$;

grant execute on function public.cfp_request_user_profile(text, text) to authenticated;

create or replace function public.cfp_update_own_profile(
  profile_full_name text,
  profile_phone text default null,
  profile_job_title text default null,
  profile_agency_name text default null,
  profile_agency_registration_no text default null,
  profile_license_no text default null,
  profile_branch_name text default null,
  profile_bio text default null
)
returns public.user_profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.user_profiles;
begin
  if auth.uid() is null then
    raise exception 'Login is required.' using errcode = '42501';
  end if;

  update public.user_profiles
  set
    full_name = coalesce(nullif(trim(profile_full_name), ''), full_name),
    phone = nullif(trim(profile_phone), ''),
    job_title = nullif(trim(profile_job_title), ''),
    agency_name = nullif(trim(profile_agency_name), ''),
    agency_registration_no = nullif(trim(profile_agency_registration_no), ''),
    license_no = nullif(trim(profile_license_no), ''),
    branch_name = nullif(trim(profile_branch_name), ''),
    bio = nullif(trim(profile_bio), ''),
    updated_at = now()
  where id = auth.uid()
  returning * into profile;

  if profile.id is null then
    raise exception 'User profile was not found.' using errcode = 'P0002';
  end if;

  return profile;
end;
$$;

grant execute on function public.cfp_update_own_profile(text, text, text, text, text, text, text, text) to authenticated;

create or replace function public.cfp_create_customer(customer_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := cfp_user_role();
  selected_agent_id uuid;
  selected_agent_name text;
  new_customer_id uuid;
begin
  if actor_id is null or actor_role not in ('admin', 'agent') then
    raise exception 'Only active admins and agents can add customers.' using errcode = '42501';
  end if;

  if actor_role = 'agent' then
    selected_agent_id := actor_id;
  else
    selected_agent_id := nullif(customer_payload ->> 'assigned_agent_user_id', '')::uuid;
  end if;

  select full_name
  into selected_agent_name
  from public.user_profiles
  where id = selected_agent_id
    and role = 'agent'
    and status = 'active';

  if selected_agent_name is null then
    raise exception 'Choose an approved active agent before saving this customer.' using errcode = '42501';
  end if;

  insert into public.customers (
    full_name, email, phone, date_of_birth, nric_passport, nationality,
    marital_status, number_of_dependents, residential_address,
    employment_status, occupation, employer_name, monthly_income_range,
    source_of_funds, source_of_wealth, risk_profile, assigned_advisor_name,
    assigned_agent_user_id, client_stage, notes
  )
  values (
    nullif(customer_payload ->> 'full_name', ''),
    nullif(customer_payload ->> 'email', ''),
    nullif(customer_payload ->> 'phone', ''),
    nullif(customer_payload ->> 'date_of_birth', '')::date,
    nullif(customer_payload ->> 'nric_passport', ''),
    nullif(customer_payload ->> 'nationality', ''),
    nullif(customer_payload ->> 'marital_status', ''),
    nullif(customer_payload ->> 'number_of_dependents', '')::integer,
    nullif(customer_payload ->> 'residential_address', ''),
    nullif(customer_payload ->> 'employment_status', ''),
    nullif(customer_payload ->> 'occupation', ''),
    nullif(customer_payload ->> 'employer_name', ''),
    nullif(customer_payload ->> 'monthly_income_range', ''),
    nullif(customer_payload ->> 'source_of_funds', ''),
    nullif(customer_payload ->> 'source_of_wealth', ''),
    nullif(customer_payload ->> 'risk_profile', ''),
    selected_agent_name,
    selected_agent_id,
    coalesce(nullif(customer_payload ->> 'client_stage', ''), 'lead'),
    nullif(customer_payload ->> 'notes', '')
  )
  returning id into new_customer_id;

  return new_customer_id;
end;
$$;

grant execute on function public.cfp_create_customer(jsonb) to authenticated;

create or replace function public.cfp_prevent_duplicate_active_goal()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  normalized_name text := lower(regexp_replace(trim(new.goal_name), '\s+', ' ', 'g'));
begin
  if coalesce(new.status, 'active') <> 'active' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.customer_id::text || ':' || normalized_name, 0));

  if exists (
    select 1
    from public.financial_goals goal
    where goal.customer_id = new.customer_id
      and goal.id <> new.id
      and coalesce(goal.status, 'active') = 'active'
      and lower(regexp_replace(trim(goal.goal_name), '\s+', ' ', 'g')) = normalized_name
  ) then
    raise exception 'An active goal with this name already exists for this customer.' using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists financial_goals_prevent_duplicate_active on public.financial_goals;
create trigger financial_goals_prevent_duplicate_active
before insert or update of customer_id, goal_name, status on public.financial_goals
for each row execute function public.cfp_prevent_duplicate_active_goal();

drop policy if exists "audit_logs_authenticated_write" on public.audit_logs;
create policy "audit_logs_authenticated_write"
on public.audit_logs
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "customers_role_update" on public.customers;
create policy "customers_role_update"
on public.customers
for update
to authenticated
using (
  cfp_is_admin()
  or (cfp_user_role() = 'agent' and assigned_agent_user_id = auth.uid())
)
with check (
  cfp_is_admin()
  or (cfp_user_role() = 'agent' and assigned_agent_user_id = auth.uid())
);
