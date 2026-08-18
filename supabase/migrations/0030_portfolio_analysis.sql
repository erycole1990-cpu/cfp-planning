-- Portfolio Analysis V1 foundation: customer-scoped metadata, immutable financial
-- history, agency-aware RLS, and atomic audited mutation functions.

create or replace function public.cfp_investment_transaction_scope_is_valid(
  requested_type text,
  requested_scope text
)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select case
    when requested_type = 'opening_balance' then requested_scope = 'non_cash'
    when requested_type in ('buy', 'sell', 'fee', 'tax', 'reinvestment', 'transfer_in', 'transfer_out') then requested_scope = 'internal'
    when requested_type = 'contribution' then requested_scope = 'external_in'
    when requested_type = 'withdrawal' then requested_scope = 'external_out'
    when requested_type in ('distribution', 'interest') then requested_scope in ('internal', 'external_out')
    when requested_type = 'reversal' then requested_scope in ('external_in', 'external_out', 'internal', 'non_cash')
    else false
  end;
$$;

create or replace function public.cfp_investment_transaction_amounts_are_valid(
  requested_type text,
  requested_holding_id uuid,
  requested_quantity numeric,
  requested_unit_price numeric,
  requested_gross numeric,
  requested_fee numeric,
  requested_tax numeric
)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select
    requested_gross >= 0
    and requested_fee >= 0
    and requested_tax >= 0
    and (requested_quantity is null or requested_quantity >= 0)
    and (requested_unit_price is null or requested_unit_price >= 0)
    and coalesce(case
      when requested_type = 'fee' then
        requested_gross = 0 and requested_fee > 0 and requested_tax = 0
        and requested_quantity is null and requested_unit_price is null
      when requested_type = 'tax' then
        requested_gross = 0 and requested_fee = 0 and requested_tax > 0
        and requested_quantity is null and requested_unit_price is null
      when requested_type in ('buy', 'sell', 'reinvestment') then
        requested_holding_id is not null and requested_quantity > 0 and requested_gross > 0
      when requested_type = 'opening_balance' then
        requested_holding_id is not null and requested_quantity > 0
        and requested_gross > 0 and requested_fee = 0 and requested_tax = 0
      when requested_type in ('contribution', 'withdrawal', 'distribution', 'interest') then
        requested_gross > 0 and requested_fee = 0 and requested_tax = 0
      when requested_type in ('transfer_in', 'transfer_out') then
        requested_holding_id is null and requested_quantity is null and requested_unit_price is null
        and requested_gross > 0 and requested_fee = 0 and requested_tax = 0
      when requested_type = 'reversal' then
        requested_gross + requested_fee + requested_tax > 0
      else false
    end, false);
$$;

create table if not exists public.investment_portfolios (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  portfolio_type text not null default 'general'
    check (portfolio_type in ('general', 'retirement', 'education', 'income', 'other')),
  objective text,
  base_currency text not null default 'MYR'
    check (base_currency ~ '^[A-Z]{3}$'),
  custodian_provider text,
  account_reference text,
  inception_date date,
  status text not null default 'active'
    check (status in ('active', 'archived', 'closed')),
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'archived') = (archived_at is not null))
);

create table if not exists public.investment_holdings (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.investment_portfolios(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  instrument_type text not null
    check (instrument_type in (
      'cash', 'fixed_deposit', 'bond', 'equity', 'etf', 'unit_trust',
      'private_equity', 'property_fund', 'insurance_linked', 'crypto',
      'commodity', 'other'
    )),
  asset_class text not null
    check (asset_class in ('cash', 'fixed_income', 'equity', 'property', 'alternatives', 'mixed', 'other')),
  geography_code text,
  provider_name text,
  symbol text,
  isin text,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  quantity_mode text not null default 'units'
    check (quantity_mode in ('units', 'notional', 'manual_value')),
  risk_rating smallint check (risk_rating is null or risk_rating between 1 and 7),
  risk_source text,
  risk_assessed_on date,
  status text not null default 'active'
    check (status in ('active', 'closed', 'archived')),
  opened_on date,
  closed_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, portfolio_id),
  check (risk_rating is null or nullif(trim(risk_source), '') is not null),
  check (closed_on is null or opened_on is null or closed_on >= opened_on)
);

create table if not exists public.investment_transactions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.investment_portfolios(id) on delete restrict,
  holding_id uuid,
  transaction_date date not null,
  transaction_type text not null
    check (transaction_type in (
      'opening_balance', 'buy', 'sell', 'contribution', 'withdrawal',
      'distribution', 'interest', 'fee', 'tax', 'transfer_in',
      'transfer_out', 'reinvestment', 'reversal'
    )),
  quantity numeric(28, 10) check (quantity is null or quantity >= 0),
  unit_price numeric(28, 10) check (unit_price is null or unit_price >= 0),
  gross_amount numeric(24, 8) not null check (gross_amount >= 0),
  fee_amount numeric(24, 8) not null default 0 check (fee_amount >= 0),
  tax_amount numeric(24, 8) not null default 0 check (tax_amount >= 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  fx_rate_to_base numeric(28, 12) not null check (fx_rate_to_base > 0),
  fx_rate_date date,
  fx_source text,
  cash_flow_scope text not null
    check (cash_flow_scope in ('external_in', 'external_out', 'internal', 'non_cash')),
  event_group_id uuid,
  transfer_group_id uuid,
  counterparty_portfolio_id uuid references public.investment_portfolios(id) on delete restrict,
  reversal_of_transaction_id uuid,
  source_reference text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, portfolio_id),
  foreign key (holding_id, portfolio_id)
    references public.investment_holdings(id, portfolio_id) on delete restrict,
  foreign key (reversal_of_transaction_id, portfolio_id)
    references public.investment_transactions(id, portfolio_id) on delete restrict,
  check ((transaction_type = 'reversal') = (reversal_of_transaction_id is not null)),
  check (reversal_of_transaction_id is null or reversal_of_transaction_id <> id),
  check ((transaction_type in ('transfer_in', 'transfer_out')) = (transfer_group_id is not null)),
  check ((transaction_type in ('transfer_in', 'transfer_out')) = (counterparty_portfolio_id is not null)),
  check (public.cfp_investment_transaction_scope_is_valid(transaction_type, cash_flow_scope)),
  check (public.cfp_investment_transaction_amounts_are_valid(
    transaction_type, holding_id, quantity, unit_price, gross_amount, fee_amount, tax_amount
  ))
);

create table if not exists public.investment_valuations (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.investment_portfolios(id) on delete restrict,
  holding_id uuid,
  valuation_scope text not null check (valuation_scope in ('holding', 'portfolio')),
  valuation_date date not null,
  market_value numeric(24, 8) not null check (market_value >= 0),
  units numeric(28, 10) check (units is null or units >= 0),
  unit_price numeric(28, 10) check (unit_price is null or unit_price >= 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  fx_rate_to_base numeric(28, 12) not null check (fx_rate_to_base > 0),
  fx_rate_date date,
  fx_source text,
  source text not null default 'manual'
    check (source in ('manual', 'provider_statement', 'import')),
  evidence_status text not null default 'unverified'
    check (evidence_status in ('unverified', 'client_provided', 'adviser_verified')),
  evidence_note text,
  supersedes_valuation_id uuid references public.investment_valuations(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (holding_id, portfolio_id)
    references public.investment_holdings(id, portfolio_id) on delete restrict,
  check (
    (valuation_scope = 'holding' and holding_id is not null)
    or (valuation_scope = 'portfolio' and holding_id is null)
  ),
  check (supersedes_valuation_id is null or supersedes_valuation_id <> id)
);

create table if not exists public.portfolio_benchmark_references (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.investment_portfolios(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  code text,
  provider text,
  currency_code text check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  weight_percent numeric(7, 4)
    check (weight_percent is null or (weight_percent >= 0 and weight_percent <= 100)),
  effective_from date,
  effective_to date,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

create table if not exists public.portfolio_review_snapshots (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.investment_portfolios(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  period_start date,
  as_of_date date not null,
  base_currency text not null check (base_currency ~ '^[A-Z]{3}$'),
  methodology_version text not null check (length(trim(methodology_version)) > 0),
  risk_profile_at_review text
    check (risk_profile_at_review is null or risk_profile_at_review in ('conservative', 'moderate', 'aggressive')),
  total_value numeric(24, 8) not null check (total_value >= 0),
  simple_return_percent numeric(18, 8),
  xirr_percent numeric(18, 8),
  xirr_status text not null default 'not_calculated'
    check (xirr_status in (
      'not_calculated', 'ready', 'invalid_cash_flows', 'missing_valuation',
      'ambiguous_roots', 'non_convergent', 'total_loss'
    )),
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null,
  review_notes text,
  created_at timestamptz not null default now(),
  unique (portfolio_id, version_number),
  check (period_start is null or period_start <= as_of_date)
);

create index if not exists investment_portfolios_customer_status_name_idx
  on public.investment_portfolios(customer_id, status, name);
create index if not exists investment_portfolios_agency_customer_idx
  on public.investment_portfolios(agency_id, customer_id);
create index if not exists investment_holdings_portfolio_status_idx
  on public.investment_holdings(portfolio_id, status, name);
create index if not exists investment_holdings_portfolio_asset_idx
  on public.investment_holdings(portfolio_id, asset_class);
create index if not exists investment_transactions_portfolio_date_idx
  on public.investment_transactions(portfolio_id, transaction_date desc, created_at desc, id desc);
create index if not exists investment_transactions_holding_date_idx
  on public.investment_transactions(holding_id, transaction_date desc, id)
  where holding_id is not null;
create index if not exists investment_transactions_transfer_group_idx
  on public.investment_transactions(transfer_group_id)
  where transfer_group_id is not null;
create unique index if not exists investment_transactions_one_reversal_idx
  on public.investment_transactions(reversal_of_transaction_id)
  where reversal_of_transaction_id is not null;
create index if not exists investment_valuations_portfolio_date_idx
  on public.investment_valuations(portfolio_id, valuation_date desc, id);
create index if not exists investment_valuations_holding_date_idx
  on public.investment_valuations(holding_id, valuation_date desc, id)
  where holding_id is not null;
create unique index if not exists investment_valuations_one_superseding_idx
  on public.investment_valuations(supersedes_valuation_id)
  where supersedes_valuation_id is not null;
create index if not exists portfolio_benchmarks_portfolio_idx
  on public.portfolio_benchmark_references(portfolio_id, effective_from desc);
create unique index if not exists portfolio_benchmarks_one_current_primary_idx
  on public.portfolio_benchmark_references(portfolio_id)
  where is_primary and effective_to is null;
create index if not exists portfolio_review_snapshots_portfolio_date_idx
  on public.portfolio_review_snapshots(portfolio_id, as_of_date desc, version_number desc);

create or replace function public.cfp_prepare_investment_portfolio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_agency uuid;
begin
  select c.agency_id into customer_agency
  from public.customers c
  where c.id = new.customer_id;

  if customer_agency is null then
    raise exception 'Portfolio customer does not exist or has no agency.' using errcode = '23503';
  end if;

  if tg_op = 'UPDATE' and old.customer_id is distinct from new.customer_id then
    raise exception 'Portfolio customer cannot be changed.' using errcode = '23514';
  end if;

  if auth.uid() is not null and customer_agency is distinct from public.cfp_current_agency_id() then
    raise exception 'Portfolio cannot cross agencies.' using errcode = '42501';
  end if;

  new.agency_id := customer_agency;
  new.base_currency := upper(trim(new.base_currency));
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists investment_portfolios_prepare on public.investment_portfolios;
create trigger investment_portfolios_prepare
before insert or update on public.investment_portfolios
for each row execute function public.cfp_prepare_investment_portfolio();

create or replace function public.cfp_prepare_investment_holding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.portfolio_id is distinct from new.portfolio_id then
    raise exception 'Holding portfolio cannot be changed.' using errcode = '23514';
  end if;
  new.currency_code := upper(trim(new.currency_code));
  new.geography_code := upper(nullif(trim(new.geography_code), ''));
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists investment_holdings_prepare on public.investment_holdings;
create trigger investment_holdings_prepare
before insert or update on public.investment_holdings
for each row execute function public.cfp_prepare_investment_holding();

create or replace function public.cfp_prepare_portfolio_benchmark()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.portfolio_id is distinct from new.portfolio_id then
    raise exception 'Benchmark portfolio cannot be changed.' using errcode = '23514';
  end if;
  new.currency_code := upper(nullif(trim(new.currency_code), ''));
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists portfolio_benchmarks_prepare on public.portfolio_benchmark_references;
create trigger portfolio_benchmarks_prepare
before insert or update on public.portfolio_benchmark_references
for each row execute function public.cfp_prepare_portfolio_benchmark();

create or replace function public.cfp_can_access_investment_portfolio(requested_portfolio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.investment_portfolios p
    where p.id = requested_portfolio_id
      and p.agency_id = public.cfp_current_agency_id()
      and public.cfp_can_access_customer(p.customer_id)
  );
$$;

create or replace function public.cfp_can_manage_investment_portfolio(requested_portfolio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.investment_portfolios p
    where p.id = requested_portfolio_id
      and p.agency_id = public.cfp_current_agency_id()
      and public.cfp_can_manage_customer(p.customer_id)
  );
$$;

alter table public.investment_portfolios enable row level security;
alter table public.investment_holdings enable row level security;
alter table public.investment_transactions enable row level security;
alter table public.investment_valuations enable row level security;
alter table public.portfolio_benchmark_references enable row level security;
alter table public.portfolio_review_snapshots enable row level security;

create policy investment_portfolios_read on public.investment_portfolios
for select to authenticated using (public.cfp_can_access_investment_portfolio(id));
create policy investment_portfolios_insert on public.investment_portfolios
for insert to authenticated with check (public.cfp_can_manage_customer(customer_id));
create policy investment_portfolios_update on public.investment_portfolios
for update to authenticated
using (public.cfp_can_manage_investment_portfolio(id))
with check (public.cfp_can_manage_customer(customer_id));

create policy investment_holdings_read on public.investment_holdings
for select to authenticated using (public.cfp_can_access_investment_portfolio(portfolio_id));
create policy investment_holdings_insert on public.investment_holdings
for insert to authenticated with check (public.cfp_can_manage_investment_portfolio(portfolio_id));
create policy investment_holdings_update on public.investment_holdings
for update to authenticated
using (public.cfp_can_manage_investment_portfolio(portfolio_id))
with check (public.cfp_can_manage_investment_portfolio(portfolio_id));

create policy investment_transactions_read on public.investment_transactions
for select to authenticated using (public.cfp_can_access_investment_portfolio(portfolio_id));

create policy investment_valuations_read on public.investment_valuations
for select to authenticated using (public.cfp_can_access_investment_portfolio(portfolio_id));

create policy portfolio_benchmarks_read on public.portfolio_benchmark_references
for select to authenticated using (public.cfp_can_access_investment_portfolio(portfolio_id));
create policy portfolio_benchmarks_manage on public.portfolio_benchmark_references
for all to authenticated
using (public.cfp_can_manage_investment_portfolio(portfolio_id))
with check (public.cfp_can_manage_investment_portfolio(portfolio_id));

create policy portfolio_review_snapshots_read on public.portfolio_review_snapshots
for select to authenticated using (public.cfp_can_access_investment_portfolio(portfolio_id));
create policy portfolio_review_snapshots_insert on public.portfolio_review_snapshots
for insert to authenticated with check (public.cfp_can_manage_investment_portfolio(portfolio_id));

revoke all on public.investment_portfolios from anon, authenticated;
revoke all on public.investment_holdings from anon, authenticated;
revoke all on public.investment_transactions from anon, authenticated;
revoke all on public.investment_valuations from anon, authenticated;
revoke all on public.portfolio_benchmark_references from anon, authenticated;
revoke all on public.portfolio_review_snapshots from anon, authenticated;

grant select on public.investment_portfolios to authenticated;
grant select on public.investment_holdings to authenticated;
grant select on public.investment_transactions to authenticated;
grant select on public.investment_valuations to authenticated;
grant select on public.portfolio_benchmark_references to authenticated;
grant select on public.portfolio_review_snapshots to authenticated;

revoke all on function public.cfp_can_access_investment_portfolio(uuid) from public;
revoke all on function public.cfp_can_manage_investment_portfolio(uuid) from public;
grant execute on function public.cfp_can_access_investment_portfolio(uuid) to authenticated;
grant execute on function public.cfp_can_manage_investment_portfolio(uuid) to authenticated;

create or replace function public.cfp_investment_actor_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select coalesce(nullif(trim(p.full_name), ''), p.email)
      from public.user_profiles p
      where p.id = auth.uid()
    ),
    'Authenticated user'
  );
$$;

revoke all on function public.cfp_investment_actor_name() from public;

create or replace function public.cfp_create_investment_portfolio(
  target_customer_id uuid,
  portfolio_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_agency uuid;
  new_portfolio_id uuid;
  clean_name text := nullif(trim(portfolio_payload ->> 'name'), '');
  clean_currency text := upper(coalesce(nullif(trim(portfolio_payload ->> 'base_currency'), ''), 'MYR'));
begin
  if auth.uid() is null or not public.cfp_can_manage_customer(target_customer_id) then
    raise exception 'You are not allowed to manage this customer portfolio.' using errcode = '42501';
  end if;
  if clean_name is null then
    raise exception 'Portfolio name is required.' using errcode = '23514';
  end if;

  select c.agency_id into customer_agency
  from public.customers c
  where c.id = target_customer_id;

  insert into public.investment_portfolios (
    agency_id, customer_id, name, portfolio_type, objective, base_currency,
    custodian_provider, account_reference, inception_date, created_by
  )
  values (
    customer_agency,
    target_customer_id,
    clean_name,
    coalesce(nullif(trim(portfolio_payload ->> 'portfolio_type'), ''), 'general'),
    nullif(trim(portfolio_payload ->> 'objective'), ''),
    clean_currency,
    nullif(trim(portfolio_payload ->> 'custodian_provider'), ''),
    nullif(trim(portfolio_payload ->> 'account_reference'), ''),
    nullif(portfolio_payload ->> 'inception_date', '')::date,
    auth.uid()
  )
  returning id into new_portfolio_id;

  insert into public.audit_logs (
    agency_id, customer_id, user_id, actor, action, entity_type, entity_id, payload
  )
  values (
    customer_agency,
    target_customer_id,
    auth.uid(),
    public.cfp_investment_actor_name(),
    'investment_portfolio_created',
    'investment_portfolios',
    new_portfolio_id,
    jsonb_build_object(
      'customer_id', target_customer_id,
      'portfolio_name', clean_name,
      'base_currency', clean_currency
    )
  );

  return new_portfolio_id;
end;
$$;

create or replace function public.cfp_create_investment_holding(
  target_portfolio_id uuid,
  holding_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  portfolio_row public.investment_portfolios%rowtype;
  new_holding_id uuid;
  clean_name text := nullif(trim(holding_payload ->> 'name'), '');
  clean_risk_rating smallint := nullif(holding_payload ->> 'risk_rating', '')::smallint;
begin
  if auth.uid() is null or not public.cfp_can_manage_investment_portfolio(target_portfolio_id) then
    raise exception 'You are not allowed to manage this investment portfolio.' using errcode = '42501';
  end if;
  if clean_name is null then
    raise exception 'Holding name is required.' using errcode = '23514';
  end if;

  select * into strict portfolio_row
  from public.investment_portfolios p
  where p.id = target_portfolio_id;

  insert into public.investment_holdings (
    portfolio_id, name, instrument_type, asset_class, geography_code,
    provider_name, symbol, isin, currency_code, quantity_mode,
    risk_rating, risk_source, risk_assessed_on, opened_on
  )
  values (
    target_portfolio_id,
    clean_name,
    coalesce(nullif(trim(holding_payload ->> 'instrument_type'), ''), 'other'),
    coalesce(nullif(trim(holding_payload ->> 'asset_class'), ''), 'other'),
    nullif(trim(holding_payload ->> 'geography_code'), ''),
    nullif(trim(holding_payload ->> 'provider_name'), ''),
    nullif(trim(holding_payload ->> 'symbol'), ''),
    nullif(trim(holding_payload ->> 'isin'), ''),
    upper(coalesce(nullif(trim(holding_payload ->> 'currency_code'), ''), portfolio_row.base_currency)),
    coalesce(nullif(trim(holding_payload ->> 'quantity_mode'), ''), 'units'),
    clean_risk_rating,
    nullif(trim(holding_payload ->> 'risk_source'), ''),
    nullif(holding_payload ->> 'risk_assessed_on', '')::date,
    nullif(holding_payload ->> 'opened_on', '')::date
  )
  returning id into new_holding_id;

  insert into public.audit_logs (
    agency_id, customer_id, user_id, actor, action, entity_type, entity_id, payload
  )
  values (
    portfolio_row.agency_id,
    portfolio_row.customer_id,
    auth.uid(),
    public.cfp_investment_actor_name(),
    'investment_holding_created',
    'investment_holdings',
    new_holding_id,
    jsonb_build_object(
      'customer_id', portfolio_row.customer_id,
      'portfolio_id', target_portfolio_id,
      'holding_name', clean_name
    )
  );

  return new_holding_id;
end;
$$;

create or replace function public.cfp_record_investment_transaction(
  target_portfolio_id uuid,
  transaction_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  portfolio_row public.investment_portfolios%rowtype;
  new_transaction_id uuid;
  clean_type text := nullif(trim(transaction_payload ->> 'transaction_type'), '');
  clean_scope text := nullif(trim(transaction_payload ->> 'cash_flow_scope'), '');
  clean_holding_id uuid := nullif(transaction_payload ->> 'holding_id', '')::uuid;
  clean_currency text;
  clean_quantity numeric := nullif(transaction_payload ->> 'quantity', '')::numeric;
  clean_unit_price numeric := nullif(transaction_payload ->> 'unit_price', '')::numeric;
  clean_gross numeric := coalesce(nullif(transaction_payload ->> 'gross_amount', '')::numeric, 0);
  clean_fee numeric := coalesce(nullif(transaction_payload ->> 'fee_amount', '')::numeric, 0);
  clean_tax numeric := coalesce(nullif(transaction_payload ->> 'tax_amount', '')::numeric, 0);
  clean_fx numeric := coalesce(nullif(transaction_payload ->> 'fx_rate_to_base', '')::numeric, 1);
  clean_fx_date date := nullif(transaction_payload ->> 'fx_rate_date', '')::date;
  clean_fx_source text := nullif(trim(transaction_payload ->> 'fx_source'), '');
  clean_date date := nullif(transaction_payload ->> 'transaction_date', '')::date;
begin
  if auth.uid() is null or not public.cfp_can_manage_investment_portfolio(target_portfolio_id) then
    raise exception 'You are not allowed to record transactions for this portfolio.' using errcode = '42501';
  end if;

  select * into strict portfolio_row
  from public.investment_portfolios p
  where p.id = target_portfolio_id;

  if clean_type is null or clean_type not in (
    'opening_balance', 'buy', 'sell', 'contribution', 'withdrawal',
    'distribution', 'interest', 'fee', 'tax', 'reinvestment'
  ) then
    raise exception 'Transaction type is invalid or requires a dedicated RPC.' using errcode = '23514';
  end if;
  if clean_date is null then
    raise exception 'Transaction date is required.' using errcode = '23514';
  end if;
  if clean_fx <= 0 then
    raise exception 'Transaction amounts, units, prices, fees, taxes, and FX must be non-negative.' using errcode = '23514';
  end if;
  if not public.cfp_investment_transaction_amounts_are_valid(
    clean_type,
    clean_holding_id,
    clean_quantity,
    clean_unit_price,
    clean_gross,
    clean_fee,
    clean_tax
  ) then
    raise exception 'Transaction amounts are incompatible with the transaction type.' using errcode = '23514';
  end if;
  if clean_holding_id is not null and not exists (
    select 1 from public.investment_holdings h
    where h.id = clean_holding_id and h.portfolio_id = target_portfolio_id
  ) then
    raise exception 'Holding does not belong to this portfolio.' using errcode = '23514';
  end if;

  if not public.cfp_investment_transaction_scope_is_valid(clean_type, clean_scope) then
    raise exception 'Cash-flow scope is incompatible with the transaction type.' using errcode = '23514';
  end if;

  clean_currency := upper(coalesce(nullif(trim(transaction_payload ->> 'currency_code'), ''), portfolio_row.base_currency));
  if clean_currency = portfolio_row.base_currency and clean_fx <> 1 then
    raise exception 'Base-currency transactions must use an FX rate of 1.' using errcode = '23514';
  end if;
  if clean_currency <> portfolio_row.base_currency and (clean_fx_date is null or clean_fx_source is null) then
    raise exception 'Foreign-currency transactions require an FX date and source.' using errcode = '23514';
  end if;

  insert into public.investment_transactions (
    portfolio_id, holding_id, transaction_date, transaction_type, quantity,
    unit_price, gross_amount, fee_amount, tax_amount, currency_code,
    fx_rate_to_base, fx_rate_date, fx_source, cash_flow_scope,
    event_group_id, source_reference, notes, created_by
  )
  values (
    target_portfolio_id,
    clean_holding_id,
    clean_date,
    clean_type,
    clean_quantity,
    clean_unit_price,
    clean_gross,
    clean_fee,
    clean_tax,
    clean_currency,
    clean_fx,
    clean_fx_date,
    clean_fx_source,
    clean_scope,
    nullif(transaction_payload ->> 'event_group_id', '')::uuid,
    nullif(trim(transaction_payload ->> 'source_reference'), ''),
    nullif(trim(transaction_payload ->> 'notes'), ''),
    auth.uid()
  )
  returning id into new_transaction_id;

  insert into public.audit_logs (
    agency_id, customer_id, user_id, actor, action, entity_type, entity_id, payload
  )
  values (
    portfolio_row.agency_id,
    portfolio_row.customer_id,
    auth.uid(),
    public.cfp_investment_actor_name(),
    'investment_transaction_recorded',
    'investment_transactions',
    new_transaction_id,
    jsonb_build_object(
      'customer_id', portfolio_row.customer_id,
      'portfolio_id', target_portfolio_id,
      'holding_id', clean_holding_id,
      'transaction_type', clean_type,
      'transaction_date', clean_date,
      'gross_amount', clean_gross,
      'currency_code', clean_currency
    )
  );

  return new_transaction_id;
end;
$$;

create or replace function public.cfp_record_investment_transfer(
  source_portfolio_id uuid,
  destination_portfolio_id uuid,
  transfer_date date,
  transfer_amount numeric,
  transfer_currency text,
  transfer_fx_rate_to_base numeric default 1,
  transfer_fx_rate_date date default null,
  transfer_fx_source text default null,
  transfer_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  source_portfolio public.investment_portfolios%rowtype;
  destination_portfolio public.investment_portfolios%rowtype;
  transfer_group uuid := gen_random_uuid();
  source_transaction_id uuid;
  destination_transaction_id uuid;
  clean_currency text := upper(trim(transfer_currency));
  clean_fx_source text := nullif(trim(transfer_fx_source), '');
begin
  if source_portfolio_id = destination_portfolio_id then
    raise exception 'Transfer portfolios must be different.' using errcode = '23514';
  end if;
  if auth.uid() is null
    or not public.cfp_can_manage_investment_portfolio(source_portfolio_id)
    or not public.cfp_can_manage_investment_portfolio(destination_portfolio_id) then
    raise exception 'You are not allowed to transfer between these portfolios.' using errcode = '42501';
  end if;

  select * into strict source_portfolio
  from public.investment_portfolios p where p.id = source_portfolio_id;
  select * into strict destination_portfolio
  from public.investment_portfolios p where p.id = destination_portfolio_id;

  if source_portfolio.customer_id is distinct from destination_portfolio.customer_id
    or source_portfolio.agency_id is distinct from destination_portfolio.agency_id then
    raise exception 'Internal transfers must remain within one customer and agency.' using errcode = '23514';
  end if;
  if source_portfolio.base_currency is distinct from destination_portfolio.base_currency then
    raise exception 'Phase 1 transfers require matching portfolio base currencies.' using errcode = '23514';
  end if;
  if transfer_date is null or transfer_amount is null or transfer_amount <= 0
    or transfer_fx_rate_to_base is null or transfer_fx_rate_to_base <= 0 then
    raise exception 'Transfer date, amount, and FX rate must be valid and positive.' using errcode = '23514';
  end if;
  if clean_currency !~ '^[A-Z]{3}$' then
    raise exception 'Transfer currency must be a three-letter code.' using errcode = '23514';
  end if;
  if clean_currency = source_portfolio.base_currency and transfer_fx_rate_to_base <> 1 then
    raise exception 'Base-currency transfers must use an FX rate of 1.' using errcode = '23514';
  end if;
  if clean_currency <> source_portfolio.base_currency
    and (transfer_fx_rate_date is null or clean_fx_source is null) then
    raise exception 'Foreign-currency transfers require an FX date and source.' using errcode = '23514';
  end if;

  insert into public.investment_transactions (
    portfolio_id, transaction_date, transaction_type, gross_amount,
    currency_code, fx_rate_to_base, fx_rate_date, fx_source,
    cash_flow_scope, transfer_group_id, counterparty_portfolio_id,
    notes, created_by
  )
  values (
    source_portfolio_id, transfer_date, 'transfer_out', transfer_amount,
    clean_currency, transfer_fx_rate_to_base, transfer_fx_rate_date,
    clean_fx_source, 'internal', transfer_group,
    destination_portfolio_id, nullif(trim(transfer_notes), ''), auth.uid()
  )
  returning id into source_transaction_id;

  insert into public.investment_transactions (
    portfolio_id, transaction_date, transaction_type, gross_amount,
    currency_code, fx_rate_to_base, fx_rate_date, fx_source,
    cash_flow_scope, transfer_group_id, counterparty_portfolio_id,
    notes, created_by
  )
  values (
    destination_portfolio_id, transfer_date, 'transfer_in', transfer_amount,
    clean_currency, transfer_fx_rate_to_base, transfer_fx_rate_date,
    clean_fx_source, 'internal', transfer_group,
    source_portfolio_id, nullif(trim(transfer_notes), ''), auth.uid()
  )
  returning id into destination_transaction_id;

  insert into public.audit_logs (
    agency_id, customer_id, user_id, actor, action, entity_type, entity_id, payload
  )
  values
    (
      source_portfolio.agency_id,
      source_portfolio.customer_id,
      auth.uid(),
      public.cfp_investment_actor_name(),
      'investment_transfer_recorded',
      'investment_transactions',
      source_transaction_id,
      jsonb_build_object(
        'customer_id', source_portfolio.customer_id,
        'portfolio_id', source_portfolio_id,
        'counterparty_portfolio_id', destination_portfolio_id,
        'transfer_group_id', transfer_group,
        'transaction_type', 'transfer_out',
        'gross_amount', transfer_amount,
        'currency_code', clean_currency
      )
    ),
    (
      destination_portfolio.agency_id,
      destination_portfolio.customer_id,
      auth.uid(),
      public.cfp_investment_actor_name(),
      'investment_transfer_recorded',
      'investment_transactions',
      destination_transaction_id,
      jsonb_build_object(
        'customer_id', destination_portfolio.customer_id,
        'portfolio_id', destination_portfolio_id,
        'counterparty_portfolio_id', source_portfolio_id,
        'transfer_group_id', transfer_group,
        'transaction_type', 'transfer_in',
        'gross_amount', transfer_amount,
        'currency_code', clean_currency
      )
    );

  return transfer_group;
end;
$$;

create or replace function public.cfp_reverse_investment_transaction(
  original_transaction_id uuid,
  reversal_date date,
  reversal_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  original public.investment_transactions%rowtype;
  counterpart public.investment_transactions%rowtype;
  portfolio_row public.investment_portfolios%rowtype;
  counterpart_portfolio public.investment_portfolios%rowtype;
  new_reversal_id uuid;
  counterpart_reversal_id uuid;
  reversal_event_group uuid := gen_random_uuid();
begin
  select * into strict original
  from public.investment_transactions t
  where t.id = original_transaction_id;

  if auth.uid() is null or not public.cfp_can_manage_investment_portfolio(original.portfolio_id) then
    raise exception 'You are not allowed to reverse this transaction.' using errcode = '42501';
  end if;
  if original.transaction_type = 'reversal' then
    raise exception 'A reversal transaction cannot itself be reversed.' using errcode = '23514';
  end if;
  if reversal_date is null or reversal_date < original.transaction_date then
    raise exception 'Reversal date cannot precede the original transaction.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.investment_transactions r
    where r.reversal_of_transaction_id = original.id
  ) then
    raise exception 'This transaction has already been reversed.' using errcode = '23505';
  end if;

  select * into strict portfolio_row
  from public.investment_portfolios p where p.id = original.portfolio_id;

  if original.transaction_type in ('transfer_in', 'transfer_out') then
    select * into strict counterpart
    from public.investment_transactions t
    where t.transfer_group_id = original.transfer_group_id
      and t.id <> original.id
      and t.transaction_type in ('transfer_in', 'transfer_out');

    if not public.cfp_can_manage_investment_portfolio(counterpart.portfolio_id) then
      raise exception 'You are not allowed to reverse the paired transfer.' using errcode = '42501';
    end if;
    if reversal_date < counterpart.transaction_date then
      raise exception 'Reversal date cannot precede the paired transfer.' using errcode = '23514';
    end if;
    if exists (
      select 1 from public.investment_transactions r
      where r.reversal_of_transaction_id = counterpart.id
    ) then
      raise exception 'The paired transfer has already been reversed.' using errcode = '23505';
    end if;
    select * into strict counterpart_portfolio
    from public.investment_portfolios p where p.id = counterpart.portfolio_id;
  end if;

  insert into public.investment_transactions (
    portfolio_id, holding_id, transaction_date, transaction_type, quantity,
    unit_price, gross_amount, fee_amount, tax_amount, currency_code,
    fx_rate_to_base, fx_rate_date, fx_source, cash_flow_scope,
    event_group_id, reversal_of_transaction_id, source_reference, notes, created_by
  )
  values (
    original.portfolio_id, original.holding_id, reversal_date, 'reversal',
    original.quantity, original.unit_price, original.gross_amount,
    original.fee_amount, original.tax_amount, original.currency_code,
    original.fx_rate_to_base, original.fx_rate_date, original.fx_source,
    original.cash_flow_scope, reversal_event_group, original.id,
    original.source_reference, nullif(trim(reversal_notes), ''), auth.uid()
  )
  returning id into new_reversal_id;

  insert into public.audit_logs (
    agency_id, customer_id, user_id, actor, action, entity_type, entity_id, payload
  )
  values (
    portfolio_row.agency_id,
    portfolio_row.customer_id,
    auth.uid(),
    public.cfp_investment_actor_name(),
    'investment_transaction_reversed',
    'investment_transactions',
    new_reversal_id,
    jsonb_build_object(
      'customer_id', portfolio_row.customer_id,
      'portfolio_id', original.portfolio_id,
      'reversal_of_transaction_id', original.id,
      'transaction_date', reversal_date
    )
  );

  if original.transaction_type in ('transfer_in', 'transfer_out') then
    insert into public.investment_transactions (
      portfolio_id, holding_id, transaction_date, transaction_type, quantity,
      unit_price, gross_amount, fee_amount, tax_amount, currency_code,
      fx_rate_to_base, fx_rate_date, fx_source, cash_flow_scope,
      event_group_id, reversal_of_transaction_id, source_reference, notes, created_by
    )
    values (
      counterpart.portfolio_id, counterpart.holding_id, reversal_date, 'reversal',
      counterpart.quantity, counterpart.unit_price, counterpart.gross_amount,
      counterpart.fee_amount, counterpart.tax_amount, counterpart.currency_code,
      counterpart.fx_rate_to_base, counterpart.fx_rate_date, counterpart.fx_source,
      counterpart.cash_flow_scope, reversal_event_group, counterpart.id,
      counterpart.source_reference, nullif(trim(reversal_notes), ''), auth.uid()
    )
    returning id into counterpart_reversal_id;

    insert into public.audit_logs (
      agency_id, customer_id, user_id, actor, action, entity_type, entity_id, payload
    )
    values (
      counterpart_portfolio.agency_id,
      counterpart_portfolio.customer_id,
      auth.uid(),
      public.cfp_investment_actor_name(),
      'investment_transaction_reversed',
      'investment_transactions',
      counterpart_reversal_id,
      jsonb_build_object(
        'customer_id', counterpart_portfolio.customer_id,
        'portfolio_id', counterpart.portfolio_id,
        'reversal_of_transaction_id', counterpart.id,
        'transaction_date', reversal_date
      )
    );
  end if;

  return new_reversal_id;
end;
$$;

create or replace function public.cfp_record_investment_valuation(
  target_portfolio_id uuid,
  valuation_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  portfolio_row public.investment_portfolios%rowtype;
  original_valuation public.investment_valuations%rowtype;
  new_valuation_id uuid;
  clean_scope text := nullif(trim(valuation_payload ->> 'valuation_scope'), '');
  clean_holding_id uuid := nullif(valuation_payload ->> 'holding_id', '')::uuid;
  clean_date date := nullif(valuation_payload ->> 'valuation_date', '')::date;
  clean_market_value numeric := nullif(valuation_payload ->> 'market_value', '')::numeric;
  clean_units numeric := nullif(valuation_payload ->> 'units', '')::numeric;
  clean_unit_price numeric := nullif(valuation_payload ->> 'unit_price', '')::numeric;
  clean_fx numeric := coalesce(nullif(valuation_payload ->> 'fx_rate_to_base', '')::numeric, 1);
  clean_fx_date date := nullif(valuation_payload ->> 'fx_rate_date', '')::date;
  clean_fx_source text := nullif(trim(valuation_payload ->> 'fx_source'), '');
  clean_currency text;
  clean_supersedes uuid := nullif(valuation_payload ->> 'supersedes_valuation_id', '')::uuid;
begin
  if auth.uid() is null or not public.cfp_can_manage_investment_portfolio(target_portfolio_id) then
    raise exception 'You are not allowed to record valuations for this portfolio.' using errcode = '42501';
  end if;
  select * into strict portfolio_row
  from public.investment_portfolios p where p.id = target_portfolio_id;

  if clean_scope not in ('holding', 'portfolio') or clean_date is null or clean_market_value is null then
    raise exception 'Valuation scope, date, and market value are required.' using errcode = '23514';
  end if;
  if clean_market_value < 0 or clean_units < 0 or clean_unit_price < 0 or clean_fx <= 0 then
    raise exception 'Valuation amounts, units, prices, and FX must be non-negative.' using errcode = '23514';
  end if;
  if clean_scope = 'holding' and clean_holding_id is null
    or clean_scope = 'portfolio' and clean_holding_id is not null then
    raise exception 'Valuation holding does not match its scope.' using errcode = '23514';
  end if;
  if clean_holding_id is not null and not exists (
    select 1 from public.investment_holdings h
    where h.id = clean_holding_id and h.portfolio_id = target_portfolio_id
  ) then
    raise exception 'Holding does not belong to this portfolio.' using errcode = '23514';
  end if;

  clean_currency := upper(coalesce(nullif(trim(valuation_payload ->> 'currency_code'), ''), portfolio_row.base_currency));
  if clean_currency = portfolio_row.base_currency and clean_fx <> 1 then
    raise exception 'Base-currency valuations must use an FX rate of 1.' using errcode = '23514';
  end if;
  if clean_currency <> portfolio_row.base_currency and (clean_fx_date is null or clean_fx_source is null) then
    raise exception 'Foreign-currency valuations require an FX date and source.' using errcode = '23514';
  end if;

  -- Serialize the complete logical valuation key for the rest of this transaction.
  -- Hash collisions can only serialize unrelated keys; they cannot weaken integrity.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(
        '|',
        'investment_valuation',
        target_portfolio_id::text,
        clean_scope,
        coalesce(clean_holding_id::text, 'portfolio'),
        clean_date::text
      ),
      0
    )
  );

  if clean_supersedes is not null then
    select * into strict original_valuation
    from public.investment_valuations v
    where v.id = clean_supersedes;

    if original_valuation.portfolio_id is distinct from target_portfolio_id
      or original_valuation.valuation_scope is distinct from clean_scope
      or original_valuation.holding_id is distinct from clean_holding_id
      or original_valuation.valuation_date is distinct from clean_date then
      raise exception 'Superseding valuation must match the original scope, holding, portfolio, and date.' using errcode = '23514';
    end if;
    if exists (
      select 1 from public.investment_valuations replacement
      where replacement.supersedes_valuation_id = clean_supersedes
    ) then
      raise exception 'This valuation has already been superseded.' using errcode = '23505';
    end if;
  elsif exists (
    select 1
    from public.investment_valuations existing
    where existing.portfolio_id = target_portfolio_id
      and existing.valuation_scope = clean_scope
      and existing.holding_id is not distinct from clean_holding_id
      and existing.valuation_date = clean_date
      and not exists (
        select 1 from public.investment_valuations replacement
        where replacement.supersedes_valuation_id = existing.id
      )
  ) then
    raise exception 'An active valuation already exists for this scope and date; supersede it instead.' using errcode = '23505';
  end if;

  insert into public.investment_valuations (
    portfolio_id, holding_id, valuation_scope, valuation_date, market_value,
    units, unit_price, currency_code, fx_rate_to_base, fx_rate_date,
    fx_source, source, evidence_status, evidence_note,
    supersedes_valuation_id, created_by
  )
  values (
    target_portfolio_id,
    clean_holding_id,
    clean_scope,
    clean_date,
    clean_market_value,
    clean_units,
    clean_unit_price,
    clean_currency,
    clean_fx,
    clean_fx_date,
    clean_fx_source,
    coalesce(nullif(trim(valuation_payload ->> 'source'), ''), 'manual'),
    coalesce(nullif(trim(valuation_payload ->> 'evidence_status'), ''), 'unverified'),
    nullif(trim(valuation_payload ->> 'evidence_note'), ''),
    clean_supersedes,
    auth.uid()
  )
  returning id into new_valuation_id;

  insert into public.audit_logs (
    agency_id, customer_id, user_id, actor, action, entity_type, entity_id, payload
  )
  values (
    portfolio_row.agency_id,
    portfolio_row.customer_id,
    auth.uid(),
    public.cfp_investment_actor_name(),
    'investment_valuation_recorded',
    'investment_valuations',
    new_valuation_id,
    jsonb_build_object(
      'customer_id', portfolio_row.customer_id,
      'portfolio_id', target_portfolio_id,
      'holding_id', clean_holding_id,
      'valuation_scope', clean_scope,
      'valuation_date', clean_date,
      'market_value', clean_market_value,
      'currency_code', clean_currency,
      'supersedes_valuation_id', clean_supersedes
    )
  );

  return new_valuation_id;
end;
$$;

revoke all on function public.cfp_investment_transaction_scope_is_valid(text, text) from public;
revoke all on function public.cfp_investment_transaction_amounts_are_valid(text, uuid, numeric, numeric, numeric, numeric, numeric) from public;
revoke all on function public.cfp_prepare_investment_portfolio() from public;
revoke all on function public.cfp_prepare_investment_holding() from public;
revoke all on function public.cfp_prepare_portfolio_benchmark() from public;
revoke all on function public.cfp_create_investment_portfolio(uuid, jsonb) from public;
revoke all on function public.cfp_create_investment_holding(uuid, jsonb) from public;
revoke all on function public.cfp_record_investment_transaction(uuid, jsonb) from public;
revoke all on function public.cfp_record_investment_transfer(uuid, uuid, date, numeric, text, numeric, date, text, text) from public;
revoke all on function public.cfp_reverse_investment_transaction(uuid, date, text) from public;
revoke all on function public.cfp_record_investment_valuation(uuid, jsonb) from public;

grant execute on function public.cfp_create_investment_portfolio(uuid, jsonb) to authenticated;
grant execute on function public.cfp_create_investment_holding(uuid, jsonb) to authenticated;
grant execute on function public.cfp_record_investment_transaction(uuid, jsonb) to authenticated;
grant execute on function public.cfp_record_investment_transfer(uuid, uuid, date, numeric, text, numeric, date, text, text) to authenticated;
grant execute on function public.cfp_reverse_investment_transaction(uuid, date, text) to authenticated;
grant execute on function public.cfp_record_investment_valuation(uuid, jsonb) to authenticated;
