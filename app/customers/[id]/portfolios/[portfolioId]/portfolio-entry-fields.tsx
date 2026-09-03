"use client";

import { useState } from "react";

type HoldingOption = {
  id: string;
  name: string;
};

export function HoldingRiskFields() {
  const [riskRating, setRiskRating] = useState("");

  return (
    <>
      <label className="field">
        <span className="label">Indicative risk rating (1–7)</span>
        <input
          className="input"
          name="risk_rating"
          type="number"
          min="1"
          max="7"
          step="1"
          value={riskRating}
          onChange={(event) => setRiskRating(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="label">Risk source{riskRating ? " (required)" : ""}</span>
        <input className="input" name="risk_source" required={Boolean(riskRating)} />
      </label>
      <label className="field">
        <span className="label">Risk assessed on</span>
        <input className="input" name="risk_assessed_on" type="date" />
      </label>
    </>
  );
}

export function PortfolioFxFields({ baseCurrency }: { baseCurrency: string }) {
  const normalizedBaseCurrency = baseCurrency.trim().toUpperCase();
  const [currency, setCurrency] = useState(normalizedBaseCurrency);
  const [fxRate, setFxRate] = useState("1");
  const isBaseCurrency = currency === normalizedBaseCurrency;

  return (
    <>
      <label className="field">
        <span className="label">Currency</span>
        <input
          autoComplete="off"
          className="input uppercase"
          name="currency_code"
          value={currency}
          maxLength={3}
          required
          onChange={(event) => {
            const nextCurrency = event.target.value.toUpperCase().slice(0, 3);
            setCurrency(nextCurrency);
            if (nextCurrency === normalizedBaseCurrency) setFxRate("1");
          }}
        />
      </label>
      <label className="field">
        <span className="label">FX rate to base</span>
        <input
          autoComplete="off"
          className="input"
          name="fx_rate_to_base"
          type="number"
          min="0.000000000001"
          step="any"
          value={isBaseCurrency ? "1" : fxRate}
          readOnly={isBaseCurrency}
          required
          onChange={(event) => setFxRate(event.target.value)}
        />
        {isBaseCurrency ? (
          <span className="text-xs text-[#68756f]">
            Base-currency entries always use an FX rate of 1.
          </span>
        ) : null}
      </label>
      {isBaseCurrency ? null : (
        <>
          <label className="field">
            <span className="label">FX rate date</span>
            <input className="input" name="fx_rate_date" type="date" required />
          </label>
          <label className="field">
            <span className="label">FX source</span>
            <input className="input" name="fx_source" required />
          </label>
        </>
      )}
    </>
  );
}

export function PortfolioValuationScopeFields({ holdings }: { holdings: HoldingOption[] }) {
  const [scope, setScope] = useState<"portfolio" | "holding">("portfolio");

  return (
    <>
      <label className="field">
        <span className="label">Scope</span>
        <select
          className="input"
          name="valuation_scope"
          value={scope}
          onChange={(event) => setScope(event.target.value as "portfolio" | "holding")}
        >
          <option value="portfolio">Whole portfolio</option>
          <option value="holding">Holding</option>
        </select>
      </label>
      {scope === "portfolio" ? (
        <label className="field">
          <span className="label">Holding</span>
          <input type="hidden" name="holding_id" value="" />
          <input className="input" value="Whole portfolio" disabled readOnly />
        </label>
      ) : (
        <label className="field">
          <span className="label">Holding (required)</span>
          <select className="input" name="holding_id" defaultValue="" required>
            <option value="" disabled>Select a holding</option>
            {holdings.map((holding) => (
              <option key={holding.id} value={holding.id}>{holding.name}</option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}
