create table if not exists public.cfp_plan_documents (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  title text not null,
  status text not null default 'draft'
    check (status in ('draft', 'in_review', 'approved', 'rejected', 'superseded')),
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null,
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, version_number)
);

create index if not exists cfp_plan_documents_customer_version_idx
  on public.cfp_plan_documents(customer_id, version_number desc);

create index if not exists cfp_plan_documents_agency_status_idx
  on public.cfp_plan_documents(agency_id, status, updated_at desc);

create or replace function public.cfp_prepare_plan_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_agency_id uuid;
begin
  select c.agency_id into customer_agency_id
  from public.customers c
  where c.id = new.customer_id;

  if customer_agency_id is null then
    raise exception 'Customer does not belong to an agency';
  end if;

  new.agency_id := customer_agency_id;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists cfp_plan_documents_prepare on public.cfp_plan_documents;
create trigger cfp_plan_documents_prepare
before insert or update on public.cfp_plan_documents
for each row execute function public.cfp_prepare_plan_document();

alter table public.cfp_plan_documents enable row level security;

drop policy if exists "cfp_plan_documents_read" on public.cfp_plan_documents;
create policy "cfp_plan_documents_read"
on public.cfp_plan_documents
for select
to authenticated
using (
  agency_id = public.cfp_current_agency_id()
  and public.cfp_can_access_customer(customer_id)
  and (
    public.cfp_user_role() in ('admin', 'agent')
    or status in ('approved', 'superseded')
  )
);

drop policy if exists "cfp_plan_documents_create" on public.cfp_plan_documents;
create policy "cfp_plan_documents_create"
on public.cfp_plan_documents
for insert
to authenticated
with check (
  agency_id = public.cfp_current_agency_id()
  and public.cfp_user_role() in ('admin', 'agent')
  and public.cfp_can_manage_customer(customer_id)
  and status = 'draft'
);

drop policy if exists "cfp_plan_documents_update" on public.cfp_plan_documents;
create policy "cfp_plan_documents_update"
on public.cfp_plan_documents
for update
to authenticated
using (
  agency_id = public.cfp_current_agency_id()
  and public.cfp_user_role() in ('admin', 'agent')
  and public.cfp_can_manage_customer(customer_id)
)
with check (
  agency_id = public.cfp_current_agency_id()
  and public.cfp_user_role() in ('admin', 'agent')
  and public.cfp_can_manage_customer(customer_id)
  and (
    public.cfp_user_role() = 'admin'
    or status in ('draft', 'in_review', 'rejected')
  )
);

grant select, insert, update on public.cfp_plan_documents to authenticated;
