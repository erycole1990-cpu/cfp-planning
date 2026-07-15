alter table public.notifications
  add column if not exists workflow_status text not null default 'open',
  add column if not exists snoozed_until timestamptz,
  add column if not exists resolved_at timestamptz;

alter table public.notifications
  drop constraint if exists notifications_workflow_status_check;

alter table public.notifications
  add constraint notifications_workflow_status_check
  check (workflow_status in ('open', 'snoozed', 'resolved'));

create index if not exists notifications_recipient_workflow_idx
  on public.notifications(recipient_user_id, workflow_status, snoozed_until, created_at desc);
