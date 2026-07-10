alter table financial_statement_items
  add column if not exists statement_date date;

create index if not exists financial_statement_items_statement_date_idx
  on financial_statement_items(statement_date);
