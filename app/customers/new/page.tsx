import Link from "next/link";
import { createCustomer } from "@/app/actions";
import { AppShell, PageHeader } from "@/app/ui";

export default function NewCustomerPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Customer setup"
        title="Add Customer"
        actions={
          <Link className="btn btn-secondary" href="/customers">
            Back to Customers
          </Link>
        }
      />

      <form action={createCustomer} className="panel grid max-w-3xl gap-4 p-5 md:grid-cols-2">
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
          <span className="label">Risk profile</span>
          <select className="input" name="risk_profile" required defaultValue="moderate">
            <option value="conservative">Conservative</option>
            <option value="moderate">Moderate</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </label>
        <label className="field md:col-span-2">
          <span className="label">Assigned advisor</span>
          <input className="input" name="assigned_advisor_name" required placeholder="Advisor name" />
        </label>
        <label className="field md:col-span-2">
          <span className="label">Notes</span>
          <textarea className="input min-h-28" name="notes" />
        </label>
        <div className="md:col-span-2">
          <button className="btn" type="submit">
            Save Customer
          </button>
        </div>
      </form>
    </AppShell>
  );
}
