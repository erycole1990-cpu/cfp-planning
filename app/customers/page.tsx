import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell, EmptyState, EnvNotice, ErrorNotice, PageHeader, Pagination, StatusBadge } from "../ui";
import { formatDate } from "@/lib/cfp/format";
import { getCustomersData, type CustomerServiceFilter } from "@/lib/cfp/data";
import { requireCurrentAccess } from "@/lib/cfp/access";

export const dynamic = "force-dynamic";

function customerFilter(value: string | undefined): CustomerServiceFilter {
  if (value === "inactive" || value === "all") return value;
  return "active";
}

function filterHref(filter: CustomerServiceFilter, search: string) {
  const params = new URLSearchParams();
  if (filter !== "active") params.set("status", filter);
  if (search) params.set("q", search);
  const query = params.toString();
  return query ? `/customers?${query}` : "/customers";
}

function matchesSearch(customer: Awaited<ReturnType<typeof getCustomersData>>["customers"][number], search: string) {
  if (!search) return true;
  const haystack = [
    customer.full_name,
    customer.email,
    customer.phone,
    customer.assigned_advisor_name,
    customer.risk_profile,
    customer.service_status,
    customer.service_ended_reason,
    customer.nric_passport,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(search.toLowerCase());
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; saved?: string; q?: string; page?: string }>;
}) {
  const access = await requireCurrentAccess();
  if (access.isClient) redirect("/my-plan");
  const query = (await searchParams) ?? {};
  const filter = customerFilter(query.status);
  const search = String(query.q ?? "").trim();
  const data = await getCustomersData(filter);
  const customers = data.customers.filter((customer) => matchesSearch(customer, search));
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(customers.length / pageSize));
  const page = Math.min(Math.max(1, Number.parseInt(query.page || "1", 10) || 1), totalPages);
  const pageCustomers = customers.slice((page - 1) * pageSize, page * pageSize);
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
            href={filterHref(value as CustomerServiceFilter, search)}
          >
            {label}
          </Link>
        ))}
      </nav>

      <form action="/customers" className="mb-4 grid gap-3 rounded-md border border-[#dce2dc] bg-white p-4 md:grid-cols-[1fr_auto_auto]">
        {filter !== "active" ? <input type="hidden" name="status" value={filter} /> : null}
        <label className="field">
          <span className="label">Search customers</span>
          <input className="input" name="q" defaultValue={search} placeholder="Name, email, phone, advisor, NRIC/passport" />
        </label>
        <div className="flex items-end">
          <button className="btn w-full" type="submit">
            Search
          </button>
        </div>
        <div className="flex items-end">
          <Link className="btn btn-secondary w-full text-center" href={filterHref(filter, "")}>
            Clear
          </Link>
        </div>
      </form>

      {data.configured ? (
        customers.length ? (
          <>
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
                  {pageCustomers.map((customer) => {
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
            <Pagination page={page} totalPages={totalPages} pathname="/customers" query={{ status: filter !== "active" ? filter : undefined, q: search || undefined }} />
          </>
        ) : (
          <EmptyState
            title={search ? "No customers found" : emptyCopy.title}
            body={search ? "Try a different name, email, advisor, phone, or NRIC/passport search." : emptyCopy.body}
            action={
              <Link className="btn" href={search ? filterHref(filter, "") : "/customers/new"}>
                {search ? "Clear Search" : "Add Customer"}
              </Link>
            }
          />
        )
      ) : null}
    </AppShell>
  );
}
