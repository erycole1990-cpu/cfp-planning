alter table customers
  add column if not exists service_status text not null default 'active',
  add column if not exists service_ended_at timestamptz,
  add column if not exists service_ended_reason text;

update customers
set service_status = 'active'
where service_status is null;
