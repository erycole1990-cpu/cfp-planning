create table if not exists financial_statement_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_at timestamptz not null default now(),
  customer_id uuid not null references customers(id) on delete cascade,
  statement_type text not null check (statement_type in ('balance_sheet', 'cash_flow', 'profit_loss')),
  item_type text not null,
  category text,
  description text not null,
  amount numeric not null default 0,
  frequency text not null default 'monthly'
);

alter table financial_statement_items enable row level security;
drop policy if exists "financial_statement_items_v1_read" on financial_statement_items;
create policy "financial_statement_items_v1_read" on financial_statement_items for select using (true);
drop policy if exists "financial_statement_items_v1_write" on financial_statement_items;
create policy "financial_statement_items_v1_write" on financial_statement_items for all using (true) with check (true);

create index if not exists financial_statement_items_customer_idx on financial_statement_items(customer_id);
create index if not exists financial_statement_items_statement_idx on financial_statement_items(statement_type);
