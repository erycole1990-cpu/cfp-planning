"use client";

import { useMemo, useState } from "react";
import { createGoal } from "@/app/actions";
import { formatCurrency } from "@/lib/cfp/format";

function numeric(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function AddGoalForm({
  customerId,
  actor,
  today,
}: {
  customerId: string;
  actor: string;
  today: string;
}) {
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("0");
  const [todayCost, setTodayCost] = useState("30000");
  const [years, setYears] = useState("10");
  const [inflationRate, setInflationRate] = useState("3");
  const [currentSavings, setCurrentSavings] = useState("0");
  const [expectedReturn, setExpectedReturn] = useState("6");

  const result = useMemo(() => {
    const futureCost = numeric(todayCost) * Math.pow(1 + numeric(inflationRate) / 100, numeric(years));
    const futureSavings = numeric(currentSavings) * Math.pow(1 + numeric(expectedReturn) / 100, numeric(years));
    return {
      futureCost,
      futureSavings,
      gap: Math.max(0, futureCost - futureSavings),
    };
  }, [currentSavings, expectedReturn, inflationRate, todayCost, years]);

  return (
    <form action={createGoal} className="mt-4 grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="actor" value={actor} />
      <label className="field">
        <span className="label">Goal type</span>
        <select className="input" name="goal_type" required defaultValue="Retirement">
          <option>Retirement</option>
          <option>Education</option>
          <option>Emergency Fund</option>
          <option>Wealth Accumulation</option>
          <option>Protection</option>
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
          onChange={(event) => {
            setCurrentAmount(event.target.value);
            setCurrentSavings(event.target.value);
          }}
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
            <span className="label">Expected return (%)</span>
            <input className="input" type="number" step="0.1" value={expectedReturn} onChange={(event) => setExpectedReturn(event.target.value)} />
          </label>
          <label className="field sm:col-span-2">
            <span className="label">Current savings for this goal</span>
            <input className="input" type="number" min="0" value={currentSavings} onChange={(event) => setCurrentSavings(event.target.value)} />
          </label>
        </div>
        <div className="mt-4 grid gap-3 rounded-md bg-[#f7f8f5] p-4 text-sm sm:grid-cols-3">
          <div>
            <p className="font-bold uppercase text-[#68756f]">Future cost</p>
            <p className="mt-1 text-lg font-bold">{formatCurrency(result.futureCost)}</p>
          </div>
          <div>
            <p className="font-bold uppercase text-[#68756f]">Savings at date</p>
            <p className="mt-1 text-lg font-bold">{formatCurrency(result.futureSavings)}</p>
          </div>
          <div>
            <p className="font-bold uppercase text-[#68756f]">Funding gap</p>
            <p className="mt-1 text-lg font-bold text-[#115e59]">{formatCurrency(result.gap)}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
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
      <button className="btn self-end" type="submit">
        Add Goal
      </button>
    </form>
  );
}
