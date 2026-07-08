create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_at timestamptz not null default now(),
  full_name text not null,
  email text,
  phone text,
  date_of_birth date,
  risk_profile text,
  assigned_advisor_name text,
  notes text
);
alter table customers enable row level security;
drop policy if exists "customers_v1_read" on customers;
create policy "customers_v1_read" on customers for select using (true);
drop policy if exists "customers_v1_write" on customers;
create policy "customers_v1_write" on customers for all using (true) with check (true);

create table if not exists financial_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_at timestamptz not null default now(),
  customer_id uuid not null references customers(id) on delete cascade,
  goal_type text not null,
  goal_name text not null,
  target_amount numeric not null,
  current_amount numeric not null default 0,
  target_date date not null,
  priority text not null default 'medium',
  status text not null default 'active',
  on_track_status text not null default 'unreviewed'
);
alter table financial_goals enable row level security;
drop policy if exists "financial_goals_v1_read" on financial_goals;
create policy "financial_goals_v1_read" on financial_goals for select using (true);
drop policy if exists "financial_goals_v1_write" on financial_goals;
create policy "financial_goals_v1_write" on financial_goals for all using (true) with check (true);

create table if not exists goal_progress_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_at timestamptz not null default now(),
  goal_id uuid not null references financial_goals(id) on delete cascade,
  logged_amount numeric not null,
  logged_by text,
  notes text,
  on_track_status text not null default 'on_track'
);
alter table goal_progress_logs enable row level security;
drop policy if exists "goal_progress_logs_v1_read" on goal_progress_logs;
create policy "goal_progress_logs_v1_read" on goal_progress_logs for select using (true);
drop policy if exists "goal_progress_logs_v1_write" on goal_progress_logs;
create policy "goal_progress_logs_v1_write" on goal_progress_logs for all using (true) with check (true);

create table if not exists next_step_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_at timestamptz not null default now(),
  customer_id uuid not null references customers(id) on delete cascade,
  goal_id uuid references financial_goals(id) on delete set null,
  action_title text not null,
  action_description text,
  assigned_to text,
  due_date date,
  completed boolean not null default false,
  completed_at timestamptz,
  priority text not null default 'medium'
);
alter table next_step_actions enable row level security;
drop policy if exists "next_step_actions_v1_read" on next_step_actions;
create policy "next_step_actions_v1_read" on next_step_actions for select using (true);
drop policy if exists "next_step_actions_v1_write" on next_step_actions;
create policy "next_step_actions_v1_write" on next_step_actions for all using (true) with check (true);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_at timestamptz not null default now(),
  actor text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb
);
alter table audit_logs enable row level security;
drop policy if exists "audit_logs_v1_read" on audit_logs;
create policy "audit_logs_v1_read" on audit_logs for select using (true);
drop policy if exists "audit_logs_v1_write" on audit_logs;
create policy "audit_logs_v1_write" on audit_logs for all using (true) with check (true);

create table if not exists goal_ai_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_at timestamptz not null default now(),
  goal_id uuid not null references financial_goals(id) on delete cascade,
  insight_type text not null,
  value text not null,
  source text not null default 'openai-gpt-4o',
  confidence numeric,
  review_status text not null default 'unreviewed'
);
alter table goal_ai_insights enable row level security;
drop policy if exists "goal_ai_insights_v1_read" on goal_ai_insights;
create policy "goal_ai_insights_v1_read" on goal_ai_insights for select using (true);
drop policy if exists "goal_ai_insights_v1_write" on goal_ai_insights;
create policy "goal_ai_insights_v1_write" on goal_ai_insights for all using (true) with check (true);

insert into customers (id, full_name, email, date_of_birth, risk_profile, assigned_advisor_name, notes) values
  ('a1000000-0000-0000-0000-000000000001', 'Sombat Charoenwong', 'sombat.c@example.com', '1980-04-12', 'moderate', 'Advisor Nattaporn', 'Two children, planning early retirement at 55'),
  ('a1000000-0000-0000-0000-000000000002', 'Wanida Saelim', 'wanida.s@example.com', '1975-08-22', 'conservative', 'Advisor Thanakorn', 'Priority: education fund for daughter in 5 years'),
  ('a1000000-0000-0000-0000-000000000003', 'Priya Mehta', 'priya.m@example.com', '1990-01-30', 'aggressive', 'Advisor Nattaporn', 'Newly married, high income, long horizon'),
  ('a1000000-0000-0000-0000-000000000004', 'Chaiwat Limsakul', 'chaiwat.l@example.com', '1968-11-05', 'conservative', 'Advisor Thanakorn', 'Approaching retirement, needs income protection review')
on conflict (id) do nothing;

insert into financial_goals (id, customer_id, goal_type, goal_name, target_amount, current_amount, target_date, priority, status, on_track_status) values
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Retirement', 'Retire at 55 with ฿10M', 10000000, 3200000, '2035-04-12', 'high', 'active', 'on_track'),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'Emergency Fund', '6-month emergency buffer', 600000, 600000, '2024-12-31', 'medium', 'achieved', 'on_track'),
  ('b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000002', 'Education', 'Daughter university fund ฿2M', 2000000, 680000, '2029-08-01', 'high', 'active', 'at_risk'),
  ('b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000003', 'Wealth Accumulation', 'Investment portfolio ฿5M', 5000000, 420000, '2040-01-30', 'medium', 'active', 'on_track'),
  ('b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000004', 'Retirement', 'Retirement income plan ฿8M', 8000000, 6100000, '2028-11-05', 'high', 'active', 'off_track')
on conflict (id) do nothing;

insert into goal_progress_logs (goal_id, logged_amount, logged_by, notes, on_track_status) values
  ('b1000000-0000-0000-0000-000000000001', 3200000, 'Advisor Nattaporn', 'Annual review — contributions consistent', 'on_track'),
  ('b1000000-0000-0000-0000-000000000003', 680000, 'Advisor Thanakorn', 'Missed contributions Q3, need to catch up ฿120k', 'at_risk'),
  ('b1000000-0000-0000-0000-000000000005', 6100000, 'Advisor Thanakorn', 'Market loss reduced portfolio by ฿400k, action required', 'off_track'),
  ('b1000000-0000-0000-0000-000000000004', 420000, 'Advisor Nattaporn', 'First year contributions on schedule', 'on_track');

insert into next_step_actions (customer_id, goal_id, action_title, action_description, assigned_to, due_date, priority) values
  ('a1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000003', 'Increase monthly contribution', 'Coach Wanida to raise monthly DCA from ฿15k to ฿25k to recover shortfall', 'Advisor Thanakorn', '2025-02-28', 'high'),
  ('a1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000005', 'Review asset allocation', 'Rebalance into lower-volatility assets given 3-year horizon', 'Advisor Thanakorn', '2025-02-15', 'high'),
  ('a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Annual CFP review meeting', 'Present updated retirement projection and adjust if needed', 'Advisor Nattaporn', '2025-03-31', 'medium');