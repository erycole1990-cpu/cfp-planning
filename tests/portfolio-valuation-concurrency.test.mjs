import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

const userId = "95555555-0000-0000-0000-000000000015";
const customerId = "90000000-0000-0000-0000-000000000025";
const portfolioId = "90000000-0000-0000-0000-000000000035";
const agencyId = "00000000-0000-0000-0000-000000000001";
const claims = JSON.stringify({
  sub: userId,
  email: "portfolio-concurrency@example.test",
  role: "authenticated",
}).replaceAll("'", "''");

function dockerSync(args, input) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    input,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function runningSupabaseDatabase() {
  if (process.env.PORTFOLIO_TEST_DB_CONTAINER) return process.env.PORTFOLIO_TEST_DB_CONTAINER;
  const names = dockerSync(["ps", "--filter", "status=running", "--format", "{{.Names}}"])
    .split(/\r?\n/)
    .filter((name) => name.startsWith("supabase_db_"));
  assert.equal(
    names.length,
    1,
    `Expected exactly one running local Supabase database container; found ${names.length}. Set PORTFOLIO_TEST_DB_CONTAINER when multiple local stacks are running.`,
  );
  return names[0];
}

function psqlArgs(container) {
  return ["exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"];
}

function psqlSync(container, sql) {
  return dockerSync(psqlArgs(container), sql);
}

function psqlAsync(container, sql) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", psqlArgs(container), { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`Concurrent psql session failed (${code}):\n${stderr || stdout}`));
    });
    child.stdin.end(sql);
  });
}

function cleanupSql() {
  return `
delete from public.audit_logs
where customer_id = '${customerId}'::uuid
   or payload ->> 'customer_id' = '${customerId}';
delete from public.investment_valuations where portfolio_id = '${portfolioId}'::uuid;
delete from public.investment_transactions where portfolio_id = '${portfolioId}'::uuid;
delete from public.portfolio_review_snapshots where portfolio_id = '${portfolioId}'::uuid;
delete from public.portfolio_benchmark_references where portfolio_id = '${portfolioId}'::uuid;
delete from public.investment_holdings where portfolio_id = '${portfolioId}'::uuid;
delete from public.investment_portfolios where id = '${portfolioId}'::uuid;
delete from public.customers where id = '${customerId}'::uuid;
delete from public.agency_memberships where agency_id = '${agencyId}'::uuid and user_id = '${userId}'::uuid;
delete from public.user_profiles where id = '${userId}'::uuid;
delete from auth.users where id = '${userId}'::uuid;
`;
}

const valuationPayload = JSON.stringify({
  valuation_scope: "portfolio",
  valuation_date: "2026-03-31",
  market_value: 10000,
  currency_code: "MYR",
  fx_rate_to_base: 1,
  source: "manual",
  evidence_status: "unverified",
}).replaceAll("'", "''");

test("concurrent valuation sessions leave one active authoritative value", { timeout: 20_000 }, async () => {
  const container = runningSupabaseDatabase();
  psqlSync(container, cleanupSql());
  try {
    psqlSync(container, `
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '${userId}', 'authenticated', 'authenticated', 'portfolio-concurrency@example.test', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);
insert into public.user_profiles (id, email, full_name, role, status, agency_id)
values ('${userId}', 'portfolio-concurrency@example.test', 'Concurrency Adviser', 'agent', 'active', '${agencyId}');
insert into public.agency_memberships (agency_id, user_id, role, status)
values ('${agencyId}', '${userId}', 'agent', 'active')
on conflict (agency_id, user_id) do update
set role = excluded.role, status = excluded.status;
insert into public.customers (
  id, full_name, email, risk_profile, assigned_advisor_name,
  assigned_agent_user_id, agency_id
) values (
  '${customerId}', 'Concurrency Portfolio Customer', 'concurrency-customer@example.test',
  'moderate', 'Concurrency Adviser', '${userId}', '${agencyId}'
);
insert into public.investment_portfolios (
  id, agency_id, customer_id, name, portfolio_type, base_currency, created_by
) values (
  '${portfolioId}', '${agencyId}', '${customerId}', 'Concurrency Test Portfolio',
  'general', 'MYR', '${userId}'
);
`);

    const firstSession = psqlAsync(container, `
begin;
set local application_name = 'portfolio-valuation-concurrency-a';
select set_config('request.jwt.claims', '${claims}', true);
select public.cfp_record_investment_valuation('${portfolioId}'::uuid, '${valuationPayload}'::jsonb);
select pg_sleep(3);
commit;
`);

    let observedLock = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const locks = psqlSync(container, `
select count(*)
from pg_catalog.pg_locks locks
join pg_catalog.pg_stat_activity activity using (pid)
where locks.locktype = 'advisory'
  and locks.granted
  and activity.application_name = 'portfolio-valuation-concurrency-a';
`);
      if (locks === "1") {
        observedLock = true;
        break;
      }
    }
    assert.equal(observedLock, true, "first valuation session never acquired its transaction advisory lock");

    const secondSession = psqlAsync(container, `
begin;
set local application_name = 'portfolio-valuation-concurrency-b';
select set_config('request.jwt.claims', '${claims}', true);
do $$
begin
  perform public.cfp_record_investment_valuation('${portfolioId}'::uuid, '${valuationPayload}'::jsonb);
  raise exception 'Concurrent duplicate valuation was accepted.';
exception when unique_violation then
  null;
end;
$$;
commit;
`);

    await Promise.all([firstSession, secondSession]);
    const counts = psqlSync(container, `
select count(*) || ':' || count(*) filter (
  where not exists (
    select 1 from public.investment_valuations replacement
    where replacement.supersedes_valuation_id = original.id
  )
)
from public.investment_valuations original
where original.portfolio_id = '${portfolioId}'::uuid
  and original.valuation_scope = 'portfolio'
  and original.holding_id is null
  and original.valuation_date = '2026-03-31';
`);
    assert.equal(counts, "1:1");
  } finally {
    psqlSync(container, cleanupSql());
  }
});
