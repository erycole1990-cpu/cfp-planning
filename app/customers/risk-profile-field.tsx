"use client";

import { useMemo, useState } from "react";

type RiskProfile = "conservative" | "moderate" | "aggressive";

const questions = [
  {
    id: "horizon",
    label: "How long can this money stay invested?",
    answers: [
      { label: "Less than 3 years", score: 1 },
      { label: "3 to 7 years", score: 2 },
      { label: "More than 7 years", score: 3 },
    ],
  },
  {
    id: "reaction",
    label: "If the investment drops 15% in a bad market, what would the client likely do?",
    answers: [
      { label: "Sell or stop investing", score: 1 },
      { label: "Wait and review", score: 2 },
      { label: "Continue or invest more", score: 3 },
    ],
  },
  {
    id: "priority",
    label: "Which matters most to the client?",
    answers: [
      { label: "Protect capital", score: 1 },
      { label: "Balance safety and growth", score: 2 },
      { label: "Maximize long-term growth", score: 3 },
    ],
  },
  {
    id: "experience",
    label: "How familiar is the client with investment products?",
    answers: [
      { label: "New investor", score: 1 },
      { label: "Some experience", score: 2 },
      { label: "Experienced investor", score: 3 },
    ],
  },
  {
    id: "cashflow",
    label: "How stable is the client's income and emergency cash position?",
    answers: [
      { label: "Unstable or limited cash buffer", score: 1 },
      { label: "Mostly stable", score: 2 },
      { label: "Stable with strong cash buffer", score: 3 },
    ],
  },
];

function riskFromScore(score: number): RiskProfile {
  if (score <= 7) return "conservative";
  if (score <= 11) return "moderate";
  return "aggressive";
}

function riskLabel(profile: RiskProfile) {
  switch (profile) {
    case "conservative":
      return "Conservative";
    case "aggressive":
      return "Aggressive";
    default:
      return "Moderate";
  }
}

function riskDescription(profile: RiskProfile) {
  switch (profile) {
    case "conservative":
      return "Lower volatility, capital protection, and shorter-term certainty matter most.";
    case "aggressive":
      return "The client can accept higher volatility for stronger long-term growth potential.";
    default:
      return "The client needs a balanced mix of stability and growth.";
  }
}

export function RiskProfileField({
  defaultValue = "moderate",
  openByDefault = false,
}: {
  defaultValue?: string | null;
  openByDefault?: boolean;
}) {
  const initialValue = defaultValue === "conservative" || defaultValue === "aggressive" ? defaultValue : "moderate";
  const [profile, setProfile] = useState<RiskProfile>(initialValue);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [isOpen, setIsOpen] = useState(openByDefault);

  const result = useMemo(() => {
    const values = Object.values(answers);
    const score = values.reduce((sum, value) => sum + value, 0);
    const complete = values.length === questions.length;
    return {
      complete,
      score,
      recommendation: complete ? riskFromScore(score) : null,
    };
  }, [answers]);

  return (
    <div className="field md:col-span-2 sm:col-span-2">
      <label className="field">
        <span className="label">Risk profile</span>
        <select className="input" name="risk_profile" required value={profile} onChange={(event) => setProfile(event.target.value as RiskProfile)}>
          <option value="conservative">Conservative</option>
          <option value="moderate">Moderate</option>
          <option value="aggressive">Aggressive</option>
        </select>
      </label>

      <details className="mt-3 rounded-md border border-[#dce2dc] p-4" open={isOpen} onToggle={(event) => setIsOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer font-bold">Find risk profile</summary>
        <div className="mt-4 grid gap-4">
          <p className="text-sm font-semibold text-[#405047]">
            Use these questions when the client is unsure. The result guides the profile, then the advisor can confirm the final selection.
          </p>
          {questions.map((question) => (
            <fieldset key={question.id} className="rounded-md border border-[#eef3ef] p-3">
              <legend className="px-1 text-sm font-bold text-[#405047]">{question.label}</legend>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                {question.answers.map((answer) => (
                  <label key={answer.label} className="flex items-start gap-2 rounded-md border border-[#dce2dc] p-3 text-sm">
                    <input
                      type="radio"
                      name={`risk_${question.id}`}
                      value={answer.score}
                      checked={answers[question.id] === answer.score}
                      onChange={() => setAnswers((current) => ({ ...current, [question.id]: answer.score }))}
                    />
                    <span>{answer.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <div className="rounded-md bg-[#f5f7f4] p-4">
            {result.recommendation ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold uppercase text-[#68756f]">Suggested profile</p>
                  <p className="text-2xl font-bold text-[#115e59]">{riskLabel(result.recommendation)}</p>
                  <p className="mt-1 text-sm text-[#405047]">
                    Score {result.score} of 15. {riskDescription(result.recommendation)}
                  </p>
                </div>
                <button className="btn" type="button" onClick={() => setProfile(result.recommendation as RiskProfile)}>
                  Use Recommendation
                </button>
              </div>
            ) : (
              <p className="text-sm font-semibold text-[#405047]">Answer all 5 questions to get a suggested profile.</p>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
