-- Supabase grants API roles EXECUTE on newly created public functions through
-- database-level default privileges. Portfolio functions use an explicit
-- least-privilege model, so remove those inherited grants function by function.

-- Internal validation helpers are invoked by constraints or by owner-executed
-- SECURITY DEFINER RPCs. Trigger and actor helpers are likewise internal only.
revoke execute on function public.cfp_numeric_is_finite(numeric)
  from PUBLIC, anon, authenticated, service_role;
revoke execute on function public.cfp_investment_transaction_scope_is_valid(text, text)
  from PUBLIC, anon, authenticated, service_role;
revoke execute on function public.cfp_investment_transaction_amounts_are_valid(text, uuid, numeric, numeric, numeric, numeric, numeric)
  from PUBLIC, anon, authenticated, service_role;
revoke execute on function public.cfp_prepare_investment_portfolio()
  from PUBLIC, anon, authenticated, service_role;
revoke execute on function public.cfp_prepare_investment_holding()
  from PUBLIC, anon, authenticated, service_role;
revoke execute on function public.cfp_prepare_portfolio_benchmark()
  from PUBLIC, anon, authenticated, service_role;
revoke execute on function public.cfp_investment_actor_name()
  from PUBLIC, anon, authenticated, service_role;

-- Access helpers are called by authenticated Portfolio RLS policies. Mutation
-- RPCs are the only supported Data API write surface. Revoke every default API
-- role grant first, then restore authenticated execution explicitly.
revoke execute on function public.cfp_can_access_investment_portfolio(uuid)
  from PUBLIC, anon, authenticated, service_role;
revoke execute on function public.cfp_can_manage_investment_portfolio(uuid)
  from PUBLIC, anon, authenticated, service_role;
revoke execute on function public.cfp_create_investment_portfolio(uuid, jsonb)
  from PUBLIC, anon, authenticated, service_role;
revoke execute on function public.cfp_create_investment_holding(uuid, jsonb)
  from PUBLIC, anon, authenticated, service_role;
revoke execute on function public.cfp_record_investment_transaction(uuid, jsonb)
  from PUBLIC, anon, authenticated, service_role;
revoke execute on function public.cfp_record_investment_transfer(uuid, uuid, date, numeric, text, numeric, date, text, text)
  from PUBLIC, anon, authenticated, service_role;
revoke execute on function public.cfp_reverse_investment_transaction(uuid, date, text)
  from PUBLIC, anon, authenticated, service_role;
revoke execute on function public.cfp_record_investment_valuation(uuid, jsonb)
  from PUBLIC, anon, authenticated, service_role;

grant execute on function public.cfp_can_access_investment_portfolio(uuid)
  to authenticated;
grant execute on function public.cfp_can_manage_investment_portfolio(uuid)
  to authenticated;
grant execute on function public.cfp_create_investment_portfolio(uuid, jsonb)
  to authenticated;
grant execute on function public.cfp_create_investment_holding(uuid, jsonb)
  to authenticated;
grant execute on function public.cfp_record_investment_transaction(uuid, jsonb)
  to authenticated;
grant execute on function public.cfp_record_investment_transfer(uuid, uuid, date, numeric, text, numeric, date, text, text)
  to authenticated;
grant execute on function public.cfp_reverse_investment_transaction(uuid, date, text)
  to authenticated;
grant execute on function public.cfp_record_investment_valuation(uuid, jsonb)
  to authenticated;
