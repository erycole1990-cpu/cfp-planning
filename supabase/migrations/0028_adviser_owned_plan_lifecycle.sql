alter table public.cfp_plan_documents
  drop constraint if exists cfp_plan_documents_status_check;

alter table public.cfp_plan_documents
  add constraint cfp_plan_documents_status_check
  check (status in ('draft', 'in_review', 'approved', 'rejected', 'superseded', 'withdrawn'));

alter table public.cfp_plan_documents
  add column if not exists finalized_by uuid references auth.users(id) on delete set null,
  add column if not exists finalized_by_name text,
  add column if not exists finalized_at timestamptz,
  add column if not exists completeness_status text not null default 'not_checked',
  add column if not exists completeness_checked_by uuid references auth.users(id) on delete set null,
  add column if not exists completeness_checked_by_name text,
  add column if not exists completeness_checked_at timestamptz,
  add column if not exists completeness_notes text;

alter table public.cfp_plan_documents
  drop constraint if exists cfp_plan_documents_completeness_status_check;

alter table public.cfp_plan_documents
  add constraint cfp_plan_documents_completeness_status_check
  check (completeness_status in ('not_checked', 'complete', 'changes_requested'));

create index if not exists cfp_plan_documents_completeness_queue_idx
  on public.cfp_plan_documents(agency_id, completeness_status, finalized_at desc)
  where status = 'approved';

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
);
