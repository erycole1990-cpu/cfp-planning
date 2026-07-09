import Link from "next/link";
import { AppShell, EmptyState, EnvNotice, ErrorNotice, PageHeader, StatusBadge } from "../ui";
import { formatDate } from "@/lib/cfp/format";
import { getCustomersData, type CustomerServiceFilter } from "@/lib/cfp/data";

export const dynamic = "force-dynamic";

function customerFilter(value: string | undefined): CustomerServiceFilter {
  if (value === "inactive" || value === "all") return value;
  return "active";
}

function filterHref(filter: CustomerServiceFilter) {
  return filter === "active" ? "/customers" : `/customers?status=${filter}`;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; saved?: string }>;
}) {
  const query = (await searchParams) ?? {};
  const filter = customerFilter(query.status);
  const data = await getCustomersData(filter);
  const goalsByCustomer = new Map<string, typeof data.goals>();
  for (const goal of data.goals) {
    const list = goalsByCustomer.get(goal.customer_id) ?? [];
    list.push(goal);
    goalsByCustomer.set(goal.customer_id, list);
  }
  const emptyCopy = {
    active: {
      title: "No active customers",
      body: "Add a customer or switch to No longer servicing to review ended service records.",
    },
    inactive: {
      title: "No no-longer-servicing customers",
      body: "Customers you mark no longer servicing will appear here for reference or reactivation.",
    },
    all: {
      title: "No customers yet",
      body: "Add the first planning customer, then create their goals and progress history.",
    },
  }[filter];

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
      {query.saved === "service-ended" ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          Customer moved to No longer servicing.
        </div>
      ) : null}

      <nav className="mb-4 flex flex-wrap gap-2">
        {[
          ["active", "Active"],
          ["inactive", "No longer servicing"],
          ["all", "All customers"],
        ].map(([value, label]) => (
          <Link
            key={value}
            className={filter === value ? "btn" : "btn btn-secondary"}
            href={filterHref(value as CustomerServiceFilter)}
          >
            {label}
          </Link>
        ))}
      </nav>

      {data.configured ? (
        data.customers.length ? (
          <section className="panel table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Advisor</th>
                  <th>Risk</th>
                  <th>Status</th>
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
                      <td className="capitalize">
                        {customer.service_status || "active"}
                        {customer.service_ended_reason ? (
                          <p className="mt-1 text-sm normal-case text-[#68756f]">{customer.service_ended_reason}</p>
                        ) : null}
                      </td>
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
            title={emptyCopy.title}
            body={emptyCopy.body}
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
