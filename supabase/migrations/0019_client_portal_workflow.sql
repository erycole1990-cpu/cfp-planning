create index if not exists customers_email_lower_idx
  on public.customers (lower(email));

create or replace function public.cfp_create_personal_portfolio(customer_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_email text := lower(nullif(auth.jwt() ->> 'email', ''));
  actor_name text;
  selected_agent_id uuid := nullif(customer_payload ->> 'assigned_agent_user_id', '')::uuid;
  selected_agent_name text;
  existing_customer_id uuid;
  existing_assigned_agent_id uuid;
  matching_customer_count integer;
  portfolio_id uuid;
begin
  if actor_id is null or cfp_user_role() not in ('admin', 'agent', 'client') then
    raise exception 'An active login is required.' using errcode = '42501';
  end if;

  select id into portfolio_id
  from public.customers
  where client_user_id = actor_id
  limit 1;
  if portfolio_id is not null then
    return portfolio_id;
  end if;

  if selected_agent_id is null or selected_agent_id = actor_id then
    raise exception 'Choose a different approved advisor for your personal plan.' using errcode = '42501';
  end if;

  select full_name
  into selected_agent_name
  from public.user_profiles
  where id = selected_agent_id
    and role = 'agent'
    and status = 'active';

  if selected_agent_name is null then
    raise exception 'Choose an approved active advisor.' using errcode = '42501';
  end if;

  select coalesce(nullif(trim(full_name), ''), actor_email)
  into actor_name
  from public.user_profiles
  where id = actor_id;

  select count(*)
  into matching_customer_count
  from public.customers
  where client_user_id is null
    and actor_email is not null
    and lower(email) = actor_email;

  if matching_customer_count > 1 then
    raise exception 'More than one customer record uses this email. Ask an admin to resolve the duplicate records first.' using errcode = '23505';
  end if;

  if matching_customer_count = 1 then
    select id, assigned_agent_user_id
    into existing_customer_id, existing_assigned_agent_id
    from public.customers
    where client_user_id is null
      and actor_email is not null
      and lower(email) = actor_email
    limit 1;

    update public.customers
    set
      client_user_id = actor_id,
      assigned_agent_user_id = case
        when existing_assigned_agent_id is null or existing_assigned_agent_id = actor_id then selected_agent_id
        else existing_assigned_agent_id
      end,
      assigned_advisor_name = case
        when existing_assigned_agent_id is null or existing_assigned_agent_id = actor_id then selected_agent_name
        else assigned_advisor_name
      end,
      full_name = coalesce(nullif(trim(full_name), ''), nullif(trim(customer_payload ->> 'full_name'), ''), actor_name, actor_email),
      phone = coalesce(phone, nullif(trim(customer_payload ->> 'phone'), '')),
      date_of_birth = coalesce(date_of_birth, nullif(customer_payload ->> 'date_of_birth', '')::date),
      risk_profile = coalesce(nullif(risk_profile, ''), nullif(customer_payload ->> 'risk_profile', ''), 'moderate'),
      notes = coalesce(notes, nullif(trim(customer_payload ->> 'notes'), '')),
      client_stage = coalesce(client_stage, 'active'),
      service_status = coalesce(service_status, 'active')
    where id = existing_customer_id
    returning id into portfolio_id;

    return portfolio_id;
  end if;

  insert into public.customers (
    full_name, email, phone, date_of_birth, risk_profile,
    assigned_advisor_name, assigned_agent_user_id, client_user_id,
    client_stage, service_status, notes
  )
  values (
    coalesce(nullif(trim(customer_payload ->> 'full_name'), ''), actor_name, actor_email),
    actor_email,
    nullif(trim(customer_payload ->> 'phone'), ''),
    nullif(customer_payload ->> 'date_of_birth', '')::date,
    coalesce(nullif(customer_payload ->> 'risk_profile', ''), 'moderate'),
    selected_agent_name,
    selected_agent_id,
    actor_id,
    'active',
    'active',
    nullif(trim(customer_payload ->> 'notes'), '')
  )
  returning id into portfolio_id;

  return portfolio_id;
end;
$$;

grant execute on function public.cfp_create_personal_portfolio(jsonb) to authenticated;
