\set ON_ERROR_STOP on

begin;

insert into public.agencies (id, name, slug, status)
values ('90000000-0000-0000-0000-000000000002', 'Synthetic Other Agency', 'synthetic-other-agency', 'active');

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('91111111-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'portfolio-adviser@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('92222222-0000-0000-0000-000000000012', 'authenticated', 'authenticated', 'portfolio-client@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('93333333-0000-0000-0000-000000000013', 'authenticated', 'authenticated', 'unassigned-adviser@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('94444444-0000-0000-0000-000000000014', 'authenticated', 'authenticated', 'other-agency-adviser@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.user_profiles (id, email, full_name, role, status, agency_id)
values
  ('91111111-0000-0000-0000-000000000011', 'portfolio-adviser@example.test', 'Synthetic Adviser', 'agent', 'active', '00000000-0000-0000-0000-000000000001'),
  ('92222222-0000-0000-0000-000000000012', 'portfolio-client@example.test', 'Synthetic Client', 'client', 'active', '00000000-0000-0000-0000-000000000001'),
  ('93333333-0000-0000-0000-000000000013', 'unassigned-adviser@example.test', 'Unassigned Adviser', 'agent', 'active', '00000000-0000-0000-0000-000000000001'),
  ('94444444-0000-0000-0000-000000000014', 'other-agency-adviser@example.test', 'Other Agency Adviser', 'agent', 'active', '90000000-0000-0000-0000-000000000002');

insert into public.agency_memberships (agency_id, user_id, role, status)
values
  ('00000000-0000-0000-0000-000000000001', '91111111-0000-0000-0000-000000000011', 'agent', 'active'),
  ('00000000-0000-0000-0000-000000000001', '92222222-0000-0000-0000-000000000012', 'client', 'active'),
  ('00000000-0000-0000-0000-000000000001', '93333333-0000-0000-0000-000000000013', 'agent', 'active'),
  ('90000000-0000-0000-0000-000000000002', '94444444-0000-0000-0000-000000000014', 'agent', 'active')
on conflict (agency_id, user_id) do update set role = excluded.role, status = excluded.status;

insert into public.customers (
  id, full_name, email, risk_profile, assigned_advisor_name,
  assigned_agent_user_id, client_user_id, agency_id
)
values
  ('90000000-0000-0000-0000-000000000021', 'Synthetic Portfolio Customer', 'portfolio-customer@example.test', 'moderate', 'Synthetic Adviser', '91111111-0000-0000-0000-000000000011', '92222222-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001'),
  ('90000000-0000-0000-0000-000000000022', 'Synthetic Other Customer', 'other-customer@example.test', 'conservative', 'Other Agency Adviser', '94444444-0000-0000-0000-000000000014', null, '90000000-0000-0000-0000-000000000002'),
  ('90000000-0000-0000-0000-000000000023', 'Synthetic Same Agency Customer', 'same-agency-customer@example.test', 'moderate', 'Synthetic Adviser', '91111111-0000-0000-0000-000000000011', null, '00000000-0000-0000-0000-000000000001');

create or replace function public.cfp_portfolio_test_reject_second_transfer_leg()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.transaction_type = 'transfer_in' and new.notes = 'Synthetic second-leg failure' then
    raise exception 'Synthetic second transfer leg failure' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger portfolio_test_reject_second_transfer_leg
before insert on public.investment_transactions
for each row execute function public.cfp_portfolio_test_reject_second_transfer_leg();

create or replace function public.cfp_portfolio_test_reject_audit()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.action = current_setting('portfolio_test.fail_audit_action', true) then
    raise exception 'Synthetic required audit failure' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger portfolio_test_reject_audit
before insert on public.audit_logs
for each row execute function public.cfp_portfolio_test_reject_audit();

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.cfp_numeric_is_finite(numeric)',
    'public.cfp_investment_transaction_scope_is_valid(text, text)',
    'public.cfp_investment_transaction_amounts_are_valid(text, uuid, numeric, numeric, numeric, numeric, numeric)',
    'public.cfp_prepare_investment_portfolio()',
    'public.cfp_prepare_investment_holding()',
    'public.cfp_prepare_portfolio_benchmark()',
    'public.cfp_can_access_investment_portfolio(uuid)',
    'public.cfp_can_manage_investment_portfolio(uuid)',
    'public.cfp_investment_actor_name()',
    'public.cfp_create_investment_portfolio(uuid, jsonb)',
    'public.cfp_create_investment_holding(uuid, jsonb)',
    'public.cfp_record_investment_transaction(uuid, jsonb)',
    'public.cfp_record_investment_transfer(uuid, uuid, date, numeric, text, numeric, date, text, text)',
    'public.cfp_reverse_investment_transaction(uuid, date, text)',
    'public.cfp_record_investment_valuation(uuid, jsonb)'
  ] loop
    if to_regprocedure(signature) is null then
      raise exception 'Portfolio function is missing: %', signature;
    end if;
    if has_function_privilege('anon', signature, 'EXECUTE') then
      raise exception 'Anonymous execution remained available for %', signature;
    end if;
    if has_function_privilege('service_role', signature, 'EXECUTE') then
      raise exception 'Service-role execution remained available for %', signature;
    end if;
    if exists (
      select 1
      from pg_catalog.pg_proc function_row
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          function_row.proacl,
          pg_catalog.acldefault('f', function_row.proowner)
        )
      ) privilege_row
      where function_row.oid = to_regprocedure(signature)
        and privilege_row.grantee = 0
        and privilege_row.privilege_type = 'EXECUTE'
    ) then
      raise exception 'PUBLIC execution remained available for %', signature;
    end if;
  end loop;

  foreach signature in array array[
    'public.cfp_can_access_investment_portfolio(uuid)',
    'public.cfp_can_manage_investment_portfolio(uuid)',
    'public.cfp_create_investment_portfolio(uuid, jsonb)',
    'public.cfp_create_investment_holding(uuid, jsonb)',
    'public.cfp_record_investment_transaction(uuid, jsonb)',
    'public.cfp_record_investment_transfer(uuid, uuid, date, numeric, text, numeric, date, text, text)',
    'public.cfp_reverse_investment_transaction(uuid, date, text)',
    'public.cfp_record_investment_valuation(uuid, jsonb)'
  ] loop
    if not has_function_privilege('authenticated', signature, 'EXECUTE') then
      raise exception 'Authenticated execution is missing for %', signature;
    end if;
  end loop;

  foreach signature in array array[
    'public.cfp_numeric_is_finite(numeric)',
    'public.cfp_investment_transaction_scope_is_valid(text, text)',
    'public.cfp_investment_transaction_amounts_are_valid(text, uuid, numeric, numeric, numeric, numeric, numeric)',
    'public.cfp_prepare_investment_portfolio()',
    'public.cfp_prepare_investment_holding()',
    'public.cfp_prepare_portfolio_benchmark()',
    'public.cfp_investment_actor_name()'
  ] loop
    if has_function_privilege('authenticated', signature, 'EXECUTE') then
      raise exception 'Authenticated direct execution remained available for private helper %', signature;
    end if;
  end loop;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91111111-0000-0000-0000-000000000011","email":"portfolio-adviser@example.test","role":"authenticated"}',
  true
);

select set_config('portfolio_test.primary_portfolio_id', public.cfp_create_investment_portfolio(
  '90000000-0000-0000-0000-000000000021',
  '{"name":"Synthetic Core Portfolio","portfolio_type":"general","base_currency":"myr"}'::jsonb
)::text, true);

select set_config('portfolio_test.secondary_portfolio_id', public.cfp_create_investment_portfolio(
  '90000000-0000-0000-0000-000000000021',
  '{"name":"Synthetic Reserve Portfolio","portfolio_type":"income","base_currency":"MYR"}'::jsonb
)::text, true);

select set_config('portfolio_test.same_agency_other_customer_portfolio_id', public.cfp_create_investment_portfolio(
  '90000000-0000-0000-0000-000000000023',
  '{"name":"Synthetic Other Customer Portfolio","portfolio_type":"general","base_currency":"MYR"}'::jsonb
)::text, true);

do $$
begin
  if (select agency_id from public.investment_portfolios where id = current_setting('portfolio_test.primary_portfolio_id')::uuid)
      is distinct from '00000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'Portfolio agency was not derived from its customer';
  end if;
end;
$$;

do $$
begin
  perform public.cfp_create_investment_portfolio(
    '90000000-0000-0000-0000-000000000022',
    '{"name":"Forbidden cross-agency portfolio"}'::jsonb
  );
  raise exception 'Expected cross-agency portfolio creation to fail';
exception when insufficient_privilege then null;
end;
$$;

select set_config('portfolio_test.primary_holding_id', public.cfp_create_investment_holding(
  current_setting('portfolio_test.primary_portfolio_id')::uuid,
  '{"name":"Synthetic Global Fund","instrument_type":"unit_trust","asset_class":"mixed","geography_code":"MY","provider_name":"Synthetic Provider","symbol":"SGF","isin":"MY0000000001","currency_code":"usd","quantity_mode":"units","risk_rating":"4","risk_source":"Synthetic questionnaire","risk_assessed_on":"2026-01-01","opened_on":"2026-01-01"}'::jsonb
)::text, true);

select set_config('portfolio_test.secondary_holding_id', public.cfp_create_investment_holding(
  current_setting('portfolio_test.secondary_portfolio_id')::uuid,
  '{"name":"Synthetic Cash Holding","instrument_type":"cash","asset_class":"cash","currency_code":"MYR","quantity_mode":"manual_value"}'::jsonb
)::text, true);

do $$
declare
  holding_count_before bigint := (select count(*) from public.investment_holdings);
begin
  begin
    perform public.cfp_create_investment_holding(
      current_setting('portfolio_test.primary_portfolio_id')::uuid,
      '{"name":"Synthetic Rated Holding Without Source","instrument_type":"unit_trust","asset_class":"mixed","currency_code":"MYR","quantity_mode":"units","risk_rating":"4","risk_source":null}'::jsonb
    );
    raise exception 'Expected a risk rating without a source to fail';
  exception when check_violation then null;
  end;

  if (select count(*) from public.investment_holdings) <> holding_count_before then
    raise exception 'Invalid rated holding entered the portfolio after rejection';
  end if;
end;
$$;

do $$
begin
  perform public.cfp_record_investment_transaction(
    current_setting('portfolio_test.secondary_portfolio_id')::uuid,
    jsonb_build_object(
      'holding_id', current_setting('portfolio_test.primary_holding_id')::uuid, 'transaction_date', '2026-01-02',
      'transaction_type', 'buy', 'quantity', 1, 'gross_amount', 100,
      'currency_code', 'MYR', 'fx_rate_to_base', 1, 'cash_flow_scope', 'internal'
    )
  );
  raise exception 'Expected cross-portfolio holding link to fail';
exception when check_violation then null;
end;
$$;

do $$
begin
  perform public.cfp_record_investment_transaction(
    current_setting('portfolio_test.primary_portfolio_id')::uuid,
    '{"transaction_date":"2026-01-05","transaction_type":"contribution","gross_amount":10,"currency_code":"MYR","fx_rate_to_base":1,"cash_flow_scope":"external_out"}'::jsonb
  );
  raise exception 'Expected incompatible transaction scope to fail';
exception when check_violation then null;
end;
$$;

do $$
declare
  transaction_count_before bigint := (select count(*) from public.investment_transactions);
begin
  begin
    perform public.cfp_record_investment_transaction(
      current_setting('portfolio_test.primary_portfolio_id')::uuid,
      '{"transaction_date":"2026-01-05","transaction_type":"contribution","gross_amount":10,"currency_code":"MYR","fx_rate_to_base":4,"cash_flow_scope":"external_in"}'::jsonb
    );
    raise exception 'Expected base-currency transaction with unrelated FX to fail';
  exception when check_violation then null;
  end;

  if (select count(*) from public.investment_transactions) <> transaction_count_before then
    raise exception 'Invalid same-currency FX transaction entered immutable history';
  end if;
end;
$$;

select set_config('portfolio_test.fee_id', public.cfp_record_investment_transaction(
  current_setting('portfolio_test.primary_portfolio_id')::uuid,
  '{"transaction_date":"2026-01-05","transaction_type":"fee","gross_amount":0,"fee_amount":25,"tax_amount":0,"currency_code":"MYR","fx_rate_to_base":1,"cash_flow_scope":"internal"}'::jsonb
)::text, true);

select set_config('portfolio_test.tax_id', public.cfp_record_investment_transaction(
  current_setting('portfolio_test.primary_portfolio_id')::uuid,
  '{"transaction_date":"2026-01-05","transaction_type":"tax","gross_amount":0,"fee_amount":0,"tax_amount":15,"currency_code":"MYR","fx_rate_to_base":1,"cash_flow_scope":"internal"}'::jsonb
)::text, true);

do $$
begin
  perform public.cfp_record_investment_transaction(
    current_setting('portfolio_test.primary_portfolio_id')::uuid,
    '{"transaction_date":"2026-01-05","transaction_type":"fee","gross_amount":25,"fee_amount":25,"tax_amount":0,"currency_code":"MYR","fx_rate_to_base":1,"cash_flow_scope":"internal"}'::jsonb
  );
  raise exception 'Expected ambiguous fee amounts to fail';
exception when check_violation then null;
end;
$$;

do $$
declare
  invalid_payload jsonb;
  transaction_count_before bigint;
begin
  select count(*) into transaction_count_before from public.investment_transactions;
  foreach invalid_payload in array array[
    '{"transaction_date":"2026-01-05","transaction_type":"contribution","gross_amount":"NaN","currency_code":"MYR","fx_rate_to_base":1,"cash_flow_scope":"external_in"}'::jsonb,
    '{"transaction_date":"2026-01-05","transaction_type":"fee","gross_amount":0,"fee_amount":"NaN","tax_amount":0,"currency_code":"MYR","fx_rate_to_base":1,"cash_flow_scope":"internal"}'::jsonb,
    '{"transaction_date":"2026-01-05","transaction_type":"tax","gross_amount":0,"fee_amount":0,"tax_amount":"NaN","currency_code":"MYR","fx_rate_to_base":1,"cash_flow_scope":"internal"}'::jsonb,
    jsonb_build_object('holding_id', current_setting('portfolio_test.primary_holding_id')::uuid, 'transaction_date', '2026-01-05', 'transaction_type', 'buy', 'quantity', 'NaN', 'gross_amount', 100, 'currency_code', 'MYR', 'fx_rate_to_base', 1, 'cash_flow_scope', 'internal'),
    jsonb_build_object('holding_id', current_setting('portfolio_test.primary_holding_id')::uuid, 'transaction_date', '2026-01-05', 'transaction_type', 'buy', 'quantity', 1, 'unit_price', 'NaN', 'gross_amount', 100, 'currency_code', 'MYR', 'fx_rate_to_base', 1, 'cash_flow_scope', 'internal'),
    '{"transaction_date":"2026-01-05","transaction_type":"contribution","gross_amount":10,"currency_code":"MYR","fx_rate_to_base":"NaN","cash_flow_scope":"external_in"}'::jsonb,
    '{"transaction_date":"2026-01-05","transaction_type":"contribution","gross_amount":"Infinity","currency_code":"MYR","fx_rate_to_base":1,"cash_flow_scope":"external_in"}'::jsonb,
    '{"transaction_date":"2026-01-05","transaction_type":"contribution","gross_amount":"-Infinity","currency_code":"MYR","fx_rate_to_base":1,"cash_flow_scope":"external_in"}'::jsonb
  ] loop
    begin
      perform public.cfp_record_investment_transaction(
        current_setting('portfolio_test.primary_portfolio_id')::uuid,
        invalid_payload
      );
      raise exception 'Expected non-finite transaction payload to fail: %', invalid_payload;
    exception when check_violation then
      if sqlerrm not like '%must be finite numbers%' then
        raise exception 'Non-finite transaction failed without the finite-number error: %', sqlerrm;
      end if;
    end;
  end loop;

  if (select count(*) from public.investment_transactions) <> transaction_count_before then
    raise exception 'A non-finite transaction payload entered immutable history';
  end if;
end;
$$;

do $$
begin
  perform public.cfp_record_investment_transaction(
    current_setting('portfolio_test.primary_portfolio_id')::uuid,
    '{"transaction_date":"2026-01-05","transaction_type":"tax","gross_amount":0,"fee_amount":1,"tax_amount":15,"currency_code":"MYR","fx_rate_to_base":1,"cash_flow_scope":"internal"}'::jsonb
  );
  raise exception 'Expected ambiguous tax amounts to fail';
exception when check_violation then null;
end;
$$;

do $$
declare
  transaction_count_before bigint;
begin
  select count(*) into transaction_count_before from public.investment_transactions;
  perform set_config('portfolio_test.fail_audit_action', 'investment_transaction_recorded', true);
  begin
    perform public.cfp_record_investment_transaction(
      current_setting('portfolio_test.primary_portfolio_id')::uuid,
      '{"transaction_date":"2026-01-05","transaction_type":"interest","gross_amount":1,"currency_code":"MYR","fx_rate_to_base":1,"cash_flow_scope":"internal"}'::jsonb
    );
    raise exception 'Expected required transaction audit failure';
  exception when check_violation then null;
  end;
  perform set_config('portfolio_test.fail_audit_action', '', true);
  if (select count(*) from public.investment_transactions) <> transaction_count_before then
    raise exception 'Transaction committed despite required audit failure';
  end if;
end;
$$;

select set_config('portfolio_test.contribution_id', public.cfp_record_investment_transaction(
  current_setting('portfolio_test.primary_portfolio_id')::uuid,
  '{"transaction_date":"2026-01-03","transaction_type":"contribution","gross_amount":10000,"currency_code":"MYR","fx_rate_to_base":1,"cash_flow_scope":"external_in"}'::jsonb
)::text, true);

select set_config('portfolio_test.buy_id', public.cfp_record_investment_transaction(
  current_setting('portfolio_test.primary_portfolio_id')::uuid,
  jsonb_build_object(
    'holding_id', current_setting('portfolio_test.primary_holding_id')::uuid, 'transaction_date', '2026-01-04',
    'transaction_type', 'buy', 'quantity', 100, 'unit_price', 20,
    'gross_amount', 2000, 'currency_code', 'USD', 'fx_rate_to_base', 4.4,
    'fx_rate_date', '2026-01-04', 'fx_source', 'Synthetic statement',
    'cash_flow_scope', 'internal'
  )
)::text, true);

do $$
declare
  transaction_count_before bigint;
  original_before jsonb;
begin
  select count(*) into transaction_count_before from public.investment_transactions;
  select to_jsonb(t) into original_before
  from public.investment_transactions t
  where t.id = current_setting('portfolio_test.buy_id')::uuid;

  perform set_config('portfolio_test.fail_audit_action', 'investment_transaction_reversed', true);
  begin
    perform public.cfp_reverse_investment_transaction(
      current_setting('portfolio_test.buy_id')::uuid,
      '2026-01-06',
      'Synthetic reversal audit failure'
    );
    raise exception 'Expected required reversal audit failure';
  exception when check_violation then null;
  end;
  perform set_config('portfolio_test.fail_audit_action', '', true);

  if (select count(*) from public.investment_transactions) <> transaction_count_before
    or exists (
      select 1 from public.investment_transactions
      where reversal_of_transaction_id = current_setting('portfolio_test.buy_id')::uuid
    )
    or (select to_jsonb(t) from public.investment_transactions t
        where t.id = current_setting('portfolio_test.buy_id')::uuid) is distinct from original_before then
    raise exception 'Reversal state changed despite required audit failure';
  end if;
end;
$$;

do $$
begin
  perform public.cfp_record_investment_transaction(
    current_setting('portfolio_test.primary_portfolio_id')::uuid,
    '{"transaction_date":"2026-01-05","transaction_type":"unknown","gross_amount":10,"currency_code":"MYR","fx_rate_to_base":1,"cash_flow_scope":"internal"}'::jsonb
  );
  raise exception 'Expected invalid transaction type to fail';
exception when check_violation then null;
end;
$$;

do $$
begin
  perform public.cfp_record_investment_transaction(
    current_setting('portfolio_test.primary_portfolio_id')::uuid,
    '{"transaction_date":"2026-01-05","transaction_type":"fee","gross_amount":-1,"currency_code":"MYR","fx_rate_to_base":1,"cash_flow_scope":"internal"}'::jsonb
  );
  raise exception 'Expected negative transaction amount to fail';
exception when check_violation then null;
end;
$$;

select set_config('portfolio_test.contribution_reversal_id', public.cfp_reverse_investment_transaction(
  current_setting('portfolio_test.contribution_id')::uuid, '2026-01-06', 'Synthetic correction'
)::text, true);

do $$
begin
  if not exists (
    select 1 from public.investment_transactions
    where id = current_setting('portfolio_test.contribution_reversal_id')::uuid
      and transaction_type = 'reversal'
      and reversal_of_transaction_id = current_setting('portfolio_test.contribution_id')::uuid
  ) then
    raise exception 'Reversal relationship was not recorded';
  end if;
  perform public.cfp_reverse_investment_transaction(current_setting('portfolio_test.contribution_id')::uuid, '2026-01-07', 'Duplicate');
  raise exception 'Expected duplicate reversal to fail';
exception when unique_violation then null;
end;
$$;

do $$
begin
  perform public.cfp_reverse_investment_transaction(
    current_setting('portfolio_test.contribution_reversal_id')::uuid,
    '2026-01-07',
    'Forbidden reversal chain'
  );
  raise exception 'Expected reversal of a reversal to fail';
exception when check_violation then null;
end;
$$;

do $$
declare
  transaction_count_before bigint;
  invalid_amount numeric;
begin
  select count(*) into transaction_count_before from public.investment_transactions;
  foreach invalid_amount in array array['NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric] loop
    begin
      perform public.cfp_record_investment_transfer(
        current_setting('portfolio_test.primary_portfolio_id')::uuid,
        current_setting('portfolio_test.secondary_portfolio_id')::uuid,
        '2026-01-08', invalid_amount, 'MYR', 1, null, null,
        'Synthetic non-finite transfer amount'
      );
      raise exception 'Expected non-finite transfer amount to fail: %', invalid_amount;
    exception when check_violation then
      if sqlerrm not like '%must be finite numbers%' then
        raise exception 'Non-finite transfer amount failed without the finite-number error: %', sqlerrm;
      end if;
    end;
    begin
      perform public.cfp_record_investment_transfer(
        current_setting('portfolio_test.primary_portfolio_id')::uuid,
        current_setting('portfolio_test.secondary_portfolio_id')::uuid,
        '2026-01-08', 1, 'USD', invalid_amount, '2026-01-08', 'Synthetic FX source',
        'Synthetic non-finite transfer FX'
      );
      raise exception 'Expected non-finite transfer FX to fail: %', invalid_amount;
    exception when check_violation then
      if sqlerrm not like '%must be finite numbers%' then
        raise exception 'Non-finite transfer FX failed without the finite-number error: %', sqlerrm;
      end if;
    end;
  end loop;

  if (select count(*) from public.investment_transactions) <> transaction_count_before then
    raise exception 'A non-finite transfer entered immutable history';
  end if;
end;
$$;

select set_config('portfolio_test.transfer_group_id', public.cfp_record_investment_transfer(
  current_setting('portfolio_test.primary_portfolio_id')::uuid, current_setting('portfolio_test.secondary_portfolio_id')::uuid, '2026-01-08',
  500, 'MYR', 1, null, null, 'Synthetic internal transfer'
)::text, true);

do $$
begin
  perform public.cfp_record_investment_transfer(
    current_setting('portfolio_test.primary_portfolio_id')::uuid,
    current_setting('portfolio_test.same_agency_other_customer_portfolio_id')::uuid,
    '2026-01-08', 100, 'MYR', 1, null, null, 'Forbidden cross-customer transfer'
  );
  raise exception 'Expected same-agency cross-customer transfer to fail';
exception when check_violation then null;
end;
$$;

do $$
declare
  transaction_count_before bigint;
begin
  select count(*) into transaction_count_before from public.investment_transactions;
  begin
    perform public.cfp_record_investment_transfer(
      current_setting('portfolio_test.primary_portfolio_id')::uuid,
      current_setting('portfolio_test.secondary_portfolio_id')::uuid,
      '2026-01-09', 100, 'MYR', 1, null, null, 'Synthetic second-leg failure'
    );
    raise exception 'Expected synthetic second transfer leg failure';
  exception when check_violation then null;
  end;
  if (select count(*) from public.investment_transactions) <> transaction_count_before then
    raise exception 'First transfer leg committed after the second leg failed';
  end if;
end;
$$;

do $$
declare
  transaction_count_before bigint;
begin
  select count(*) into transaction_count_before from public.investment_transactions;
  perform set_config('portfolio_test.fail_audit_action', 'investment_transfer_recorded', true);
  begin
    perform public.cfp_record_investment_transfer(
      current_setting('portfolio_test.primary_portfolio_id')::uuid,
      current_setting('portfolio_test.secondary_portfolio_id')::uuid,
      '2026-01-09', 100, 'MYR', 1, null, null, 'Synthetic transfer audit failure'
    );
    raise exception 'Expected required transfer audit failure';
  exception when check_violation then null;
  end;
  perform set_config('portfolio_test.fail_audit_action', '', true);
  if (select count(*) from public.investment_transactions) <> transaction_count_before then
    raise exception 'Transfer legs committed despite required audit failure';
  end if;
end;
$$;

do $$
begin
  if (select count(*) from public.investment_transactions where transfer_group_id = current_setting('portfolio_test.transfer_group_id')::uuid) <> 2 then
    raise exception 'Paired transfer did not create exactly two ledger rows';
  end if;
  if exists (
    select 1 from public.investment_transactions
    where transfer_group_id = current_setting('portfolio_test.transfer_group_id')::uuid and cash_flow_scope <> 'internal'
  ) then
    raise exception 'Paired transfer was not classified as internal';
  end if;
end;
$$;

do $$
declare
  transaction_count_before bigint;
  transfer_transaction_id uuid;
begin
  select count(*) into transaction_count_before from public.investment_transactions;
  select id into strict transfer_transaction_id
  from public.investment_transactions
  where transfer_group_id = current_setting('portfolio_test.transfer_group_id')::uuid
  order by transaction_type
  limit 1;

  perform set_config('portfolio_test.fail_audit_action', 'investment_transaction_reversed', true);
  begin
    perform public.cfp_reverse_investment_transaction(
      transfer_transaction_id,
      '2026-01-10',
      'Synthetic paired reversal audit failure'
    );
    raise exception 'Expected required paired reversal audit failure';
  exception when check_violation then null;
  end;
  perform set_config('portfolio_test.fail_audit_action', '', true);

  if (select count(*) from public.investment_transactions) <> transaction_count_before
    or exists (
      select 1
      from public.investment_transactions reversal
      join public.investment_transactions original
        on original.id = reversal.reversal_of_transaction_id
      where original.transfer_group_id = current_setting('portfolio_test.transfer_group_id')::uuid
    ) then
    raise exception 'A partial transfer reversal remained after required audit failure';
  end if;
end;
$$;

select set_config('portfolio_test.original_holding_valuation_id', public.cfp_record_investment_valuation(
  current_setting('portfolio_test.primary_portfolio_id')::uuid,
  jsonb_build_object(
    'valuation_scope', 'holding', 'holding_id', current_setting('portfolio_test.primary_holding_id')::uuid,
    'valuation_date', '2026-01-31', 'market_value', 2500, 'units', 100,
    'unit_price', 25, 'currency_code', 'USD', 'fx_rate_to_base', 4.5,
    'fx_rate_date', '2026-01-31', 'fx_source', 'Synthetic statement',
    'source', 'provider_statement', 'evidence_status', 'client_provided'
  )
)::text, true);

select set_config('portfolio_test.portfolio_valuation_id', public.cfp_record_investment_valuation(
  current_setting('portfolio_test.primary_portfolio_id')::uuid,
  '{"valuation_scope":"portfolio","valuation_date":"2026-01-31","market_value":15000,"currency_code":"MYR","fx_rate_to_base":1,"source":"manual","evidence_status":"unverified"}'::jsonb
)::text, true);

do $$
declare
  valuation_count_before bigint := (select count(*) from public.investment_valuations);
  invalid_payload jsonb;
begin
  foreach invalid_payload in array array[
    jsonb_build_object(
      'valuation_scope', 'portfolio',
      'holding_id', current_setting('portfolio_test.primary_holding_id')::uuid,
      'valuation_date', '2026-02-10', 'market_value', 100,
      'currency_code', 'MYR', 'fx_rate_to_base', 1,
      'source', 'manual', 'evidence_status', 'unverified'
    ),
    '{"valuation_scope":"holding","holding_id":null,"valuation_date":"2026-02-10","market_value":100,"currency_code":"MYR","fx_rate_to_base":1,"source":"manual","evidence_status":"unverified"}'::jsonb,
    '{"valuation_scope":"portfolio","holding_id":null,"valuation_date":"2026-02-10","market_value":100,"currency_code":"MYR","fx_rate_to_base":4,"source":"manual","evidence_status":"unverified"}'::jsonb
  ] loop
    begin
      perform public.cfp_record_investment_valuation(
        current_setting('portfolio_test.primary_portfolio_id')::uuid,
        invalid_payload
      );
      raise exception 'Expected invalid valuation scope or FX payload to fail: %', invalid_payload;
    exception when check_violation then null;
    end;
  end loop;

  if (select count(*) from public.investment_valuations) <> valuation_count_before then
    raise exception 'Invalid scope or same-currency FX valuation entered immutable history';
  end if;
end;
$$;

select set_config('portfolio_test.superseding_valuation_id', public.cfp_record_investment_valuation(
  current_setting('portfolio_test.primary_portfolio_id')::uuid,
  jsonb_build_object(
    'valuation_scope', 'holding', 'holding_id', current_setting('portfolio_test.primary_holding_id')::uuid,
    'valuation_date', '2026-01-31', 'market_value', 2550,
    'currency_code', 'USD', 'fx_rate_to_base', 4.5,
    'fx_rate_date', '2026-01-31', 'fx_source', 'Synthetic correction',
    'source', 'manual', 'evidence_status', 'adviser_verified',
    'supersedes_valuation_id', current_setting('portfolio_test.original_holding_valuation_id')::uuid
  )
)::text, true);

do $$
declare
  invalid_payload jsonb;
  valuation_count_before bigint;
begin
  select count(*) into valuation_count_before from public.investment_valuations;
  foreach invalid_payload in array array[
    '{"valuation_scope":"portfolio","valuation_date":"2026-02-02","market_value":"NaN","currency_code":"MYR","fx_rate_to_base":1,"source":"manual","evidence_status":"unverified"}'::jsonb,
    jsonb_build_object('valuation_scope', 'holding', 'holding_id', current_setting('portfolio_test.primary_holding_id')::uuid, 'valuation_date', '2026-02-02', 'market_value', 10, 'units', 'NaN', 'currency_code', 'MYR', 'fx_rate_to_base', 1, 'source', 'manual', 'evidence_status', 'unverified'),
    jsonb_build_object('valuation_scope', 'holding', 'holding_id', current_setting('portfolio_test.primary_holding_id')::uuid, 'valuation_date', '2026-02-02', 'market_value', 10, 'unit_price', 'NaN', 'currency_code', 'MYR', 'fx_rate_to_base', 1, 'source', 'manual', 'evidence_status', 'unverified'),
    '{"valuation_scope":"portfolio","valuation_date":"2026-02-02","market_value":10,"currency_code":"MYR","fx_rate_to_base":"NaN","source":"manual","evidence_status":"unverified"}'::jsonb,
    '{"valuation_scope":"portfolio","valuation_date":"2026-02-02","market_value":"Infinity","currency_code":"MYR","fx_rate_to_base":1,"source":"manual","evidence_status":"unverified"}'::jsonb,
    '{"valuation_scope":"portfolio","valuation_date":"2026-02-02","market_value":"-Infinity","currency_code":"MYR","fx_rate_to_base":1,"source":"manual","evidence_status":"unverified"}'::jsonb
  ] loop
    begin
      perform public.cfp_record_investment_valuation(
        current_setting('portfolio_test.primary_portfolio_id')::uuid,
        invalid_payload
      );
      raise exception 'Expected non-finite valuation payload to fail: %', invalid_payload;
    exception when check_violation then
      if sqlerrm not like '%must be finite numbers%' then
        raise exception 'Non-finite valuation failed without the finite-number error: %', sqlerrm;
      end if;
    end;
  end loop;

  if (select count(*) from public.investment_valuations) <> valuation_count_before then
    raise exception 'A non-finite valuation payload entered immutable history';
  end if;
end;
$$;

select set_config('portfolio_test.audit_rollback_valuation_id', public.cfp_record_investment_valuation(
  current_setting('portfolio_test.primary_portfolio_id')::uuid,
  '{"valuation_scope":"portfolio","valuation_date":"2026-02-02","market_value":5000,"currency_code":"MYR","fx_rate_to_base":1,"source":"manual","evidence_status":"adviser_verified"}'::jsonb
)::text, true);

do $$
declare
  valuation_count_before bigint;
  original_before jsonb;
begin
  select count(*) into valuation_count_before from public.investment_valuations;
  select to_jsonb(v) into original_before
  from public.investment_valuations v
  where v.id = current_setting('portfolio_test.audit_rollback_valuation_id')::uuid;

  perform set_config('portfolio_test.fail_audit_action', 'investment_valuation_recorded', true);
  begin
    perform public.cfp_record_investment_valuation(
      current_setting('portfolio_test.primary_portfolio_id')::uuid,
      jsonb_build_object(
        'valuation_scope', 'portfolio',
        'valuation_date', '2026-02-02',
        'market_value', 5100,
        'currency_code', 'MYR',
        'fx_rate_to_base', 1,
        'source', 'manual',
        'evidence_status', 'adviser_verified',
        'supersedes_valuation_id', current_setting('portfolio_test.audit_rollback_valuation_id')::uuid
      )
    );
    raise exception 'Expected required valuation audit failure';
  exception when check_violation then null;
  end;
  perform set_config('portfolio_test.fail_audit_action', '', true);

  if (select count(*) from public.investment_valuations) <> valuation_count_before
    or exists (
      select 1 from public.investment_valuations
      where supersedes_valuation_id = current_setting('portfolio_test.audit_rollback_valuation_id')::uuid
    )
    or (select to_jsonb(v) from public.investment_valuations v
        where v.id = current_setting('portfolio_test.audit_rollback_valuation_id')::uuid) is distinct from original_before then
    raise exception 'Valuation authority changed despite required audit failure';
  end if;
end;
$$;

do $$
begin
  perform public.cfp_record_investment_valuation(
    current_setting('portfolio_test.primary_portfolio_id')::uuid,
    '{"valuation_scope":"portfolio","valuation_date":"2026-01-31","market_value":16000,"currency_code":"MYR","fx_rate_to_base":1,"source":"manual","evidence_status":"unverified"}'::jsonb
  );
  raise exception 'Expected duplicate active valuation to fail';
exception when unique_violation then null;
end;
$$;

do $$
begin
  perform public.cfp_record_investment_valuation(
    current_setting('portfolio_test.primary_portfolio_id')::uuid,
    '{"valuation_scope":"portfolio","valuation_date":"2026-02-01","market_value":-1,"currency_code":"MYR","fx_rate_to_base":1,"source":"manual","evidence_status":"unverified"}'::jsonb
  );
  raise exception 'Expected negative valuation to fail';
exception when check_violation then null;
end;
$$;

do $$
begin
  perform public.cfp_record_investment_valuation(
    current_setting('portfolio_test.primary_portfolio_id')::uuid,
    jsonb_build_object(
      'valuation_scope', 'holding', 'holding_id', current_setting('portfolio_test.secondary_holding_id')::uuid,
      'valuation_date', '2026-02-01', 'market_value', 1,
      'currency_code', 'MYR', 'fx_rate_to_base', 1,
      'source', 'manual', 'evidence_status', 'unverified'
    )
  );
  raise exception 'Expected cross-portfolio holding valuation to fail';
exception when check_violation then null;
end;
$$;

reset role;

do $$
declare
  command text;
  transaction_count_before bigint := (select count(*) from public.investment_transactions);
  valuation_count_before bigint := (select count(*) from public.investment_valuations);
  snapshot_count_before bigint := (select count(*) from public.portfolio_review_snapshots);
  benchmark_count_before bigint := (select count(*) from public.portfolio_benchmark_references);
begin
  if public.cfp_numeric_is_finite('NaN'::numeric)
    or public.cfp_numeric_is_finite('Infinity'::numeric)
    or public.cfp_numeric_is_finite('-Infinity'::numeric)
    or not public.cfp_numeric_is_finite(null)
    or not public.cfp_numeric_is_finite(1.25) then
    raise exception 'Finite-number predicate returned an incorrect result';
  end if;

  foreach command in array array[
    format('insert into public.investment_transactions (portfolio_id, transaction_date, transaction_type, gross_amount, currency_code, fx_rate_to_base, cash_flow_scope) values (%L::uuid, ''2026-03-01'', ''contribution'', ''NaN'', ''MYR'', 1, ''external_in'')', current_setting('portfolio_test.primary_portfolio_id')),
    format('insert into public.investment_transactions (portfolio_id, transaction_date, transaction_type, gross_amount, fee_amount, currency_code, fx_rate_to_base, cash_flow_scope) values (%L::uuid, ''2026-03-01'', ''fee'', 0, ''NaN'', ''MYR'', 1, ''internal'')', current_setting('portfolio_test.primary_portfolio_id')),
    format('insert into public.investment_transactions (portfolio_id, transaction_date, transaction_type, gross_amount, tax_amount, currency_code, fx_rate_to_base, cash_flow_scope) values (%L::uuid, ''2026-03-01'', ''tax'', 0, ''NaN'', ''MYR'', 1, ''internal'')', current_setting('portfolio_test.primary_portfolio_id')),
    format('insert into public.investment_transactions (portfolio_id, holding_id, transaction_date, transaction_type, quantity, gross_amount, currency_code, fx_rate_to_base, cash_flow_scope) values (%L::uuid, %L::uuid, ''2026-03-01'', ''buy'', ''NaN'', 1, ''MYR'', 1, ''internal'')', current_setting('portfolio_test.primary_portfolio_id'), current_setting('portfolio_test.primary_holding_id')),
    format('insert into public.investment_transactions (portfolio_id, holding_id, transaction_date, transaction_type, quantity, unit_price, gross_amount, currency_code, fx_rate_to_base, cash_flow_scope) values (%L::uuid, %L::uuid, ''2026-03-01'', ''buy'', 1, ''NaN'', 1, ''MYR'', 1, ''internal'')', current_setting('portfolio_test.primary_portfolio_id'), current_setting('portfolio_test.primary_holding_id')),
    format('insert into public.investment_transactions (portfolio_id, transaction_date, transaction_type, gross_amount, currency_code, fx_rate_to_base, cash_flow_scope) values (%L::uuid, ''2026-03-01'', ''contribution'', 1, ''MYR'', ''NaN'', ''external_in'')', current_setting('portfolio_test.primary_portfolio_id')),
    format('insert into public.investment_transactions (portfolio_id, transaction_date, transaction_type, gross_amount, currency_code, fx_rate_to_base, cash_flow_scope) values (%L::uuid, ''2026-03-01'', ''contribution'', ''Infinity'', ''MYR'', 1, ''external_in'')', current_setting('portfolio_test.primary_portfolio_id')),
    format('insert into public.investment_transactions (portfolio_id, transaction_date, transaction_type, gross_amount, currency_code, fx_rate_to_base, cash_flow_scope) values (%L::uuid, ''2026-03-01'', ''contribution'', ''-Infinity'', ''MYR'', 1, ''external_in'')', current_setting('portfolio_test.primary_portfolio_id')),
    format('insert into public.investment_valuations (portfolio_id, valuation_scope, valuation_date, market_value, currency_code, fx_rate_to_base) values (%L::uuid, ''portfolio'', ''2026-03-01'', ''NaN'', ''MYR'', 1)', current_setting('portfolio_test.primary_portfolio_id')),
    format('insert into public.investment_valuations (portfolio_id, holding_id, valuation_scope, valuation_date, market_value, units, currency_code, fx_rate_to_base) values (%L::uuid, %L::uuid, ''holding'', ''2026-03-01'', 1, ''NaN'', ''MYR'', 1)', current_setting('portfolio_test.primary_portfolio_id'), current_setting('portfolio_test.primary_holding_id')),
    format('insert into public.investment_valuations (portfolio_id, holding_id, valuation_scope, valuation_date, market_value, unit_price, currency_code, fx_rate_to_base) values (%L::uuid, %L::uuid, ''holding'', ''2026-03-01'', 1, ''NaN'', ''MYR'', 1)', current_setting('portfolio_test.primary_portfolio_id'), current_setting('portfolio_test.primary_holding_id')),
    format('insert into public.investment_valuations (portfolio_id, valuation_scope, valuation_date, market_value, currency_code, fx_rate_to_base) values (%L::uuid, ''portfolio'', ''2026-03-01'', 1, ''MYR'', ''NaN'')', current_setting('portfolio_test.primary_portfolio_id')),
    format('insert into public.portfolio_review_snapshots (portfolio_id, version_number, as_of_date, base_currency, methodology_version, total_value, created_by_name) values (%L::uuid, 91, ''2026-03-01'', ''MYR'', ''non-finite-test'', ''NaN'', ''Synthetic Adviser'')', current_setting('portfolio_test.primary_portfolio_id')),
    format('insert into public.portfolio_review_snapshots (portfolio_id, version_number, as_of_date, base_currency, methodology_version, total_value, simple_return_percent, created_by_name) values (%L::uuid, 92, ''2026-03-01'', ''MYR'', ''non-finite-test'', 1, ''NaN'', ''Synthetic Adviser'')', current_setting('portfolio_test.primary_portfolio_id')),
    format('insert into public.portfolio_review_snapshots (portfolio_id, version_number, as_of_date, base_currency, methodology_version, total_value, xirr_percent, created_by_name) values (%L::uuid, 93, ''2026-03-01'', ''MYR'', ''non-finite-test'', 1, ''NaN'', ''Synthetic Adviser'')', current_setting('portfolio_test.primary_portfolio_id')),
    format('insert into public.portfolio_benchmark_references (portfolio_id, name, weight_percent) values (%L::uuid, ''Non-finite benchmark'', ''NaN'')', current_setting('portfolio_test.primary_portfolio_id'))
  ] loop
    begin
      execute command;
      raise exception 'Expected database-level non-finite value to fail: %', command;
    exception when check_violation or numeric_value_out_of_range then null;
    end;
  end loop;

  if (select count(*) from public.investment_transactions) <> transaction_count_before
    or (select count(*) from public.investment_valuations) <> valuation_count_before
    or (select count(*) from public.portfolio_review_snapshots) <> snapshot_count_before
    or (select count(*) from public.portfolio_benchmark_references) <> benchmark_count_before then
    raise exception 'A direct database non-finite value entered a portfolio table';
  end if;
end;
$$;

insert into public.portfolio_review_snapshots (
  id, portfolio_id, version_number, period_start, as_of_date, base_currency,
  methodology_version, total_value, xirr_status, snapshot, created_by,
  created_by_name, review_notes
) values (
  '90000000-0000-0000-0000-000000000041',
  current_setting('portfolio_test.primary_portfolio_id')::uuid,
  1, '2026-01-01', '2026-01-31', 'MYR', 'phase-1-test', 15000,
  'not_calculated', '{}'::jsonb, '91111111-0000-0000-0000-000000000011',
  'Synthetic Adviser', 'Synthetic immutable snapshot'
);

insert into public.portfolio_benchmark_references (
  id, portfolio_id, name, code, currency_code, is_primary, effective_from
) values (
  '90000000-0000-0000-0000-000000000042',
  current_setting('portfolio_test.primary_portfolio_id')::uuid,
  'Synthetic Benchmark', 'SYNTH', 'MYR', true, '2026-01-01'
);

do $$
declare
  transaction_count_before bigint;
  valuation_count_before bigint;
  snapshot_count_before bigint;
  customer_delete_rejected boolean := false;
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.investment_portfolios'::regclass
      and constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.customers'::regclass
      and constraint_row.confdeltype = 'r'
  ) then
    raise exception 'Customer-to-portfolio foreign key is not restrictive';
  end if;
  select count(*) into transaction_count_before from public.investment_transactions
  where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid;
  select count(*) into valuation_count_before from public.investment_valuations
  where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid;
  select count(*) into snapshot_count_before from public.portfolio_review_snapshots
  where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid;

  begin
    delete from public.customers where id = '90000000-0000-0000-0000-000000000021'::uuid;
  exception when foreign_key_violation or raise_exception then
    customer_delete_rejected := true;
  end;
  if not customer_delete_rejected then
    raise exception 'Customer delete with portfolio history unexpectedly succeeded';
  end if;
  begin
    delete from public.investment_portfolios
    where id = current_setting('portfolio_test.primary_portfolio_id')::uuid;
    raise exception 'Expected portfolio delete with immutable history to fail';
  exception when foreign_key_violation then null;
  end;
  begin
    delete from public.investment_holdings
    where id = current_setting('portfolio_test.primary_holding_id')::uuid;
    raise exception 'Expected holding delete with immutable history to fail';
  exception when foreign_key_violation then null;
  end;

  if (select count(*) from public.investment_transactions
      where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid) <> transaction_count_before
    or (select count(*) from public.investment_valuations
        where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid) <> valuation_count_before
    or (select count(*) from public.portfolio_review_snapshots
        where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid) <> snapshot_count_before then
    raise exception 'Historical rows changed after a rejected parent deletion';
  end if;
end;
$$;

do $$
begin
  insert into public.investment_transactions (
    id, portfolio_id, transaction_date, transaction_type, gross_amount,
    currency_code, fx_rate_to_base, cash_flow_scope, reversal_of_transaction_id
  ) values (
    '90000000-0000-0000-0000-000000000043',
    current_setting('portfolio_test.primary_portfolio_id')::uuid,
    '2026-01-10', 'reversal', 1, 'MYR', 1, 'internal',
    '90000000-0000-0000-0000-000000000043'
  );
  raise exception 'Expected self-referencing reversal to fail';
exception when check_violation then null;
end;
$$;

do $$
begin
  insert into public.investment_transactions (
    id, portfolio_id, transaction_date, transaction_type, gross_amount,
    currency_code, fx_rate_to_base, cash_flow_scope, reversal_of_transaction_id
  ) values (
    '90000000-0000-0000-0000-000000000044',
    current_setting('portfolio_test.secondary_portfolio_id')::uuid,
    '2026-01-10', 'reversal', 2000, 'USD', 4.4, 'internal',
    current_setting('portfolio_test.buy_id')::uuid
  );
  raise exception 'Expected cross-portfolio reversal reference to fail';
exception when foreign_key_violation then null;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91111111-0000-0000-0000-000000000011","email":"portfolio-adviser@example.test","role":"authenticated"}',
  true
);

do $$
declare
  command text;
begin
  foreach command in array array[
    format('update public.investment_transactions set notes = notes where id = %L::uuid', current_setting('portfolio_test.buy_id')),
    format('delete from public.investment_transactions where id = %L::uuid', current_setting('portfolio_test.buy_id')),
    format('update public.investment_valuations set market_value = market_value where id = %L::uuid', current_setting('portfolio_test.portfolio_valuation_id')),
    format('delete from public.investment_valuations where id = %L::uuid', current_setting('portfolio_test.portfolio_valuation_id')),
    'update public.portfolio_review_snapshots set review_notes = review_notes where id = ''90000000-0000-0000-0000-000000000041''::uuid',
    'delete from public.portfolio_review_snapshots where id = ''90000000-0000-0000-0000-000000000041''::uuid'
  ] loop
    begin
      execute command;
      raise exception 'Expected destructive history mutation to be denied: %', command;
    exception when insufficient_privilege then null;
    end;
  end loop;
end;
$$;

do $$
begin
  if not exists (select 1 from public.investment_holdings where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid)
    or not exists (select 1 from public.investment_transactions where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid)
    or not exists (select 1 from public.investment_valuations where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid)
    or not exists (select 1 from public.portfolio_review_snapshots where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid)
    or not exists (select 1 from public.portfolio_benchmark_references where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid) then
    raise exception 'Authorized adviser could not read every portfolio child table';
  end if;
end;
$$;

reset role;
do $$
begin
  if (select count(*) from public.audit_logs where customer_id = '90000000-0000-0000-0000-000000000021' and action like 'investment_%') < 10 then
    raise exception 'Expected atomic investment audit events were not recorded';
  end if;
  if not exists (
    select 1 from public.audit_logs
    where entity_id = current_setting('portfolio_test.fee_id')::uuid
      and payload @> '{"transaction_type":"fee","gross_amount":0,"fee_amount":25,"tax_amount":0,"cash_flow_scope":"internal","currency_code":"MYR"}'::jsonb
  ) or not exists (
    select 1 from public.audit_logs
    where entity_id = current_setting('portfolio_test.tax_id')::uuid
      and payload @> '{"transaction_type":"tax","gross_amount":0,"fee_amount":0,"tax_amount":15,"cash_flow_scope":"internal","currency_code":"MYR"}'::jsonb
  ) then
    raise exception 'Fee or tax audit payload omitted canonical economic amount details';
  end if;
  if exists (
    select 1 from public.audit_logs
    where action in ('investment_transfer_recorded', 'investment_transaction_reversed')
      and not (payload ?& array['transaction_type', 'gross_amount', 'fee_amount', 'tax_amount', 'cash_flow_scope', 'currency_code'])
  ) then
    raise exception 'Transfer or reversal audit payload omitted canonical economic amount details';
  end if;
end;
$$;
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"92222222-0000-0000-0000-000000000012","email":"portfolio-client@example.test","role":"authenticated"}',
  true
);
do $$
begin
  if not public.cfp_can_access_investment_portfolio(current_setting('portfolio_test.primary_portfolio_id')::uuid) then
    raise exception 'Customer owner should be able to read their portfolio';
  end if;
  if public.cfp_can_manage_investment_portfolio(current_setting('portfolio_test.primary_portfolio_id')::uuid) then
    raise exception 'Customer owner must not manage the immutable portfolio foundation';
  end if;
  if not exists (select 1 from public.investment_holdings where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid)
    or not exists (select 1 from public.investment_transactions where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid)
    or not exists (select 1 from public.investment_valuations where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid)
    or not exists (select 1 from public.portfolio_review_snapshots where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid)
    or not exists (select 1 from public.portfolio_benchmark_references where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid) then
    raise exception 'Customer owner could not read every portfolio child table';
  end if;
  perform public.cfp_record_investment_transaction(
    current_setting('portfolio_test.primary_portfolio_id')::uuid,
    '{"transaction_date":"2026-02-01","transaction_type":"contribution","gross_amount":1,"currency_code":"MYR","fx_rate_to_base":1,"cash_flow_scope":"external_in"}'::jsonb
  );
  raise exception 'Expected customer financial mutation to fail';
exception when insufficient_privilege then null;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"93333333-0000-0000-0000-000000000013","email":"unassigned-adviser@example.test","role":"authenticated"}',
  true
);
do $$
begin
  if exists (select 1 from public.investment_portfolios where id = current_setting('portfolio_test.primary_portfolio_id')::uuid)
    or exists (select 1 from public.investment_holdings where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid)
    or exists (select 1 from public.investment_transactions where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid)
    or exists (select 1 from public.investment_valuations where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid)
    or exists (select 1 from public.portfolio_review_snapshots where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid)
    or exists (select 1 from public.portfolio_benchmark_references where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid) then
    raise exception 'Unassigned adviser could read another adviser portfolio data';
  end if;
end;
$$;

do $$
declare
  missing_state text;
  missing_message text;
  unauthorized_state text;
  unauthorized_message text;
begin
  begin
    perform public.cfp_reverse_investment_transaction(
      '99999999-0000-0000-0000-000000000099'::uuid,
      '2026-02-10',
      'Nonexistent reversal probe'
    );
  exception when others then
    get stacked diagnostics missing_state = returned_sqlstate, missing_message = message_text;
  end;
  begin
    perform public.cfp_reverse_investment_transaction(
      current_setting('portfolio_test.buy_id')::uuid,
      '2026-02-10',
      'Same-agency unauthorized reversal probe'
    );
  exception when others then
    get stacked diagnostics unauthorized_state = returned_sqlstate, unauthorized_message = message_text;
  end;

  if missing_state is null or unauthorized_state is null
    or missing_state is distinct from unauthorized_state
    or missing_message is distinct from unauthorized_message
    or missing_state <> '42501'
    or missing_message <> 'Transaction is unavailable for reversal.' then
    raise exception 'Same-agency unauthorized and nonexistent reversal probes were distinguishable';
  end if;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"94444444-0000-0000-0000-000000000014","email":"other-agency-adviser@example.test","role":"authenticated"}',
  true
);
do $$
begin
  if exists (select 1 from public.investment_portfolios where id = current_setting('portfolio_test.primary_portfolio_id')::uuid)
    or exists (select 1 from public.investment_holdings where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid)
    or exists (select 1 from public.investment_transactions where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid)
    or exists (select 1 from public.investment_valuations where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid)
    or exists (select 1 from public.portfolio_review_snapshots where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid)
    or exists (select 1 from public.portfolio_benchmark_references where portfolio_id = current_setting('portfolio_test.primary_portfolio_id')::uuid) then
    raise exception 'Cross-agency portfolio child read was not isolated';
  end if;
  perform public.cfp_record_investment_valuation(
    current_setting('portfolio_test.primary_portfolio_id')::uuid,
    '{"valuation_scope":"portfolio","valuation_date":"2026-02-01","market_value":1,"currency_code":"MYR","fx_rate_to_base":1,"source":"manual","evidence_status":"unverified"}'::jsonb
  );
  raise exception 'Expected cross-agency valuation mutation to fail';
exception when insufficient_privilege then null;
end;
$$;

do $$
declare
  missing_state text;
  missing_message text;
  unauthorized_state text;
  unauthorized_message text;
begin
  begin
    perform public.cfp_reverse_investment_transaction(
      '99999999-0000-0000-0000-000000000099'::uuid,
      '2026-02-10',
      'Nonexistent cross-agency reversal probe'
    );
  exception when others then
    get stacked diagnostics missing_state = returned_sqlstate, missing_message = message_text;
  end;
  begin
    perform public.cfp_reverse_investment_transaction(
      current_setting('portfolio_test.buy_id')::uuid,
      '2026-02-10',
      'Cross-agency unauthorized reversal probe'
    );
  exception when others then
    get stacked diagnostics unauthorized_state = returned_sqlstate, unauthorized_message = message_text;
  end;

  if missing_state is null or unauthorized_state is null
    or missing_state is distinct from unauthorized_state
    or missing_message is distinct from unauthorized_message
    or missing_state <> '42501'
    or missing_message <> 'Transaction is unavailable for reversal.' then
    raise exception 'Cross-agency unauthorized and nonexistent reversal probes were distinguishable';
  end if;
end;
$$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '{}', true);
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'investment_portfolios',
    'investment_holdings',
    'investment_transactions',
    'investment_valuations',
    'portfolio_benchmark_references',
    'portfolio_review_snapshots'
  ] loop
    begin
      execute format('select 1 from public.%I limit 1', table_name);
      raise exception 'Anonymous role unexpectedly read %', table_name;
    exception when insufficient_privilege then null;
    end;
  end loop;
end;
$$;

do $$
begin
  perform public.cfp_create_investment_portfolio(
    '90000000-0000-0000-0000-000000000021',
    '{"name":"Anonymous privilege probe"}'::jsonb
  );
  raise exception 'Anonymous role unexpectedly executed a Portfolio mutation RPC';
exception when insufficient_privilege then null;
end;
$$;

reset role;
rollback;

\echo 'Portfolio foundation integration checks passed; synthetic data rolled back.'
