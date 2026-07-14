alter table public.user_profiles
  add column if not exists advisor_code text,
  add column if not exists accepting_new_clients boolean not null default true;

create unique index if not exists user_profiles_advisor_code_unique_idx
  on public.user_profiles (upper(advisor_code))
  where advisor_code is not null;

update public.user_profiles
set advisor_code = 'ADV-' || upper(left(replace(id::text, '-', ''), 8))
where role = 'agent'
  and advisor_code is null;

create or replace function public.cfp_set_advisor_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'agent' and new.advisor_code is null then
    new.advisor_code := 'ADV-' || upper(left(replace(new.id::text, '-', ''), 8));
  end if;
  return new;
end;
$$;

drop trigger if exists user_profiles_set_advisor_code on public.user_profiles;
create trigger user_profiles_set_advisor_code
before insert or update of role on public.user_profiles
for each row execute function public.cfp_set_advisor_code();

alter table public.customers
  add column if not exists requested_agent_user_id uuid references public.user_profiles(id) on delete set null,
  add column if not exists advisor_request_status text not null default 'not_required';

alter table public.customers
  drop constraint if exists customers_advisor_request_status_check;
alter table public.customers
  add constraint customers_advisor_request_status_check
  check (advisor_request_status in ('not_required', 'pending', 'accepted', 'declined', 'unassigned'));

create index if not exists customers_requested_agent_idx
  on public.customers (requested_agent_user_id, advisor_request_status);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  notification_type text not null check (notification_type in (
    'submission_received',
    'submission_approved',
    'submission_rejected',
    'advisor_requested',
    'advisor_assigned',
    'advisor_request_declined',
    'intake_created'
  )),
  title text not null,
  body text not null,
  customer_id uuid references public.customers(id) on delete cascade,
  submission_id uuid references public.pending_client_submissions(id) on delete cascade,
  href text not null default '/',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_user_id, created_at desc);
create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_user_id, created_at desc)
  where read_at is null;
create unique index if not exists notifications_submission_dedupe_idx
  on public.notifications (recipient_user_id, notification_type, submission_id)
  where submission_id is not null;

alter table public.notifications enable row level security;
drop policy if exists notifications_read_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_read_own on public.notifications
  for select to authenticated using (recipient_user_id = auth.uid());
create policy notifications_update_own on public.notifications
  for update to authenticated using (recipient_user_id = auth.uid())
  with check (recipient_user_id = auth.uid());

create or replace function public.cfp_notify_submission_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_name text;
  advisor_id uuid;
begin
  select full_name, assigned_agent_user_id
  into customer_name, advisor_id
  from public.customers
  where id = new.customer_id;

  if advisor_id is not null and advisor_id is distinct from new.submitted_by_user_id then
    insert into public.notifications (
      recipient_user_id, actor_user_id, notification_type, title, body,
      customer_id, submission_id, href
    ) values (
      advisor_id, new.submitted_by_user_id, 'submission_received',
      'Personal plan update waiting',
      coalesce(customer_name, 'A client') || ' submitted an update for your review.',
      new.customer_id, new.id, '/reviews'
    ) on conflict do nothing;
  else
    insert into public.notifications (
      recipient_user_id, actor_user_id, notification_type, title, body,
      customer_id, submission_id, href
    )
    select
      profile.id, new.submitted_by_user_id, 'submission_received',
      'Unassigned plan update waiting',
      coalesce(customer_name, 'A client') || ' submitted an update that needs admin review.',
      new.customer_id, new.id, '/reviews'
    from public.user_profiles profile
    where profile.role = 'admin'
      and profile.status = 'active'
      and profile.id is distinct from new.submitted_by_user_id
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists pending_submission_notify_insert on public.pending_client_submissions;
create trigger pending_submission_notify_insert
after insert on public.pending_client_submissions
for each row execute function public.cfp_notify_submission_created();

create or replace function public.cfp_notify_submission_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_name text;
begin
  if old.review_status = 'pending' and new.review_status in ('approved', 'rejected')
     and new.submitted_by_user_id is not null then
    select full_name into customer_name from public.customers where id = new.customer_id;
    insert into public.notifications (
      recipient_user_id, actor_user_id, notification_type, title, body,
      customer_id, submission_id, href
    ) values (
      new.submitted_by_user_id,
      coalesce(new.reviewed_by_user_id, auth.uid()),
      case when new.review_status = 'approved' then 'submission_approved' else 'submission_rejected' end,
      case when new.review_status = 'approved' then 'Plan update approved' else 'Plan update needs changes' end,
      coalesce(customer_name, 'Your plan') || case
        when new.review_status = 'approved' then ' was updated after adviser review.'
        else ' was not changed. Review the adviser note before submitting again.'
      end,
      new.customer_id,
      new.id,
      '/my-plan'
    ) on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists pending_submission_notify_decision on public.pending_client_submissions;
create trigger pending_submission_notify_decision
after update of review_status on public.pending_client_submissions
for each row execute function public.cfp_notify_submission_decision();

create or replace function public.cfp_update_advisor_preferences(
  requested_accepting_new_clients boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.cfp_user_role() <> 'agent' then
    raise exception 'Only active advisers can update this preference.' using errcode = '42501';
  end if;
  update public.user_profiles
  set accepting_new_clients = requested_accepting_new_clients,
      updated_at = now()
  where id = auth.uid();
end;
$$;

grant execute on function public.cfp_update_advisor_preferences(boolean) to authenticated;

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
  referral_code text := upper(nullif(trim(customer_payload ->> 'advisor_code'), ''));
  requested_agent_id uuid;
  requested_agent_name text;
  existing_customer_id uuid;
  existing_assigned_agent_id uuid;
  matching_customer_count integer;
  portfolio_id uuid;
begin
  if actor_id is null or public.cfp_user_role() not in ('admin', 'agent', 'client') then
    raise exception 'An active login is required.' using errcode = '42501';
  end if;

  select id into portfolio_id
  from public.customers
  where client_user_id = actor_id
  limit 1;
  if portfolio_id is not null then return portfolio_id; end if;

  if referral_code is not null then
    select id, full_name into requested_agent_id, requested_agent_name
    from public.user_profiles
    where upper(advisor_code) = referral_code
      and role = 'agent'
      and status = 'active'
      and accepting_new_clients = true;
    if requested_agent_id is null then
      raise exception 'That adviser code is not available. Check the code or continue without one.' using errcode = '22023';
    end if;
    if requested_agent_id = actor_id then
      raise exception 'You cannot independently review your own personal plan.' using errcode = '42501';
    end if;
  end if;

  select coalesce(nullif(trim(full_name), ''), actor_email)
  into actor_name from public.user_profiles where id = actor_id;

  select count(*) into matching_customer_count
  from public.customers
  where client_user_id is null
    and actor_email is not null
    and lower(email) = actor_email;

  if matching_customer_count > 1 then
    raise exception 'More than one customer record uses this email. Ask an admin to resolve the duplicates first.' using errcode = '23505';
  end if;

  if matching_customer_count = 1 then
    select id, assigned_agent_user_id
    into existing_customer_id, existing_assigned_agent_id
    from public.customers
    where client_user_id is null and lower(email) = actor_email
    limit 1;

    update public.customers
    set client_user_id = actor_id,
        full_name = coalesce(nullif(trim(full_name), ''), nullif(trim(customer_payload ->> 'full_name'), ''), actor_name, actor_email),
        phone = coalesce(phone, nullif(trim(customer_payload ->> 'phone'), '')),
        date_of_birth = coalesce(date_of_birth, nullif(customer_payload ->> 'date_of_birth', '')::date),
        risk_profile = coalesce(nullif(risk_profile, ''), nullif(customer_payload ->> 'risk_profile', ''), 'moderate'),
        notes = coalesce(notes, nullif(trim(customer_payload ->> 'notes'), '')),
        requested_agent_user_id = case
          when existing_assigned_agent_id is not null and existing_assigned_agent_id <> actor_id then existing_assigned_agent_id
          else requested_agent_id
        end,
        assigned_agent_user_id = case
          when existing_assigned_agent_id is not null and existing_assigned_agent_id <> actor_id then existing_assigned_agent_id
          else null
        end,
        assigned_advisor_name = case
          when existing_assigned_agent_id is not null and existing_assigned_agent_id <> actor_id then assigned_advisor_name
          else null
        end,
        advisor_request_status = case
          when existing_assigned_agent_id is not null and existing_assigned_agent_id <> actor_id then 'accepted'
          when requested_agent_id is not null then 'pending'
          else 'unassigned'
        end,
        client_stage = coalesce(client_stage, 'active'),
        service_status = coalesce(service_status, 'active')
    where id = existing_customer_id
    returning id into portfolio_id;

    if existing_assigned_agent_id is not null and existing_assigned_agent_id <> actor_id then
      return portfolio_id;
    end if;
  else
    insert into public.customers (
      full_name, email, phone, date_of_birth, risk_profile,
      assigned_advisor_name, assigned_agent_user_id, requested_agent_user_id,
      advisor_request_status, client_user_id, client_stage, service_status, notes
    ) values (
      coalesce(nullif(trim(customer_payload ->> 'full_name'), ''), actor_name, actor_email),
      actor_email,
      nullif(trim(customer_payload ->> 'phone'), ''),
      nullif(customer_payload ->> 'date_of_birth', '')::date,
      coalesce(nullif(customer_payload ->> 'risk_profile', ''), 'moderate'),
      null, null, requested_agent_id,
      case when requested_agent_id is not null then 'pending' else 'unassigned' end,
      actor_id, 'active', 'active', nullif(trim(customer_payload ->> 'notes'), '')
    ) returning id into portfolio_id;
  end if;

  if requested_agent_id is not null then
    insert into public.notifications (
      recipient_user_id, actor_user_id, notification_type, title, body, customer_id, href
    ) values (
      requested_agent_id, actor_id, 'advisor_requested', 'New personal-plan referral',
      coalesce(actor_name, actor_email, 'A new client') || ' requested you as their independent adviser.',
      portfolio_id, '/reviews'
    );
  else
    insert into public.notifications (
      recipient_user_id, actor_user_id, notification_type, title, body, customer_id, href
    )
    select id, actor_id, 'intake_created', 'New unassigned personal plan',
      coalesce(actor_name, actor_email, 'A new client') || ' needs an independent adviser.',
      portfolio_id, '/reviews'
    from public.user_profiles
    where role = 'admin' and status = 'active' and id <> actor_id;
  end if;

  return portfolio_id;
end;
$$;

grant execute on function public.cfp_create_personal_portfolio(jsonb) to authenticated;

create or replace function public.cfp_list_advisor_requests()
returns table (
  customer_id uuid,
  full_name text,
  email text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.cfp_user_role() <> 'agent' then
    raise exception 'Only an active adviser can view referral requests.' using errcode = '42501';
  end if;

  return query
  select c.id, c.full_name, c.email, c.created_at
  from public.customers c
  where c.requested_agent_user_id = auth.uid()
    and c.advisor_request_status = 'pending'
    and c.client_user_id is distinct from auth.uid()
  order by c.created_at asc;
end;
$$;

grant execute on function public.cfp_list_advisor_requests() to authenticated;

create or replace function public.cfp_accept_advisor_request(requested_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_name text;
  client_id uuid;
  advisor_name text;
begin
  if public.cfp_user_role() <> 'agent' then
    raise exception 'Only an active adviser can accept this request.' using errcode = '42501';
  end if;
  select full_name into advisor_name from public.user_profiles where id = auth.uid();
  update public.customers
  set assigned_agent_user_id = auth.uid(),
      assigned_advisor_name = advisor_name,
      requested_agent_user_id = auth.uid(),
      advisor_request_status = 'accepted'
  where id = requested_customer_id
    and requested_agent_user_id = auth.uid()
    and advisor_request_status = 'pending'
    and client_user_id is distinct from auth.uid()
  returning full_name, client_user_id into customer_name, client_id;
  if not found then
    raise exception 'This referral is no longer available.' using errcode = '42501';
  end if;
  if client_id is not null then
    insert into public.notifications (recipient_user_id, actor_user_id, notification_type, title, body, customer_id, href)
    values (client_id, auth.uid(), 'advisor_assigned', 'Adviser request accepted',
      coalesce(advisor_name, 'Your adviser') || ' accepted your personal-plan request.', requested_customer_id, '/my-plan');
  end if;
end;
$$;

grant execute on function public.cfp_accept_advisor_request(uuid) to authenticated;

create or replace function public.cfp_decline_advisor_request(requested_customer_id uuid, decline_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_name text;
  client_id uuid;
begin
  if public.cfp_user_role() <> 'agent' or nullif(trim(decline_reason), '') is null then
    raise exception 'An active adviser and a decline reason are required.' using errcode = '42501';
  end if;
  update public.customers
  set requested_agent_user_id = null,
      advisor_request_status = 'unassigned'
  where id = requested_customer_id
    and requested_agent_user_id = auth.uid()
    and advisor_request_status = 'pending'
  returning full_name, client_user_id into customer_name, client_id;
  if not found then
    raise exception 'This referral is no longer available.' using errcode = '42501';
  end if;
  if client_id is not null then
    insert into public.notifications (recipient_user_id, actor_user_id, notification_type, title, body, customer_id, href)
    values (client_id, auth.uid(), 'advisor_request_declined', 'Adviser request returned to intake',
      'Your requested adviser could not accept. An admin will help assign another adviser.', requested_customer_id, '/my-plan');
  end if;
  insert into public.notifications (recipient_user_id, actor_user_id, notification_type, title, body, customer_id, href)
  select id, auth.uid(), 'intake_created', 'Referral needs reassignment',
    coalesce(customer_name, 'A client') || ' needs another adviser. Reason: ' || trim(decline_reason),
    requested_customer_id, '/reviews'
  from public.user_profiles
  where role = 'admin' and status = 'active';
end;
$$;

grant execute on function public.cfp_decline_advisor_request(uuid, text) to authenticated;

create or replace function public.cfp_sync_customer_advisor_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_agent_user_id is distinct from old.assigned_agent_user_id then
    if new.assigned_agent_user_id is null then
      if new.advisor_request_status <> 'pending' then
        new.requested_agent_user_id := null;
        new.advisor_request_status := 'unassigned';
      end if;
    else
      new.requested_agent_user_id := new.assigned_agent_user_id;
      new.advisor_request_status := 'accepted';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists customers_sync_advisor_request on public.customers;
create trigger customers_sync_advisor_request
before update of assigned_agent_user_id on public.customers
for each row execute function public.cfp_sync_customer_advisor_request();
