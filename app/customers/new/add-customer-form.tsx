"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createCustomerFromIntake, type CustomerFormState } from "@/app/actions";
import { RiskProfileField } from "@/app/customers/risk-profile-field";

const initialState: CustomerFormState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? "Saving..." : "Save Customer"}
    </button>
  );
}

export function AddCustomerForm() {
  const [state, formAction] = useActionState(createCustomerFromIntake, initialState);

  return (
    <form action={formAction} className="panel grid max-w-5xl gap-4 p-5 md:grid-cols-2">
      {state.error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800 md:col-span-2" role="alert">
          {state.error}
        </div>
      ) : null}

      <div className="md:col-span-2">
        <h2 className="text-lg font-bold">Personal particulars</h2>
      </div>
      <label className="field md:col-span-2">
        <span className="label">Full name</span>
        <input className="input" name="full_name" required />
      </label>
      <label className="field">
        <span className="label">Email</span>
        <input className="input" name="email" type="email" />
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
        <span className="label">NRIC / Passport</span>
        <input className="input" name="nric_passport" />
      </label>
      <label className="field">
        <span className="label">Nationality</span>
        <input className="input" name="nationality" placeholder="Malaysian" />
      </label>
      <label className="field">
        <span className="label">Marital status</span>
        <select className="input" name="marital_status" defaultValue="">
          <option value="">Not set</option>
          <option>Single</option>
          <option>Married</option>
          <option>Divorced</option>
          <option>Widowed</option>
        </select>
      </label>
      <label className="field">
        <span className="label">Dependents</span>
        <input className="input" name="number_of_dependents" type="number" min="0" step="1" />
      </label>
      <label className="field md:col-span-2">
        <span className="label">Residential address</span>
        <textarea className="input min-h-24" name="residential_address" />
      </label>

      <div className="border-t border-[#dce2dc] pt-4 md:col-span-2">
        <h2 className="text-lg font-bold">Employment and financial background</h2>
      </div>
      <label className="field">
        <span className="label">Employment status</span>
        <select className="input" name="employment_status" defaultValue="">
          <option value="">Not set</option>
          <option>Employed</option>
          <option>Self-employed / Business owner</option>
          <option>Professional</option>
          <option>Retired</option>
          <option>Homemaker</option>
          <option>Student</option>
          <option>Unemployed</option>
        </select>
      </label>
      <label className="field">
        <span className="label">Occupation</span>
        <input className="input" name="occupation" />
      </label>
      <label className="field">
        <span className="label">Employer / Business name</span>
        <input className="input" name="employer_name" />
      </label>
      <label className="field">
        <span className="label">Monthly income range</span>
        <select className="input" name="monthly_income_range" defaultValue="">
          <option value="">Not set</option>
          <option>Up to RM1,500</option>
          <option>RM1,501 - RM3,000</option>
          <option>RM3,001 - RM5,000</option>
          <option>RM5,001 - RM8,000</option>
          <option>RM8,001 - RM15,000</option>
          <option>RM15,001 - RM25,000</option>
          <option>Above RM25,000</option>
        </select>
      </label>
      <label className="field">
        <span className="label">Source of funds</span>
        <input className="input" name="source_of_funds" placeholder="Salary, business, savings" />
      </label>
      <label className="field">
        <span className="label">Source of wealth</span>
        <input className="input" name="source_of_wealth" placeholder="Employment, business, inheritance" />
      </label>

      <div className="border-t border-[#dce2dc] pt-4 md:col-span-2">
        <h2 className="text-lg font-bold">Planning assignment</h2>
      </div>
      <RiskProfileField defaultValue="moderate" openByDefault />
      <label className="field md:col-span-2">
        <span className="label">Assigned advisor</span>
        <input className="input" name="assigned_advisor_name" required placeholder="Advisor name" />
      </label>
      <label className="field md:col-span-2">
        <span className="label">Notes</span>
        <textarea className="input min-h-28" name="notes" />
      </label>
      <div className="md:col-span-2">
        <SubmitButton />
      </div>
    </form>
  );
}
