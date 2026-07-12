create or replace function public.cfp_create_customer(customer_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := cfp_user_role();
  new_customer_id uuid;
begin
  if actor_id is null or not (cfp_is_admin() or actor_role = 'agent') then
    raise exception 'Only active admins and agents can add customers.' using errcode = '42501';
  end if;

  insert into public.customers (
    full_name,
    email,
    phone,
    date_of_birth,
    nric_passport,
    nationality,
    marital_status,
    number_of_dependents,
    residential_address,
    employment_status,
    occupation,
    employer_name,
    monthly_income_range,
    source_of_funds,
    source_of_wealth,
    risk_profile,
    assigned_advisor_name,
    assigned_agent_user_id,
    client_stage,
    notes
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
    nullif(customer_payload ->> 'assigned_advisor_name', ''),
    coalesce(nullif(customer_payload ->> 'assigned_agent_user_id', '')::uuid, actor_id),
    coalesce(nullif(customer_payload ->> 'client_stage', ''), 'lead'),
    nullif(customer_payload ->> 'notes', '')
  )
  returning id into new_customer_id;

  return new_customer_id;
end;
$$;

grant execute on function public.cfp_create_customer(jsonb) to authenticated;
