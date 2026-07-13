"use client";

import { useActionState, useMemo, useState } from "react";
import { createGoalFromForm, type GoalFormState } from "@/app/actions";
import { formatCurrency } from "@/lib/cfp/format";
import { FundingSourcesEditor, defaultFundingSources, fundingSourcesAmount, fundingSourcesTotal } from "@/app/calculator/funding-sources";

function numeric(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthlyContribution(gap: number, years: number, annualReturn: number) {
  const months = Math.max(1, Math.round(years * 12));
  const monthlyRate = annualReturn / 100 / 12;
  if (Math.abs(monthlyRate) < 0.0000001) return gap / months;
  return gap / (((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate));
}

const goalTypeGroups = [
  {
    label: "Core planning",
    options: ["Retirement", "Education", "Emergency Fund", "Wealth Accumulation", "Protection"],
  },
  {
    label: "Family and care",
    options: ["Parenting / Childcare Cost", "Elderly Parent Care", "Medical Reserve", "Wedding / Family Event"],
  },
  {
    label: "Property and debt",
    options: ["House Purchase", "Home Renovation", "Mortgage Settlement", "Debt Settlement"],
  },
  {
    label: "Lifestyle and purchases",
    options: ["Car Purchase", "Travel / Pilgrimage", "Major Purchase"],
  },
  {
    label: "Business and career",
    options: ["Business Startup", "Business Expansion", "Career Break / Reskilling"],
  },
  {
    label: "Legacy",
    options: ["Estate / Legacy Planning", "Charity / Giving", "Other / Custom Goal"],
  },
];

export function AddGoalForm({
  customerId,
  actor,
  today,
}: {
  customerId: string;
  actor: string;
  today: string;
}) {
  const [formState, formAction, pending] = useActionState(createGoalFromForm, { error: null } as GoalFormState);
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("0");
  const [todayCost, setTodayCost] = useState("30000");
  const [years, setYears] = useState("10");
  const [inflationRate, setInflationRate] = useState("3");
  const [fundingSources, setFundingSources] = useState(() => defaultFundingSources("0"));
  const [newMoneyReturn, setNewMoneyReturn] = useState("6");

  const result = useMemo(() => {
    const futureCost = numeric(todayCost) * Math.pow(1 + numeric(inflationRate) / 100, numeric(years));
    const sourceTotalNow = fundingSourcesAmount(fundingSources);
    const futureSavings = fundingSourcesTotal(fundingSources, numeric(years));
    return {
      futureCost,
      futureSavings,
      sourceTotalNow,
      gap: Math.max(0, futureCost - futureSavings),
      monthlyContribution: monthlyContribution(Math.max(0, futureCost - futureSavings), numeric(years), numeric(newMoneyReturn)),
    };
  }, [fundingSources, inflationRate, newMoneyReturn, todayCost, years]);

  return (
    <form action={formAction} className="mt-4 grid gap-3 sm:grid-cols-2">
      {formState.error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800 sm:col-span-2">{formState.error}</div> : null}
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="actor" value={actor} />
      <label className="field">
        <span className="label">Goal type</span>
        <select className="input" name="goal_type" required defaultValue="Retirement">
          {goalTypeGroups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label">Priority</span>
        <select className="input" name="priority" required defaultValue="medium">
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </label>
      <label className="field sm:col-span-2">
        <span className="label">Goal name</span>
        <input className="input" name="goal_name" required placeholder="Retire with income floor" />
      </label>
      <label className="field">
        <span className="label">Target amount</span>
        <input
          className="input"
          name="target_amount"
          required
          min="1"
          step="1"
          type="number"
          value={targetAmount}
          onChange={(event) => setTargetAmount(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="label">Current amount</span>
        <input
          className="input"
          name="current_amount"
          required
          min="0"
          step="1"
          type="number"
          value={currentAmount}
          onChange={(event) => setCurrentAmount(event.target.value)}
        />
      </label>

      <details className="rounded-md border border-[#dce2dc] p-4 sm:col-span-2">
        <summary className="cursor-pointer font-bold">Calculate target amount</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="field">
            <span className="label">Cost today</span>
            <input className="input" type="number" min="0" value={todayCost} onChange={(event) => setTodayCost(event.target.value)} />
          </label>
          <label className="field">
            <span className="label">Years to goal</span>
            <input className="input" type="number" min="0" step="0.5" value={years} onChange={(event) => setYears(event.target.value)} />
          </label>
          <label className="field">
            <span className="label">Inflation rate (%)</span>
            <input className="input" type="number" step="0.1" value={inflationRate} onChange={(event) => setInflationRate(event.target.value)} />
          </label>
          <label className="field">
            <span className="label">New money return (%)</span>
            <input className="input" type="number" step="0.1" value={newMoneyReturn} onChange={(event) => setNewMoneyReturn(event.target.value)} />
          </label>
          <div className="sm:col-span-2">
            <FundingSourcesEditor sources={fundingSources} years={numeric(years)} onChange={setFundingSources} />
          </div>
        </div>
        <p className="mt-3 text-sm text-[#68756f]">
          Current amount can reflect the total funding sources already available. Use new money return for planning future contributions.
        </p>
        <div className="mt-4 grid gap-3 rounded-md bg-[#f7f8f5] p-4 text-sm sm:grid-cols-4">
          <div>
            <p className="font-bold uppercase text-[#68756f]">Future cost</p>
            <p className="mt-1 text-lg font-bold">{formatCurrency(result.futureCost)}</p>
          </div>
          <div>
            <p className="font-bold uppercase text-[#68756f]">Sources at date</p>
            <p className="mt-1 text-lg font-bold">{formatCurrency(result.futureSavings)}</p>
          </div>
          <div>
            <p className="font-bold uppercase text-[#68756f]">Funding gap</p>
            <p className="mt-1 text-lg font-bold text-[#115e59]">{formatCurrency(result.gap)}</p>
          </div>
          <div>
            <p className="font-bold uppercase text-[#68756f]">Monthly needed</p>
            <p className="mt-1 text-lg font-bold text-[#115e59]">{formatCurrency(result.monthlyContribution)}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setCurrentAmount(String(Math.round(result.sourceTotalNow)))}
          >
            Use Sources as Current Amount
          </button>
          <button className="btn" type="button" onClick={() => setTargetAmount(String(Math.round(result.futureCost)))}>
            Use Future Cost
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => setTargetAmount(String(Math.round(result.gap)))}>
            Use Funding Gap
          </button>
        </div>
      </details>

      <label className="field">
        <span className="label">Target date</span>
        <input className="input" name="target_date" required min={today} type="date" />
      </label>
      <button className="btn self-end" type="submit" disabled={pending}>
        {pending ? "Adding..." : "Add Goal"}
      </button>
    </form>
  );
}
