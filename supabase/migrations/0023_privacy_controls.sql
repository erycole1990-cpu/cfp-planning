alter table customers
  add column if not exists retention_review_at timestamptz,
  add column if not exists legal_hold boolean not null default false;

create table if not exists privacy_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notice_version text not null,
  consent_type text not null default 'planning_data_processing',
  accepted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  source text not null default 'application',
  unique (user_id, notice_version, consent_type)
);

create table if not exists privacy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null check (request_type in ('access', 'correction', 'deletion', 'withdrawal')),
  details text,
  status text not null default 'submitted' check (status in ('submitted', 'in_review', 'completed', 'rejected')),
  admin_notes text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists privacy_requests_status_created_idx
  on privacy_requests(status, created_at desc);

create index if not exists customers_retention_review_idx
  on customers(retention_review_at)
  where retention_review_at is not null;

create or replace function cfp_set_customer_retention_review()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.service_status, 'active') <> 'active' and new.service_ended_at is not null then
    new.retention_review_at := coalesce(new.retention_review_at, new.service_ended_at + interval '7 years');
  elsif coalesce(new.service_status, 'active') = 'active' then
    new.retention_review_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists customers_retention_review_trigger on customers;
create trigger customers_retention_review_trigger
before insert or update of service_status, service_ended_at, retention_review_at
on customers
for each row execute function cfp_set_customer_retention_review();

update customers
set retention_review_at = service_ended_at + interval '7 years'
where coalesce(service_status, 'active') <> 'active'
  and service_ended_at is not null
  and retention_review_at is null;

create or replace function cfp_record_privacy_consent(p_notice_version text, p_source text default 'application')
returns privacy_consents
language plpgsql
security definer
set search_path = public
as $$
declare
  consent privacy_consents;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into privacy_consents (user_id, notice_version, source, accepted_at, withdrawn_at)
  values (auth.uid(), p_notice_version, coalesce(nullif(trim(p_source), ''), 'application'), now(), null)
  on conflict (user_id, notice_version, consent_type)
  do update set accepted_at = excluded.accepted_at, source = excluded.source, withdrawn_at = null
  returning * into consent;

  return consent;
end;
$$;

alter table privacy_consents enable row level security;
alter table privacy_requests enable row level security;

drop policy if exists "privacy_consents_own_read" on privacy_consents;
create policy "privacy_consents_own_read" on privacy_consents
for select to authenticated using (user_id = auth.uid() or cfp_is_admin());

drop policy if exists "privacy_consents_own_write" on privacy_consents;
create policy "privacy_consents_own_write" on privacy_consents
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "privacy_consents_own_update" on privacy_consents;
create policy "privacy_consents_own_update" on privacy_consents
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "privacy_requests_own_read" on privacy_requests;
create policy "privacy_requests_own_read" on privacy_requests
for select to authenticated using (user_id = auth.uid() or cfp_is_admin());

drop policy if exists "privacy_requests_own_insert" on privacy_requests;
create policy "privacy_requests_own_insert" on privacy_requests
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "privacy_requests_admin_update" on privacy_requests;
create policy "privacy_requests_admin_update" on privacy_requests
for update to authenticated using (cfp_is_admin()) with check (cfp_is_admin());

grant select, insert, update on privacy_consents to authenticated;
grant select, insert, update on privacy_requests to authenticated;
grant execute on function cfp_record_privacy_consent(text, text) to authenticated;
