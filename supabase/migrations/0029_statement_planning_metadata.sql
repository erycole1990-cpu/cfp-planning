alter table financial_statement_items
  add column if not exists ownership_type text
    check (ownership_type in ('sole', 'joint', 'business', 'trust', 'other')),
  add column if not exists valuation_basis text
    check (valuation_basis in ('statement_balance', 'market_estimate', 'purchase_cost', 'professional_valuation', 'other')),
  add column if not exists liquidity_class text
    check (liquidity_class in ('liquid', 'near_liquid', 'illiquid', 'restricted')),
  add column if not exists evidence_status text not null default 'unverified'
    check (evidence_status in ('unverified', 'client_provided', 'adviser_verified')),
  add column if not exists evidence_note text,
  add column if not exists interest_rate numeric
    check (interest_rate is null or (interest_rate >= 0 and interest_rate <= 100)),
  add column if not exists monthly_payment numeric
    check (monthly_payment is null or monthly_payment >= 0),
  add column if not exists maturity_date date,
  add column if not exists cash_flow_nature text
    check (cash_flow_nature in ('essential', 'discretionary', 'savings_investment', 'debt_repayment', 'tax_statutory')),
  add column if not exists budget_amount numeric
    check (budget_amount is null or budget_amount >= 0),
  add column if not exists tax_deductible boolean,
  add column if not exists cash_treatment text
    check (cash_treatment in ('cash', 'non_cash'));
