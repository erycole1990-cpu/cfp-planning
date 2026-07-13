-- A staff login may also own one personal planning portfolio. Personal records
-- remain client-owned and must be reviewed by a different active staff member.

create unique index if not exists customers_one_personal_portfolio_idx
  on public.customers (client_user_id)
  where client_user_id is not null;

create or replace function public.cfp_is_personal_customer(customer_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.customers c
    where c.id = customer_id
      and c.client_user_id = auth.uid()
  )
$$;

create or replace function public.cfp_can_manage_customer(customer_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.customers c
    where c.id = customer_id
      and c.client_user_id is distinct from auth.uid()
      and (
        cfp_is_admin()
        or (cfp_user_role() = 'agent' and c.assigned_agent_user_id = auth.uid())
      )
  )
$$;

create or replace function public.cfp_can_manage_goal(goal_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.financial_goals g
    where g.id = goal_id
      and cfp_can_manage_customer(g.customer_id)
  )
$$;

create or replace function public.cfp_can_review_submission(submission_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.pending_client_submissions s
    where s.id = submission_id
      and s.submitted_by_user_id is distinct from auth.uid()
      and cfp_can_manage_customer(s.customer_id)
  )
$$;

create or replace function public.cfp_guard_submission_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.review_status <> 'pending' then
    raise exception 'This submission has already been reviewed.' using errcode = '23514';
  end if;

  if old.submitted_by_user_id = auth.uid() then
    raise exception 'You cannot review your own submission.' using errcode = '42501';
  end if;

  if new.review_status not in ('approved', 'rejected') then
    raise exception 'Choose approved or rejected when reviewing a submission.' using errcode = '23514';
  end if;

  new.reviewed_by_user_id := auth.uid();
  new.reviewed_at := now();
  return new;
end;
$$;

drop trigger if exists pending_client_submissions_guard_review on public.pending_client_submissions;
create trigger pending_client_submissions_guard_review
before update of review_status on public.pending_client_submissions
for each row
when (old.review_status is distinct from new.review_status)
execute function public.cfp_guard_submission_review();

drop policy if exists "pending_client_submissions_role_read" on public.pending_client_submissions;
drop policy if exists "pending_client_submissions_role_insert" on public.pending_client_submissions;
drop policy if exists "pending_client_submissions_role_update" on public.pending_client_submissions;

create policy "pending_client_submissions_role_read"
on public.pending_client_submissions for select to authenticated using (
  submitted_by_user_id = auth.uid()
  or cfp_can_manage_customer(customer_id)
);

create policy "pending_client_submissions_role_insert"
on public.pending_client_submissions for insert to authenticated with check (
  submitted_by_user_id = auth.uid()
  and cfp_is_personal_customer(customer_id)
);

create policy "pending_client_submissions_role_update"
on public.pending_client_submissions for update to authenticated
using (cfp_can_review_submission(id))
with check (submitted_by_user_id is distinct from auth.uid());

drop policy if exists "customers_role_update" on public.customers;
create policy "customers_role_update"
on public.customers for update to authenticated
using (cfp_can_manage_customer(id))
with check (cfp_can_manage_customer(id));

drop policy if exists "customers_role_insert" on public.customers;
create policy "customers_role_insert"
on public.customers for insert to authenticated with check (
  client_user_id is distinct from auth.uid()
  and (
    cfp_is_admin()
    or (
      cfp_user_role() = 'agent'
      and assigned_agent_user_id = auth.uid()
    )
  )
);

drop policy if exists "customers_role_delete" on public.customers;
create policy "customers_role_delete"
on public.customers for delete to authenticated using (
  cfp_can_manage_customer(id)
  and cfp_is_admin()
);

drop policy if exists "financial_goals_role_write" on public.financial_goals;
create policy "financial_goals_role_write"
on public.financial_goals for all to authenticated
using (cfp_can_manage_customer(customer_id))
with check (cfp_can_manage_customer(customer_id));

drop policy if exists "goal_progress_logs_role_write" on public.goal_progress_logs;
create policy "goal_progress_logs_role_write"
on public.goal_progress_logs for all to authenticated
using (cfp_can_manage_goal(goal_id))
with check (cfp_can_manage_goal(goal_id));

drop policy if exists "next_step_actions_role_write" on public.next_step_actions;
create policy "next_step_actions_role_write"
on public.next_step_actions for all to authenticated
using (cfp_can_manage_customer(customer_id))
with check (cfp_can_manage_customer(customer_id));

drop policy if exists "financial_statement_items_role_write" on public.financial_statement_items;
create policy "financial_statement_items_role_write"
on public.financial_statement_items for all to authenticated
using (cfp_can_manage_customer(customer_id))
with check (cfp_can_manage_customer(customer_id));

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
  new_customer_id uuid;
begin
  if actor_id is null or cfp_user_role() not in ('admin', 'agent', 'client') then
    raise exception 'An active login is required.' using errcode = '42501';
  end if;

  if selected_agent_id is null or selected_agent_id = actor_id then
    raise exception 'Choose a different approved advisor for your personal plan.' using errcode = '42501';
  end if;

  if exists (select 1 from public.customers where client_user_id = actor_id) then
    raise exception 'This login already has a personal portfolio.' using errcode = '23505';
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
  returning id into new_customer_id;

  return new_customer_id;
end;
$$;

grant execute on function public.cfp_create_personal_portfolio(jsonb) to authenticated;

create or replace function public.cfp_list_personal_advisors()
returns table (id uuid, full_name text)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null or cfp_user_role() not in ('admin', 'agent', 'client') then
    raise exception 'An active login is required.' using errcode = '42501';
  end if;

  return query
  select p.id, coalesce(nullif(trim(p.full_name), ''), 'Advisor')
  from public.user_profiles p
  where p.role = 'agent'
    and p.status = 'active'
    and p.id is distinct from auth.uid()
  order by coalesce(nullif(trim(p.full_name), ''), 'Advisor');
end;
$$;

grant execute on function public.cfp_list_personal_advisors() to authenticated;
