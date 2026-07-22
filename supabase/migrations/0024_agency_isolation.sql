-- Establish an explicit agency boundary before the application is opened to
-- additional firms. Existing records remain in the original CFP Planning agency.

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.agencies (id, name, slug, status)
values (
  '00000000-0000-0000-0000-000000000001',
  'CFP Planning',
  'cfp-planning',
  'active'
)
on conflict (id) do update
set name = excluded.name,
    slug = excluded.slug,
    status = excluded.status,
    updated_at = now();

alter table public.user_profiles
  add column if not exists agency_id uuid references public.agencies(id);
alter table public.customers
  add column if not exists agency_id uuid references public.agencies(id);
alter table public.audit_logs
  add column if not exists agency_id uuid references public.agencies(id);
alter table public.notifications
  add column if not exists agency_id uuid references public.agencies(id);
alter table public.privacy_consents
  add column if not exists agency_id uuid references public.agencies(id);
alter table public.privacy_requests
  add column if not exists agency_id uuid references public.agencies(id);

update public.user_profiles
set agency_id = '00000000-0000-0000-0000-000000000001'
where agency_id is null;

update public.customers
set agency_id = coalesce(
  (
    select p.agency_id
    from public.user_profiles p
    where p.id = customers.assigned_agent_user_id
  ),
  (
    select p.agency_id
    from public.user_profiles p
    where p.id = customers.client_user_id
  ),
  '00000000-0000-0000-0000-000000000001'::uuid
)
where agency_id is null;

update public.audit_logs
set agency_id = coalesce(
  (
    select p.agency_id
    from public.user_profiles p
    where p.id = audit_logs.user_id
  ),
  '00000000-0000-0000-0000-000000000001'::uuid
)
where agency_id is null;

update public.notifications
set agency_id = coalesce(
  (
    select c.agency_id
    from public.customers c
    where c.id = notifications.customer_id
  ),
  (
    select p.agency_id
    from public.user_profiles p
    where p.id = notifications.recipient_user_id
  ),
  '00000000-0000-0000-0000-000000000001'::uuid
)
where agency_id is null;

update public.privacy_consents
set agency_id = coalesce(
  (
    select p.agency_id
    from public.user_profiles p
    where p.id = privacy_consents.user_id
  ),
  '00000000-0000-0000-0000-000000000001'::uuid
)
where agency_id is null;

update public.privacy_requests
set agency_id = coalesce(
  (
    select p.agency_id
    from public.user_profiles p
    where p.id = privacy_requests.user_id
  ),
  '00000000-0000-0000-0000-000000000001'::uuid
)
where agency_id is null;

alter table public.user_profiles alter column agency_id set not null;
alter table public.user_profiles
  alter column agency_id set default '00000000-0000-0000-0000-000000000001'::uuid;
alter table public.customers alter column agency_id set not null;
alter table public.audit_logs alter column agency_id set not null;
alter table public.notifications alter column agency_id set not null;
alter table public.privacy_consents alter column agency_id set not null;
alter table public.privacy_requests alter column agency_id set not null;

create table if not exists public.agency_memberships (
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  role text not null check (role in ('admin', 'agent', 'client')),
  status text not null default 'pending' check (status in ('active', 'pending', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (agency_id, user_id)
);

insert into public.agency_memberships (agency_id, user_id, role, status)
select agency_id, id, role, status
from public.user_profiles
on conflict (agency_id, user_id) do update
set role = excluded.role,
    status = excluded.status,
    updated_at = now();

create index if not exists user_profiles_agency_idx
  on public.user_profiles(agency_id, role, status);
create index if not exists customers_agency_idx
  on public.customers(agency_id, service_status, assigned_agent_user_id);
create index if not exists audit_logs_agency_created_idx
  on public.audit_logs(agency_id, created_at desc);
create index if not exists notifications_agency_recipient_idx
  on public.notifications(agency_id, recipient_user_id, created_at desc);
create index if not exists privacy_consents_agency_idx
  on public.privacy_consents(agency_id, user_id, accepted_at desc);
create index if not exists privacy_requests_agency_idx
  on public.privacy_requests(agency_id, status, created_at desc);

create or replace function public.cfp_current_agency_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.agency_id
  from public.user_profiles p
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function public.cfp_is_agency_member(requested_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.agency_memberships m
    where m.agency_id = requested_agency_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.cfp_is_agency_admin(requested_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.agency_memberships m
    where m.agency_id = requested_agency_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
      and m.status = 'active'
  );
$$;

create or replace function public.cfp_can_access_customer(customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.customers c
    where c.id = $1
      and c.agency_id = public.cfp_current_agency_id()
      and (
        public.cfp_is_agency_admin(c.agency_id)
        or c.assigned_agent_user_id = auth.uid()
        or c.client_user_id = auth.uid()
        or (
          public.cfp_user_role() = 'client'
          and lower(coalesce(c.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      )
  );
$$;

create or replace function public.cfp_can_manage_customer(customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.customers c
    where c.id = $1
      and c.agency_id = public.cfp_current_agency_id()
      and c.client_user_id is distinct from auth.uid()
      and (
        public.cfp_is_agency_admin(c.agency_id)
        or (
          public.cfp_user_role() = 'agent'
          and c.assigned_agent_user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.cfp_can_manage_goal(goal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.financial_goals g
    where g.id = $1
      and public.cfp_can_manage_customer(g.customer_id)
  );
$$;

create or replace function public.cfp_can_review_submission(submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pending_client_submissions s
    where s.id = $1
      and public.cfp_can_manage_customer(s.customer_id)
  );
$$;

create or replace function public.cfp_sync_agency_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.agency_memberships (agency_id, user_id, role, status)
  values (new.agency_id, new.id, new.role, new.status)
  on conflict (agency_id, user_id) do update
  set role = excluded.role,
      status = excluded.status,
      updated_at = now();

  if tg_op = 'UPDATE' and old.agency_id is distinct from new.agency_id then
    delete from public.agency_memberships
    where agency_id = old.agency_id and user_id = old.id;
  end if;
  return new;
end;
$$;

drop trigger if exists user_profiles_sync_agency_membership on public.user_profiles;
create trigger user_profiles_sync_agency_membership
after insert or update of agency_id, role, status on public.user_profiles
for each row execute function public.cfp_sync_agency_membership();

create or replace function public.cfp_guard_customer_agency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_agency uuid;
begin
  current_agency := public.cfp_current_agency_id();
  new.agency_id := coalesce(new.agency_id, current_agency);

  if auth.uid() is not null and new.agency_id is distinct from current_agency then
    raise exception 'Customer must remain inside the signed-in user agency.';
  end if;

  if tg_op = 'UPDATE' and old.agency_id is distinct from new.agency_id then
    raise exception 'Customer agency cannot be changed directly.';
  end if;

  if new.assigned_agent_user_id is not null and not exists (
    select 1 from public.user_profiles p
    where p.id = new.assigned_agent_user_id
      and p.agency_id = new.agency_id
      and p.role = 'agent'
      and p.status = 'active'
  ) then
    raise exception 'Assigned adviser must be active in the same agency.';
  end if;

  if new.requested_agent_user_id is not null and not exists (
    select 1 from public.user_profiles p
    where p.id = new.requested_agent_user_id
      and p.agency_id = new.agency_id
      and p.role = 'agent'
      and p.status = 'active'
  ) then
    raise exception 'Requested adviser must be active in the same agency.';
  end if;

  if new.client_user_id is not null and not exists (
    select 1 from public.user_profiles p
    where p.id = new.client_user_id
      and p.agency_id = new.agency_id
      and p.status = 'active'
  ) then
    raise exception 'Client login must belong to the same agency.';
  end if;

  return new;
end;
$$;

drop trigger if exists customers_guard_agency on public.customers;
create trigger customers_guard_agency
before insert or update of agency_id, assigned_agent_user_id, requested_agent_user_id, client_user_id
on public.customers for each row execute function public.cfp_guard_customer_agency();

create or replace function public.cfp_prepare_audit_agency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.agency_id := coalesce(new.agency_id, public.cfp_current_agency_id());
  if new.agency_id is null then
    raise exception 'Audit event requires an agency.';
  end if;
  if auth.uid() is not null and new.agency_id is distinct from public.cfp_current_agency_id() then
    raise exception 'Audit event cannot cross agencies.';
  end if;
  return new;
end;
$$;

drop trigger if exists audit_logs_prepare_agency on public.audit_logs;
create trigger audit_logs_prepare_agency
before insert or update of agency_id on public.audit_logs
for each row execute function public.cfp_prepare_audit_agency();

create or replace function public.cfp_prepare_notification_agency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_agency uuid;
begin
  select p.agency_id into recipient_agency
  from public.user_profiles p
  where p.id = new.recipient_user_id;

  new.agency_id := coalesce(
    new.agency_id,
    (select c.agency_id from public.customers c where c.id = new.customer_id),
    recipient_agency,
    public.cfp_current_agency_id()
  );

  -- Some older functions notify every admin. Silently skip admins from other
  -- agencies until those functions are replaced by agency-aware versions.
  if recipient_agency is null or recipient_agency is distinct from new.agency_id then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_prepare_agency on public.notifications;
create trigger notifications_prepare_agency
before insert or update of agency_id, recipient_user_id, customer_id on public.notifications
for each row execute function public.cfp_prepare_notification_agency();

create or replace function public.cfp_prepare_privacy_agency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_agency uuid;
begin
  select p.agency_id into owner_agency
  from public.user_profiles p
  where p.id = new.user_id;

  new.agency_id := coalesce(new.agency_id, owner_agency, public.cfp_current_agency_id());
  if owner_agency is null or owner_agency is distinct from new.agency_id then
    raise exception 'Privacy record cannot cross agencies.';
  end if;
  return new;
end;
$$;

drop trigger if exists privacy_consents_prepare_agency on public.privacy_consents;
create trigger privacy_consents_prepare_agency
before insert or update of agency_id, user_id on public.privacy_consents
for each row execute function public.cfp_prepare_privacy_agency();

drop trigger if exists privacy_requests_prepare_agency on public.privacy_requests;
create trigger privacy_requests_prepare_agency
before insert or update of agency_id, user_id on public.privacy_requests
for each row execute function public.cfp_prepare_privacy_agency();

alter table public.agencies enable row level security;
alter table public.agency_memberships enable row level security;

drop policy if exists agencies_member_read on public.agencies;
drop policy if exists agencies_admin_update on public.agencies;
create policy agencies_member_read on public.agencies
for select to authenticated using (public.cfp_is_agency_member(id));
create policy agencies_admin_update on public.agencies
for update to authenticated
using (public.cfp_is_agency_admin(id))
with check (public.cfp_is_agency_admin(id));

drop policy if exists agency_memberships_member_read on public.agency_memberships;
drop policy if exists agency_memberships_admin_write on public.agency_memberships;
create policy agency_memberships_member_read on public.agency_memberships
for select to authenticated using (
  user_id = auth.uid() or public.cfp_is_agency_admin(agency_id)
);
create policy agency_memberships_admin_write on public.agency_memberships
for all to authenticated
using (public.cfp_is_agency_admin(agency_id))
with check (public.cfp_is_agency_admin(agency_id));

drop policy if exists "user_profiles_read_own_or_service" on public.user_profiles;
drop policy if exists "user_profiles_write_service" on public.user_profiles;
create policy "user_profiles_read_own_or_service" on public.user_profiles
for select to authenticated using (
  id = auth.uid() or public.cfp_is_agency_admin(agency_id)
);
create policy "user_profiles_write_service" on public.user_profiles
for update to authenticated
using (id = auth.uid() or public.cfp_is_agency_admin(agency_id))
with check (
  agency_id = public.cfp_current_agency_id()
  and (id = auth.uid() or public.cfp_is_agency_admin(agency_id))
);

drop policy if exists "customers_role_insert" on public.customers;
drop policy if exists "customers_role_delete" on public.customers;
create policy "customers_role_insert" on public.customers
for insert to authenticated with check (
  agency_id = public.cfp_current_agency_id()
  and client_user_id is distinct from auth.uid()
  and (
    public.cfp_is_agency_admin(agency_id)
    or (
      public.cfp_user_role() = 'agent'
      and assigned_agent_user_id = auth.uid()
    )
  )
);
create policy "customers_role_delete" on public.customers
for delete to authenticated using (
  agency_id = public.cfp_current_agency_id()
  and public.cfp_is_agency_admin(agency_id)
);

drop policy if exists "audit_logs_admin_read" on public.audit_logs;
drop policy if exists "audit_logs_authenticated_write" on public.audit_logs;
drop policy if exists "audit_logs_admin_write" on public.audit_logs;
create policy "audit_logs_admin_read" on public.audit_logs
for select to authenticated using (
  agency_id = public.cfp_current_agency_id()
  and public.cfp_is_agency_admin(agency_id)
);
create policy "audit_logs_authenticated_write" on public.audit_logs
for insert to authenticated with check (
  agency_id = public.cfp_current_agency_id()
  and public.cfp_is_agency_member(agency_id)
);

drop policy if exists notifications_read_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_read_own on public.notifications
for select to authenticated using (
  recipient_user_id = auth.uid()
  and agency_id = public.cfp_current_agency_id()
);
create policy notifications_update_own on public.notifications
for update to authenticated
using (recipient_user_id = auth.uid() and agency_id = public.cfp_current_agency_id())
with check (recipient_user_id = auth.uid() and agency_id = public.cfp_current_agency_id());

drop policy if exists "privacy_consents_own_read" on public.privacy_consents;
drop policy if exists "privacy_consents_own_write" on public.privacy_consents;
drop policy if exists "privacy_consents_own_update" on public.privacy_consents;
create policy "privacy_consents_own_read" on public.privacy_consents
for select to authenticated using (
  agency_id = public.cfp_current_agency_id()
  and (user_id = auth.uid() or public.cfp_is_agency_admin(agency_id))
);
create policy "privacy_consents_own_write" on public.privacy_consents
for insert to authenticated with check (
  user_id = auth.uid() and agency_id = public.cfp_current_agency_id()
);
create policy "privacy_consents_own_update" on public.privacy_consents
for update to authenticated
using (user_id = auth.uid() and agency_id = public.cfp_current_agency_id())
with check (user_id = auth.uid() and agency_id = public.cfp_current_agency_id());

drop policy if exists "privacy_requests_own_read" on public.privacy_requests;
drop policy if exists "privacy_requests_own_insert" on public.privacy_requests;
drop policy if exists "privacy_requests_admin_update" on public.privacy_requests;
create policy "privacy_requests_own_read" on public.privacy_requests
for select to authenticated using (
  agency_id = public.cfp_current_agency_id()
  and (user_id = auth.uid() or public.cfp_is_agency_admin(agency_id))
);
create policy "privacy_requests_own_insert" on public.privacy_requests
for insert to authenticated with check (
  user_id = auth.uid() and agency_id = public.cfp_current_agency_id()
);
create policy "privacy_requests_admin_update" on public.privacy_requests
for update to authenticated
using (agency_id = public.cfp_current_agency_id() and public.cfp_is_agency_admin(agency_id))
with check (agency_id = public.cfp_current_agency_id() and public.cfp_is_agency_admin(agency_id));

drop policy if exists "goal_ai_insights_v1_read" on public.goal_ai_insights;
drop policy if exists "goal_ai_insights_v1_write" on public.goal_ai_insights;
create policy "goal_ai_insights_role_read" on public.goal_ai_insights
for select to authenticated using (public.cfp_can_manage_goal(goal_id));
create policy "goal_ai_insights_role_write" on public.goal_ai_insights
for all to authenticated
using (public.cfp_can_manage_goal(goal_id))
with check (public.cfp_can_manage_goal(goal_id));

create or replace function public.cfp_list_personal_advisors()
returns table (
  id uuid,
  full_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, coalesce(nullif(trim(p.full_name), ''), p.email)
  from public.user_profiles p
  where p.agency_id = public.cfp_current_agency_id()
    and p.role = 'agent'
    and p.status = 'active'
    and p.id is distinct from auth.uid()
  order by coalesce(nullif(trim(p.full_name), ''), p.email);
$$;

grant select on public.agencies to authenticated;
grant select on public.agency_memberships to authenticated;
grant execute on function public.cfp_current_agency_id() to authenticated;
grant execute on function public.cfp_is_agency_member(uuid) to authenticated;
grant execute on function public.cfp_is_agency_admin(uuid) to authenticated;
grant execute on function public.cfp_list_personal_advisors() to authenticated;
