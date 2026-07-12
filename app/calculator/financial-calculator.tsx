"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { applyCalculatedGoalNumber } from "@/app/actions";
import { formatCurrency } from "@/lib/cfp/format";
import { FundingSourcesEditor, defaultFundingSources, fundingSourcesAmount, fundingSourcesTotal } from "./funding-sources";

type SolveFor = "futureValue" | "presentValue" | "payment" | "annualRate" | "periods";
type PaymentMode = "end" | "beginning";

const frequencyOptions = [
  { label: "Annually", value: 1 },
  { label: "Semiannually", value: 2 },
  { label: "Quarterly", value: 4 },
  { label: "Monthly", value: 12 },
  { label: "Bi-Weekly", value: 26 },
  { label: "Weekly", value: 52 },
];

function money(value: number) {
  if (!Number.isFinite(value)) return "Not available";
  return formatCurrency(value);
}

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function annuityFactor(rate: number, periods: number) {
  if (Math.abs(rate) < 0.0000001) return periods;
  return (Math.pow(1 + rate, periods) - 1) / rate;
}

function futureValue(input: {
  presentValue: number;
  payment: number;
  annualRate: number;
  periods: number;
  compoundsPerYear: number;
  mode: PaymentMode;
}) {
  const rate = input.annualRate / 100 / input.compoundsPerYear;
  const growth = Math.pow(1 + rate, input.periods);
  const due = input.mode === "beginning" ? 1 + rate : 1;
  return input.presentValue * growth + input.payment * annuityFactor(rate, input.periods) * due;
}

function paymentForTarget(input: {
  presentValue: number;
  targetFutureValue: number;
  annualRate: number;
  periods: number;
  compoundsPerYear: number;
  mode: PaymentMode;
}) {
  const rate = input.annualRate / 100 / input.compoundsPerYear;
  const growth = Math.pow(1 + rate, input.periods);
  const due = input.mode === "beginning" ? 1 + rate : 1;
  const factor = annuityFactor(rate, input.periods) * due;
  if (factor <= 0) return 0;
  return (input.targetFutureValue - input.presentValue * growth) / factor;
}

function solveAnnualRate(input: {
  presentValue: number;
  payment: number;
  targetFutureValue: number;
  periods: number;
  compoundsPerYear: number;
  mode: PaymentMode;
}) {
  let low = -0.9999 / input.compoundsPerYear;
  let high = 2 / input.compoundsPerYear;
  for (let index = 0; index < 120; index += 1) {
    const rate = (low + high) / 2;
    const value =
      input.presentValue * Math.pow(1 + rate, input.periods) +
      input.payment * annuityFactor(rate, input.periods) * (input.mode === "beginning" ? 1 + rate : 1);
    if (value < input.targetFutureValue) low = rate;
    else high = rate;
  }
  return ((low + high) / 2) * input.compoundsPerYear * 100;
}

function solvePeriods(input: {
  presentValue: number;
  payment: number;
  targetFutureValue: number;
  annualRate: number;
  compoundsPerYear: number;
  mode: PaymentMode;
}) {
  let low = 0;
  let high = 1200;
  for (let index = 0; index < 120; index += 1) {
    const periods = (low + high) / 2;
    const value = futureValue({ ...input, periods });
    if (value < input.targetFutureValue) low = periods;
    else high = periods;
  }
  return (low + high) / 2;
}

type InitialGoal = {
  customerId?: string;
  goalId?: string;
  goalName?: string;
  todayCost?: string;
  currentSavings?: string;
  returnTo?: string;
  years?: string;
};

export function FinancialCalculator({ initialGoal }: { initialGoal?: InitialGoal }) {
  const [activeTab, setActiveTab] = useState<"goal" | "tvm">("goal");

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-md border border-[#dce2dc] bg-white p-1">
        <button
          className={`rounded px-4 py-2 text-sm font-bold ${activeTab === "goal" ? "bg-[#dff4ef] text-[#115e59]" : "text-[#405047]"}`}
          type="button"
          onClick={() => setActiveTab("goal")}
        >
          Goal Number
        </button>
        <button
          className={`rounded px-4 py-2 text-sm font-bold ${activeTab === "tvm" ? "bg-[#dff4ef] text-[#115e59]" : "text-[#405047]"}`}
          type="button"
          onClick={() => setActiveTab("tvm")}
        >
          TVM Solver
        </button>
      </div>
      {activeTab === "goal" ? <GoalNumberCalculator initialGoal={initialGoal} /> : <TvmCalculator initialGoal={initialGoal} />}
    </div>
  );
}

function GoalNumberCalculator({ initialGoal }: { initialGoal?: InitialGoal }) {
  const [todayCost, setTodayCost] = useState(initialGoal?.todayCost || "1000000");
  const [years, setYears] = useState(initialGoal?.years || "10");
  const [inflationRate, setInflationRate] = useState("3");
  const [fundingSources, setFundingSources] = useState(() => defaultFundingSources(initialGoal?.currentSavings || "150000"));
  const [expectedReturn, setExpectedReturn] = useState("6");
  const [frequency, setFrequency] = useState("12");
  const [mode, setMode] = useState<PaymentMode>("end");

  const result = useMemo(() => {
    const periodsPerYear = numberValue(frequency);
    const totalPeriods = Math.max(0, numberValue(years) * periodsPerYear);
    const futureGoal = numberValue(todayCost) * Math.pow(1 + numberValue(inflationRate) / 100, numberValue(years));
    const currentSavings = fundingSourcesAmount(fundingSources);
    const futureCurrentSavings = fundingSourcesTotal(fundingSources, numberValue(years));
    const requiredPayment = Math.max(
      0,
      paymentForTarget({
        presentValue: 0,
        targetFutureValue: futureGoal,
        annualRate: numberValue(expectedReturn),
        periods: totalPeriods,
        compoundsPerYear: periodsPerYear,
        mode,
      }),
    );
    return {
      futureGoal,
      futureCurrentSavings,
      gap: Math.max(0, futureGoal - futureCurrentSavings),
      requiredPayment,
      annualContribution: requiredPayment * periodsPerYear,
      currentSavings,
      totalPeriods,
    };
  }, [expectedReturn, frequency, fundingSources, inflationRate, mode, todayCost, years]);

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
      <div className="panel p-5">
        <h2 className="text-xl font-bold">Find the client&apos;s goal number</h2>
        {initialGoal?.goalName ? (
          <p className="mt-1 text-sm font-semibold text-[#68756f]">Loaded from goal: {initialGoal.goalName}</p>
        ) : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="field">
            <span className="label">Today&apos;s cost</span>
            <input className="input" value={todayCost} onChange={(event) => setTodayCost(event.target.value)} type="number" min="0" />
          </label>
          <label className="field">
            <span className="label">Years to goal</span>
            <input className="input" value={years} onChange={(event) => setYears(event.target.value)} type="number" min="0" step="0.5" />
          </label>
          <label className="field">
            <span className="label">Inflation rate (%)</span>
            <input className="input" value={inflationRate} onChange={(event) => setInflationRate(event.target.value)} type="number" step="0.1" />
          </label>
          <label className="field">
            <span className="label">Expected return (%)</span>
            <input className="input" value={expectedReturn} onChange={(event) => setExpectedReturn(event.target.value)} type="number" step="0.1" />
          </label>
          <label className="field">
            <span className="label">Contribution frequency</span>
            <select className="input" value={frequency} onChange={(event) => setFrequency(event.target.value)}>
              {frequencyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field md:col-span-2">
            <span className="label">Contribution timing</span>
            <select className="input" value={mode} onChange={(event) => setMode(event.target.value as PaymentMode)}>
              <option value="end">End of period</option>
              <option value="beginning">Beginning of period</option>
            </select>
          </label>
          <div className="md:col-span-2">
            <FundingSourcesEditor sources={fundingSources} years={numberValue(years)} onChange={setFundingSources} />
          </div>
        </div>
      </div>

      <div className="panel p-5">
        <h2 className="text-xl font-bold">Planning result</h2>
        <div className="mt-4 space-y-4">
          <ResultRow label="Future goal number" value={money(result.futureGoal)} strong />
          <ResultRow label="Current savings at goal date" value={money(result.futureCurrentSavings)} />
          <ResultRow label="Remaining projected gap" value={money(result.gap)} />
          <ResultRow label="Required contribution" value={`${money(result.requiredPayment)} per period`} strong />
          <ResultRow label="Annual contribution equivalent" value={money(result.annualContribution)} />
        </div>
        {initialGoal?.customerId && initialGoal.goalId ? (
          <form action={applyCalculatedGoalNumber} className="mt-5 rounded-md border border-[#dce2dc] bg-[#f7f8f5] p-4 text-sm text-[#405047]">
            <input type="hidden" name="customer_id" value={initialGoal.customerId} />
            <input type="hidden" name="goal_id" value={initialGoal.goalId} />
            <input type="hidden" name="target_amount" value={result.futureGoal.toFixed(2)} />
            <input type="hidden" name="today_cost" value={numberValue(todayCost).toFixed(2)} />
            <input type="hidden" name="years_to_goal" value={numberValue(years).toFixed(2)} />
            <input type="hidden" name="inflation_rate" value={numberValue(inflationRate).toFixed(2)} />
            <input type="hidden" name="expected_return" value={numberValue(expectedReturn).toFixed(2)} />
            <input type="hidden" name="current_savings_today" value={result.currentSavings.toFixed(2)} />
            <input type="hidden" name="projected_current_savings" value={result.futureCurrentSavings.toFixed(2)} />
            <input type="hidden" name="projected_gap" value={result.gap.toFixed(2)} />
            <input type="hidden" name="required_payment" value={result.requiredPayment.toFixed(2)} />
            <input type="hidden" name="annual_contribution" value={result.annualContribution.toFixed(2)} />
            <input type="hidden" name="contribution_frequency" value={frequency} />
            <input type="hidden" name="contribution_timing" value={mode} />
            <p>
              Save <span className="font-bold">{money(result.futureGoal)}</span> back to this goal as the official target amount. The current
              saved amount stays unchanged because it represents the client&apos;s real position today.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn" type="submit">
                Save to Customer Portfolio
              </button>
              <Link className="btn btn-secondary" href={initialGoal.returnTo || `/customers/${initialGoal.customerId}#goal-${initialGoal.goalId}`}>
                Back to Portfolio
              </Link>
            </div>
          </form>
        ) : (
          <div className="mt-5 rounded-md border border-[#dce2dc] bg-[#f7f8f5] p-4 text-sm text-[#405047]">
            Use <span className="font-bold">{money(result.futureGoal)}</span> as the target amount when creating the customer&apos;s financial goal.
          </div>
        )}
      </div>
    </section>
  );
}

function TvmCalculator({ initialGoal }: { initialGoal?: InitialGoal }) {
  const [solveFor, setSolveFor] = useState<SolveFor>("futureValue");
  const [presentValue, setPresentValue] = useState(initialGoal?.currentSavings || "100000");
  const [payment, setPayment] = useState("1000");
  const [futureTarget, setFutureTarget] = useState(initialGoal?.todayCost || "250000");
  const [annualRate, setAnnualRate] = useState("6");
  const [periods, setPeriods] = useState(String(Math.max(1, Math.round(numberValue(initialGoal?.years || "10") * 12))));
  const [frequency, setFrequency] = useState("12");
  const [mode, setMode] = useState<PaymentMode>("end");

  const result = useMemo(() => {
    const compoundsPerYear = numberValue(frequency);
    const input = {
      presentValue: numberValue(presentValue),
      payment: numberValue(payment),
      targetFutureValue: numberValue(futureTarget),
      annualRate: numberValue(annualRate),
      periods: numberValue(periods),
      compoundsPerYear,
      mode,
    };

    if (solveFor === "futureValue") {
      return { label: "Future value", value: money(futureValue(input)) };
    }
    if (solveFor === "payment") {
      return { label: "Payment", value: `${money(paymentForTarget(input))} per period` };
    }
    if (solveFor === "presentValue") {
      const rate = input.annualRate / 100 / compoundsPerYear;
      const growth = Math.pow(1 + rate, input.periods);
      const due = mode === "beginning" ? 1 + rate : 1;
      const pv = (input.targetFutureValue - input.payment * annuityFactor(rate, input.periods) * due) / growth;
      return { label: "Present value", value: money(pv) };
    }
    if (solveFor === "annualRate") {
      return { label: "Annual nominal rate", value: `${solveAnnualRate(input).toFixed(2)}%` };
    }
    const solvedPeriods = solvePeriods(input);
    return {
      label: "Periods",
      value: `${solvedPeriods.toFixed(1)} periods (${(solvedPeriods / compoundsPerYear).toFixed(1)} years)`,
    };
  }, [annualRate, frequency, futureTarget, mode, payment, periods, presentValue, solveFor]);

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
      <div className="panel p-5">
        <h2 className="text-xl font-bold">Time value of money solver</h2>
        {initialGoal?.goalName ? (
          <p className="mt-1 text-sm font-semibold text-[#68756f]">Loaded from goal: {initialGoal.goalName}</p>
        ) : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="field md:col-span-2">
            <span className="label">Solve for</span>
            <select className="input" value={solveFor} onChange={(event) => setSolveFor(event.target.value as SolveFor)}>
              <option value="futureValue">Future Value</option>
              <option value="presentValue">Present Value</option>
              <option value="payment">Payment</option>
              <option value="annualRate">Annual Rate</option>
              <option value="periods">Periods</option>
            </select>
          </label>
          <CalculatorInput label="Present value" value={presentValue} setValue={setPresentValue} disabled={solveFor === "presentValue"} />
          <CalculatorInput label="Payment" value={payment} setValue={setPayment} disabled={solveFor === "payment"} />
          <CalculatorInput label="Future value" value={futureTarget} setValue={setFutureTarget} disabled={solveFor === "futureValue"} />
          <CalculatorInput label="Annual rate (%)" value={annualRate} setValue={setAnnualRate} disabled={solveFor === "annualRate"} step="0.1" />
          <CalculatorInput label="Periods" value={periods} setValue={setPeriods} disabled={solveFor === "periods"} step="1" />
          <label className="field">
            <span className="label">Compounding</span>
            <select className="input" value={frequency} onChange={(event) => setFrequency(event.target.value)}>
              {frequencyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field md:col-span-2">
            <span className="label">Payment mode</span>
            <select className="input" value={mode} onChange={(event) => setMode(event.target.value as PaymentMode)}>
              <option value="end">End of period</option>
              <option value="beginning">Beginning of period</option>
            </select>
          </label>
        </div>
      </div>
      <div className="panel p-5">
        <h2 className="text-xl font-bold">TVM result</h2>
        <div className="mt-4 rounded-md border border-[#dce2dc] bg-[#f7f8f5] p-5">
          <p className="text-sm font-bold uppercase text-[#68756f]">{result.label}</p>
          <p className="mt-2 text-3xl font-bold">{result.value}</p>
        </div>
        <p className="mt-4 text-sm text-[#68756f]">
          Payments are treated as positive client contributions. Use beginning mode when contributions happen before each compounding period.
        </p>
      </div>
    </section>
  );
}

function CalculatorInput({
  label,
  value,
  setValue,
  disabled,
  step = "1",
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  disabled?: boolean;
  step?: string;
}) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input
        className="input disabled:bg-[#eef3ef] disabled:text-[#8a9690]"
        disabled={disabled}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        type="number"
        step={step}
      />
    </label>
  );
}

function ResultRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#dce2dc] pb-3 last:border-b-0 last:pb-0">
      <p className="text-sm font-bold uppercase text-[#68756f]">{label}</p>
      <p className={`text-right ${strong ? "text-2xl font-bold text-[#115e59]" : "font-semibold"}`}>{value}</p>
    </div>
  );
}
