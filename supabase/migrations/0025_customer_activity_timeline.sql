alter table public.audit_logs
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

create index if not exists audit_logs_agency_customer_created_idx
  on public.audit_logs(agency_id, customer_id, created_at desc);

create or replace function public.cfp_try_uuid(value text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  return value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

update public.audit_logs audit
set customer_id = case
  when audit.entity_type = 'customers' then audit.entity_id
  else public.cfp_try_uuid(audit.payload ->> 'customer_id')
end
where audit.customer_id is null
  and (audit.entity_type = 'customers' or audit.payload ? 'customer_id');

update public.audit_logs audit
set customer_id = goal.customer_id
from public.financial_goals goal
where audit.customer_id is null
  and audit.entity_type = 'financial_goals'
  and goal.id = audit.entity_id;

update public.audit_logs audit
set customer_id = goal.customer_id
from public.goal_progress_logs progress
join public.financial_goals goal on goal.id = progress.goal_id
where audit.customer_id is null
  and audit.entity_type = 'goal_progress_logs'
  and progress.id = audit.entity_id;

update public.audit_logs audit
set customer_id = action.customer_id
from public.next_step_actions action
where audit.customer_id is null
  and audit.entity_type = 'next_step_actions'
  and action.id = audit.entity_id;

update public.audit_logs audit
set customer_id = item.customer_id
from public.financial_statement_items item
where audit.customer_id is null
  and audit.entity_type = 'financial_statement_items'
  and item.id = audit.entity_id;

update public.audit_logs audit
set customer_id = submission.customer_id
from public.pending_client_submissions submission
where audit.customer_id is null
  and audit.entity_type = 'pending_client_submissions'
  and submission.id = audit.entity_id;

create or replace function public.cfp_prepare_audit_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_agency uuid;
begin
  if new.customer_id is null then
    if new.entity_type = 'customers' then
      new.customer_id := new.entity_id;
    else
      new.customer_id := public.cfp_try_uuid(new.payload ->> 'customer_id');
    end if;
  end if;

  if new.customer_id is null and new.entity_type = 'financial_goals' then
    select customer_id into new.customer_id from public.financial_goals where id = new.entity_id;
  elsif new.customer_id is null and new.entity_type = 'goal_progress_logs' then
    select goal.customer_id into new.customer_id
    from public.goal_progress_logs progress
    join public.financial_goals goal on goal.id = progress.goal_id
    where progress.id = new.entity_id;
  elsif new.customer_id is null and new.entity_type = 'next_step_actions' then
    select customer_id into new.customer_id from public.next_step_actions where id = new.entity_id;
  elsif new.customer_id is null and new.entity_type = 'financial_statement_items' then
    select customer_id into new.customer_id from public.financial_statement_items where id = new.entity_id;
  elsif new.customer_id is null and new.entity_type = 'pending_client_submissions' then
    select customer_id into new.customer_id from public.pending_client_submissions where id = new.entity_id;
  end if;

  if new.customer_id is not null then
    select agency_id into target_agency from public.customers where id = new.customer_id;
    if target_agency is null then
      raise exception 'Audit event references a customer that does not exist.';
    end if;
    if new.agency_id is distinct from target_agency then
      raise exception 'Audit event cannot cross customer agencies.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists audit_logs_prepare_customer on public.audit_logs;
create trigger audit_logs_prepare_customer
before insert or update of agency_id, customer_id, entity_type, entity_id, payload on public.audit_logs
for each row execute function public.cfp_prepare_audit_customer();

drop policy if exists "audit_logs_admin_read" on public.audit_logs;
drop policy if exists "audit_logs_customer_access_read" on public.audit_logs;
create policy "audit_logs_customer_access_read" on public.audit_logs
for select to authenticated using (
  agency_id = public.cfp_current_agency_id()
  and (
    public.cfp_is_agency_admin(agency_id)
    or (customer_id is not null and public.cfp_can_access_customer(customer_id))
  )
);
