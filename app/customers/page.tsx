import Link from "next/link";
import { AppShell, EmptyState, EnvNotice, ErrorNotice, PageHeader, StatusBadge } from "../ui";
import { formatDate } from "@/lib/cfp/format";
import { getCustomersData } from "@/lib/cfp/data";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const data = await getCustomersData();
  const goalsByCustomer = new Map<string, typeof data.goals>();
  for (const goal of data.goals) {
    const list = goalsByCustomer.get(goal.customer_id) ?? [];
    list.push(goal);
    goalsByCustomer.set(goal.customer_id, list);
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Planning records"
        title="Customers"
        actions={
          <Link className="btn" href="/customers/new">
            Add Customer
          </Link>
        }
      />
      {!data.configured ? <EnvNotice /> : null}
      <ErrorNotice message={data.error} />

      {data.configured ? (
        data.customers.length ? (
          <section className="panel table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Advisor</th>
                  <th>Risk</th>
                  <th>Goals</th>
                  <th>Highest concern</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {data.customers.map((customer) => {
                  const goals = goalsByCustomer.get(customer.id) ?? [];
                  const highestConcern =
                    goals.find((goal) => goal.on_track_status === "off_track") ||
                    goals.find((goal) => goal.on_track_status === "at_risk") ||
                    goals[0];
                  return (
                    <tr key={customer.id}>
                      <td>
                        <Link className="font-bold text-[#0f766e]" href={`/customers/${customer.id}`}>
                          {customer.full_name}
                        </Link>
                        <p className="mt-1 text-sm text-[#68756f]">{customer.email || "No email"}</p>
                      </td>
                      <td>{customer.assigned_advisor_name || "Unassigned"}</td>
                      <td className="capitalize">{customer.risk_profile || "Not set"}</td>
                      <td>{goals.length}</td>
                      <td>{highestConcern ? <StatusBadge status={highestConcern.on_track_status} /> : "No goals"}</td>
                      <td>{formatDate(customer.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : (
          <EmptyState
            title="No customers yet"
            body="Add the first planning customer, then create their goals and progress history."
            action={
              <Link className="btn" href="/customers/new">
                Add Customer
              </Link>
            }
          />
        )
      ) : null}
    </AppShell>
  );
}
