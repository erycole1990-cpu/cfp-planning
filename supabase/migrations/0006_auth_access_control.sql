create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null default 'client' check (role in ('admin', 'agent', 'client')),
  status text not null default 'pending' check (status in ('active', 'pending', 'inactive')),
  created_at timestamptz not null default now()
);

create or replace function cfp_user_role()
returns text
language sql
security definer
stable
as $$
  select role from public.user_profiles where id = auth.uid() and status = 'active'
$$;

create or replace function cfp_is_admin()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(cfp_user_role() = 'admin', false)
$$;

alter table user_profiles enable row level security;
drop policy if exists "user_profiles_read_own_or_service" on user_profiles;
create policy "user_profiles_read_own_or_service" on user_profiles for select to authenticated using (
  id = auth.uid() or cfp_is_admin()
);
drop policy if exists "user_profiles_write_service" on user_profiles;
create policy "user_profiles_write_service" on user_profiles for all to authenticated using (
  cfp_is_admin()
) with check (cfp_is_admin());

alter table customers
  add column if not exists assigned_agent_user_id uuid references user_profiles(id) on delete set null,
  add column if not exists client_user_id uuid references user_profiles(id) on delete set null,
  add column if not exists client_stage text not null default 'active' check (client_stage in ('lead', 'active', 'inactive'));

create index if not exists customers_assigned_agent_user_idx on customers(assigned_agent_user_id);
create index if not exists customers_client_user_idx on customers(client_user_id);
create index if not exists customers_email_idx on customers(lower(email));

create table if not exists pending_client_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  customer_id uuid not null references customers(id) on delete cascade,
  submitted_by_user_id uuid references user_profiles(id) on delete set null,
  submission_type text not null,
  payload jsonb not null,
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  reviewed_by_user_id uuid references user_profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text
);

alter table pending_client_submissions enable row level security;
drop policy if exists "pending_client_submissions_read" on pending_client_submissions;
drop policy if exists "pending_client_submissions_write" on pending_client_submissions;

create index if not exists pending_client_submissions_customer_idx on pending_client_submissions(customer_id);
create index if not exists pending_client_submissions_status_idx on pending_client_submissions(review_status);

create or replace function cfp_can_access_customer(customer_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.customers c
    where c.id = customer_id
      and (
        cfp_is_admin()
        or c.assigned_agent_user_id = auth.uid()
        or c.client_user_id = auth.uid()
        or lower(c.email) = lower(auth.jwt() ->> 'email')
      )
  )
$$;

drop policy if exists "customers_v1_read" on customers;
drop policy if exists "customers_v1_write" on customers;
create policy "customers_role_read" on customers for select to authenticated using (cfp_can_access_customer(id));
create policy "customers_role_insert" on customers for insert to authenticated with check (cfp_is_admin() or cfp_user_role() = 'agent');
create policy "customers_role_update" on customers for update to authenticated using (cfp_can_access_customer(id)) with check (cfp_can_access_customer(id));
create policy "customers_role_delete" on customers for delete to authenticated using (cfp_is_admin());

drop policy if exists "financial_goals_v1_read" on financial_goals;
drop policy if exists "financial_goals_v1_write" on financial_goals;
create policy "financial_goals_role_read" on financial_goals for select to authenticated using (cfp_can_access_customer(customer_id));
create policy "financial_goals_role_write" on financial_goals for all to authenticated using (cfp_can_access_customer(customer_id) and cfp_user_role() in ('admin', 'agent')) with check (cfp_can_access_customer(customer_id) and cfp_user_role() in ('admin', 'agent'));

drop policy if exists "goal_progress_logs_v1_read" on goal_progress_logs;
drop policy if exists "goal_progress_logs_v1_write" on goal_progress_logs;
create policy "goal_progress_logs_role_read" on goal_progress_logs for select to authenticated using (
  exists (select 1 from financial_goals g where g.id = goal_id and cfp_can_access_customer(g.customer_id))
);
create policy "goal_progress_logs_role_write" on goal_progress_logs for all to authenticated using (
  cfp_user_role() in ('admin', 'agent') and exists (select 1 from financial_goals g where g.id = goal_id and cfp_can_access_customer(g.customer_id))
) with check (
  cfp_user_role() in ('admin', 'agent') and exists (select 1 from financial_goals g where g.id = goal_id and cfp_can_access_customer(g.customer_id))
);

drop policy if exists "next_step_actions_v1_read" on next_step_actions;
drop policy if exists "next_step_actions_v1_write" on next_step_actions;
create policy "next_step_actions_role_read" on next_step_actions for select to authenticated using (cfp_can_access_customer(customer_id));
create policy "next_step_actions_role_write" on next_step_actions for all to authenticated using (cfp_can_access_customer(customer_id) and cfp_user_role() in ('admin', 'agent')) with check (cfp_can_access_customer(customer_id) and cfp_user_role() in ('admin', 'agent'));

drop policy if exists "financial_statement_items_v1_read" on financial_statement_items;
drop policy if exists "financial_statement_items_v1_write" on financial_statement_items;
create policy "financial_statement_items_role_read" on financial_statement_items for select to authenticated using (cfp_can_access_customer(customer_id));
create policy "financial_statement_items_role_write" on financial_statement_items for all to authenticated using (cfp_can_access_customer(customer_id) and cfp_user_role() in ('admin', 'agent')) with check (cfp_can_access_customer(customer_id) and cfp_user_role() in ('admin', 'agent'));

create policy "pending_client_submissions_role_read" on pending_client_submissions for select to authenticated using (
  cfp_is_admin() or submitted_by_user_id = auth.uid() or cfp_can_access_customer(customer_id)
);
create policy "pending_client_submissions_role_insert" on pending_client_submissions for insert to authenticated with check (
  submitted_by_user_id = auth.uid() and cfp_can_access_customer(customer_id)
);
create policy "pending_client_submissions_role_update" on pending_client_submissions for update to authenticated using (cfp_is_admin()) with check (cfp_is_admin());

drop policy if exists "audit_logs_v1_read" on audit_logs;
drop policy if exists "audit_logs_v1_write" on audit_logs;
create policy "audit_logs_admin_read" on audit_logs for select to authenticated using (cfp_is_admin());
