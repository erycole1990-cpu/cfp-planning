alter table customers
  add column if not exists nric_passport text,
  add column if not exists nationality text,
  add column if not exists marital_status text,
  add column if not exists number_of_dependents integer,
  add column if not exists residential_address text,
  add column if not exists employment_status text,
  add column if not exists occupation text,
  add column if not exists employer_name text,
  add column if not exists monthly_income_range text,
  add column if not exists source_of_funds text,
  add column if not exists source_of_wealth text;
