-- Keep advisor views responsive as customer history grows.
create index if not exists financial_goals_customer_status_target_idx
  on public.financial_goals (customer_id, status, target_date);

create index if not exists goal_progress_logs_goal_created_idx
  on public.goal_progress_logs (goal_id, created_at desc);

create index if not exists next_step_actions_customer_completed_due_idx
  on public.next_step_actions (customer_id, completed, due_date);

create index if not exists audit_logs_action_created_idx
  on public.audit_logs (action, created_at desc);

create index if not exists customers_agent_service_name_idx
  on public.customers (assigned_agent_user_id, service_status, full_name);
