alter table financial_goals
  add column if not exists health_score integer,
  add column if not exists health_reasons jsonb not null default '[]'::jsonb,
  add column if not exists health_evaluated_at timestamptz;

do $$
begin
  alter table financial_goals
    add constraint financial_goals_health_score_check
    check (health_score is null or health_score between 0 and 100);
exception
  when duplicate_object then null;
end $$;
