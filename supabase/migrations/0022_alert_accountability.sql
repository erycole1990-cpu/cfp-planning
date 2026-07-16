alter table public.notifications
  add column if not exists priority text not null default 'normal',
  add column if not exists due_at timestamptz,
  add column if not exists escalated_at timestamptz;

alter table public.notifications drop constraint if exists notifications_priority_check;
alter table public.notifications
  add constraint notifications_priority_check check (priority in ('low', 'normal', 'high', 'urgent'));

create index if not exists notifications_recipient_due_idx
  on public.notifications (recipient_user_id, workflow_status, due_at);

create or replace function public.cfp_notification_accountability_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.priority is null or new.priority = 'normal' then
    new.priority := case
      when new.notification_type in ('personal_update_waiting', 'client_referral_waiting') then 'high'
      else coalesce(new.priority, 'normal')
    end;
  end if;
  if new.due_at is null then
    new.due_at := new.created_at + case
      when new.notification_type in ('personal_update_waiting', 'client_referral_waiting') then interval '2 days'
      when new.notification_type in ('customer_assigned', 'assignment_email_failed') then interval '3 days'
      else interval '7 days'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_accountability_defaults on public.notifications;
create trigger notifications_accountability_defaults
before insert on public.notifications
for each row execute function public.cfp_notification_accountability_defaults();

update public.notifications
set due_at = created_at + case
  when notification_type in ('personal_update_waiting', 'client_referral_waiting') then interval '2 days'
  when notification_type in ('customer_assigned', 'assignment_email_failed') then interval '3 days'
  else interval '7 days'
end
where due_at is null and workflow_status <> 'resolved';

create or replace function public.cfp_escalate_my_overdue_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  update public.notifications
  set priority = 'urgent',
      escalated_at = coalesce(escalated_at, now()),
      workflow_status = 'open',
      snoozed_until = null
  where recipient_user_id = auth.uid()
    and workflow_status <> 'resolved'
    and due_at < now()
    and (priority <> 'urgent' or escalated_at is null or workflow_status <> 'open');
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.cfp_escalate_my_overdue_notifications() from public;
grant execute on function public.cfp_escalate_my_overdue_notifications() to authenticated;
