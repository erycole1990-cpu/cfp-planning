"use client";

import { formatCurrency } from "@/lib/cfp/format";

export type FundingSource = {
  id: string;
  label: string;
  amount: string;
  annualReturn: string;
  availability: string;
};

const sourceTemplates = [
  { label: "Cash / Savings", annualReturn: "2" },
  { label: "PTPTN", annualReturn: "0" },
  { label: "EPF Account 2", annualReturn: "5" },
  { label: "Insurance Cash Value", annualReturn: "3" },
  { label: "Scholarship / Family", annualReturn: "0" },
  { label: "Other", annualReturn: "0" },
];

export function defaultFundingSources(amount = "0"): FundingSource[] {
  return [
    { id: "cash", label: "Cash / Savings", amount, annualReturn: "2", availability: "Available now" },
    { id: "ptptn", label: "PTPTN", amount: "0", annualReturn: "0", availability: "Loan / funding at enrolment" },
    { id: "epf2", label: "EPF Account 2", amount: "0", annualReturn: "5", availability: "Subject to withdrawal rules" },
    { id: "insurance", label: "Insurance Cash Value", amount: "0", annualReturn: "3", availability: "Policy maturity / surrender value" },
  ];
}

export function sourceFutureValue(source: FundingSource, years: number) {
  const amount = Number(source.amount);
  const annualReturn = Number(source.annualReturn);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (!Number.isFinite(annualReturn)) return amount;
  return amount * Math.pow(1 + annualReturn / 100, Math.max(0, years));
}

export function fundingSourcesTotal(sources: FundingSource[], years: number) {
  return sources.reduce((total, source) => total + sourceFutureValue(source, years), 0);
}

export function fundingSourcesAmount(sources: FundingSource[]) {
  return sources.reduce((total, source) => total + (Number(source.amount) || 0), 0);
}

export function FundingSourcesEditor({
  sources,
  years,
  onChange,
}: {
  sources: FundingSource[];
  years: number;
  onChange: (sources: FundingSource[]) => void;
}) {
  function updateSource(id: string, field: keyof FundingSource, value: string) {
    onChange(sources.map((source) => (source.id === id ? { ...source, [field]: value } : source)));
  }

  function addSource(label: string) {
    const template = sourceTemplates.find((item) => item.label === label) ?? sourceTemplates[sourceTemplates.length - 1];
    onChange([
      ...sources,
      {
        id: `${template.label}-${Date.now()}`,
        label: template.label,
        amount: "0",
        annualReturn: template.annualReturn,
        availability: template.label === "Other" ? "" : "To confirm",
      },
    ]);
  }

  function removeSource(id: string) {
    onChange(sources.filter((source) => source.id !== id));
  }

  return (
    <div className="rounded-md border border-[#dce2dc] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold">Funding sources</h3>
          <p className="mt-1 text-sm text-[#68756f]">Add PTPTN, EPF Account 2, insurance value, family support, or other sources.</p>
        </div>
        <select className="input max-w-56" defaultValue="" onChange={(event) => {
          if (event.target.value) addSource(event.target.value);
          event.target.value = "";
        }}>
          <option value="">Add source</option>
          {sourceTemplates.map((source) => (
            <option key={source.label} value={source.label}>
              {source.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 space-y-3">
        {sources.map((source) => (
          <div key={source.id} className="grid gap-3 rounded-md bg-[#f7f8f5] p-3 lg:grid-cols-[1.1fr_0.8fr_0.7fr_1fr_auto]">
            <label className="field">
              <span className="label">Source</span>
              <input className="input" value={source.label} onChange={(event) => updateSource(source.id, "label", event.target.value)} />
            </label>
            <label className="field">
              <span className="label">Amount</span>
              <input className="input" type="number" min="0" value={source.amount} onChange={(event) => updateSource(source.id, "amount", event.target.value)} />
            </label>
            <label className="field">
              <span className="label">Return (%)</span>
              <input className="input" type="number" step="0.1" value={source.annualReturn} onChange={(event) => updateSource(source.id, "annualReturn", event.target.value)} />
            </label>
            <label className="field">
              <span className="label">Availability</span>
              <input className="input" value={source.availability} onChange={(event) => updateSource(source.id, "availability", event.target.value)} />
            </label>
            <div className="flex items-end justify-between gap-2 lg:block">
              <div className="pb-1 text-sm">
                <p className="font-bold uppercase text-[#68756f]">At goal</p>
                <p className="font-bold">{formatCurrency(sourceFutureValue(source, years))}</p>
              </div>
              <button className="btn btn-secondary" type="button" onClick={() => removeSource(source.id)} disabled={sources.length === 1}>
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
