"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { RiskProfileField } from "@/app/customers/risk-profile-field";
import { createPersonalPlan, type PersonalPlanState } from "./actions";

const initialState: PersonalPlanState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn md:col-span-2" type="submit" disabled={pending}>
      {pending ? "Creating..." : "Create My Plan"}
    </button>
  );
}

export function PersonalPlanForm({
  defaultName,
  email,
  advisors,
}: {
  defaultName: string;
  email: string;
  advisors: Array<{ id: string; name: string }>;
}) {
  const [state, formAction] = useActionState(createPersonalPlan, initialState);

  return (
    <form action={formAction} className="panel grid max-w-4xl gap-4 p-5 md:grid-cols-2">
      {state.error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800 md:col-span-2" role="alert">
          {state.error}
        </div>
      ) : null}

      <label className="field md:col-span-2">
        <span className="label">Full name</span>
        <input className="input" name="full_name" required defaultValue={defaultName} />
      </label>
      <label className="field">
        <span className="label">Login email</span>
        <input className="input" value={email} readOnly />
      </label>
      <label className="field">
        <span className="label">Phone</span>
        <input className="input" name="phone" />
      </label>
      <label className="field">
        <span className="label">Date of birth</span>
        <input className="input" name="date_of_birth" type="date" />
      </label>
      <label className="field">
        <span className="label">Independent advisor</span>
        <select className="input" name="assigned_agent_user_id" required defaultValue="">
          <option value="">Choose another approved advisor</option>
          {advisors.map((advisor) => (
            <option key={advisor.id} value={advisor.id}>{advisor.name}</option>
          ))}
        </select>
      </label>

      <RiskProfileField defaultValue="moderate" openByDefault />

      <label className="field md:col-span-2">
        <span className="label">Planning notes</span>
        <textarea className="input min-h-28" name="notes" placeholder="Personal objectives or information the assigned advisor should know" />
      </label>
      <SubmitButton />
    </form>
  );
}
