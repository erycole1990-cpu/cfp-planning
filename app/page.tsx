import Link from "next/link";
import { completeNextStepAction } from "./actions";
import { AppShell, EmptyState, EnvNotice, ErrorNotice, PageHeader, PriorityBadge, StatCard, StatusBadge } from "./ui";
import { formatCurrency, formatDate } from "@/lib/cfp/format";
import { getDashboardData } from "@/lib/cfp/data";

export const dynamic = "force-dynamic";

function isDueThisWeek(date: string | null) {
  if (!date) return false;
  const now = new Date();
  const end = new Date();
  end.setDate(now.getDate() + 7);
  const due = new Date(`${date}T00:00:00`);
  return due >= new Date(now.toDateString()) && due <= end;
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; saved?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const data = await getDashboardData();
  const openActions = data.actions.filter((action) => !action.completed);
  const completedActions = data.actions.filter((action) => action.completed);
  const statusFilter = params.status || "all";
  const exceptionGoals = data.goals.filter((goal) => goal.on_track_status === "off_track" || goal.on_track_status === "at_risk");
  const onTrackGoals = data.goals.filter((goal) => goal.on_track_status === "on_track").slice(0, 5);
  const filteredGoals =
    statusFilter === "all" ? [...exceptionGoals, ...onTrackGoals] : data.goals.filter((goal) => goal.on_track_status === statusFilter);
  const goals = filteredGoals.slice(0, 10);
  const hiddenGoalCount = Math.max(0, filteredGoals.length - goals.length);
  const customerIdsWithGoals = new Set(data.goals.map((goal) => goal.customer_id));
  const customersNeedingGoals = data.customers.filter((customer) => !customerIdsWithGoals.has(customer.id));

  return (
    <AppShell>
      <PageHeader
        eyebrow="Advisor operations"
        title="Dashboard"
        actions={
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "All"],
              ["on_track", "On Track"],
              ["at_risk", "At Risk"],
              ["off_track", "Off Track"],
            ].map(([value, label]) => (
              <Link
                key={value}
                href={value === "all" ? "/" : `/?status=${value}`}
                className={`rounded-md border px-3 py-2 text-sm font-bold ${
                  statusFilter === value ? "border-[#0f766e] bg-[#dff4ef] text-[#115e59]" : "border-[#dce2dc] bg-white"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        }
      />

      {!data.configured ? <EnvNotice /> : null}
      <ErrorNotice message={data.error} />
      {params.saved ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          Change saved and dashboard refreshed.
        </div>
      ) : null}

      {data.configured ? (
        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-4">
            <StatCard label="Customers" value={data.customers.length} detail="Active planning records" />
            <StatCard label="Need setup" value={customersNeedingGoals.length} detail="Customers without goals" />
            <StatCard
              label="Off-track goals"
              value={data.goals.filter((goal) => goal.on_track_status === "off_track").length}
              detail="Sorted to the top below"
            />
            <StatCard label="Open actions" value={openActions.length} detail="Advisor follow-ups" />
          </section>

          {statusFilter === "all" && customersNeedingGoals.length ? (
            <section className="panel">
              <div className="border-b border-[#dce2dc] p-4">
                <h2 className="text-xl font-bold">Needs goal setup</h2>
                <p className="mt-1 text-sm text-[#68756f]">New customers stay here until their first planning goal is added.</p>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Advisor</th>
                      <th>Risk</th>
                      <th>Created</th>
                      <th>Next step</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customersNeedingGoals.map((customer) => (
                      <tr key={customer.id}>
                        <td>
                          <Link className="font-bold text-[#0f766e]" href={`/customers/${customer.id}`}>
                            {customer.full_name}
                          </Link>
                          <p className="mt-1 text-sm text-[#68756f]">{customer.email || "No email"}</p>
                        </td>
                        <td>{customer.assigned_advisor_name || "Not assigned"}</td>
                        <td>{customer.risk_profile || "Not set"}</td>
                        <td>{formatDate(customer.created_at)}</td>
                        <td>
                          <Link className="btn btn-secondary" href={`/customers/${customer.id}`}>
                            Add First Goal
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className="panel">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dce2dc] p-4">
              <div>
                <h2 className="text-xl font-bold">Priority goal queue</h2>
                <p className="mt-1 text-sm text-[#68756f]">
                  Exceptions appear first. On-track goals are capped so the dashboard stays focused.
                </p>
              </div>
              <Link className="btn btn-secondary" href="/customers">
                View Customers
              </Link>
            </div>
            {goals.length ? (
              <div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Goal</th>
                        <th>Status</th>
                        <th>Progress</th>
                        <th>Last note</th>
                        <th>Target date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {goals.map((goal) => {
                        const latestLog = data.latestLogsByGoal[goal.id];
                        return (
                          <tr key={goal.id}>
                            <td>
                              <Link className="font-bold text-[#0f766e]" href={`/customers/${goal.customer_id}`}>
                                {goal.customer?.full_name || "Customer"}
                              </Link>
                              <p className="mt-1 text-sm text-[#68756f]">{goal.customer?.assigned_advisor_name}</p>
                            </td>
                            <td>
                              <Link className="font-semibold" href={`/customers/${goal.customer_id}/goals/${goal.id}`}>
                                {goal.goal_name}
                              </Link>
                              <p className="mt-1 text-sm text-[#68756f]">{goal.goal_type}</p>
                            </td>
                            <td>
                              <StatusBadge status={goal.on_track_status} />
                            </td>
                            <td>
                              <span className="font-semibold">{formatCurrency(goal.current_amount)}</span>
                              <span className="text-[#68756f]"> / {formatCurrency(goal.target_amount)}</span>
                            </td>
                            <td className="max-w-sm text-sm text-[#405047]">{latestLog?.notes || "No progress logged yet"}</td>
                            <td>{formatDate(goal.target_date)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {hiddenGoalCount ? (
                  <div className="border-t border-[#dce2dc] p-4 text-sm font-semibold text-[#68756f]">
                    Showing the first {goals.length} items. {hiddenGoalCount} more are hidden to keep this dashboard focused.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="p-4">
                <EmptyState title="No goals in this status" body="Change the filter or add a customer goal to start tracking progress." />
              </div>
            )}
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
            <div className="panel">
              <div className="border-b border-[#dce2dc] p-4">
                <h2 className="text-xl font-bold">Open next-step actions</h2>
              </div>
              {openActions.length ? (
                <div className="divide-y divide-[#dce2dc]">
                  {openActions.map((action) => (
                    <div key={action.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto]">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold">{action.action_title}</h3>
                          <PriorityBadge priority={action.priority} />
                        </div>
                        <p className="mt-1 text-sm text-[#68756f]">{action.action_description || "No description"}</p>
                        <p className="mt-2 text-sm">
                          <Link className="font-semibold text-[#0f766e]" href={`/customers/${action.customer_id}`}>
                            {action.customer?.full_name || "Customer"}
                          </Link>
                          <span className="text-[#68756f]"> · {action.assigned_to || "Unassigned"} · due {formatDate(action.due_date)}</span>
                        </p>
                      </div>
                      <form action={completeNextStepAction}>
                        <input type="hidden" name="action_id" value={action.id} />
                        <input type="hidden" name="customer_id" value={action.customer_id} />
                        <input type="hidden" name="goal_id" value={action.goal_id || ""} />
                        <input type="hidden" name="actor" value={action.assigned_to || "Advisor"} />
                        <button className="btn btn-secondary" type="submit">
                          Mark Complete
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4">
                  <EmptyState title="No open actions" body="Add a next-step action from a customer goal when coaching work is needed." />
                </div>
              )}
            </div>

            <div className="panel">
              <div className="border-b border-[#dce2dc] p-4">
                <h2 className="text-xl font-bold">Recently completed</h2>
              </div>
              <div className="divide-y divide-[#dce2dc]">
                {completedActions.slice(0, 5).map((action) => (
                  <div key={action.id} className="p-4">
                    <p className="font-bold">{action.action_title}</p>
                    <p className="mt-1 text-sm text-[#68756f]">
                      {action.assigned_to || "Advisor"} · completed {formatDate(action.completed_at)}
                    </p>
                  </div>
                ))}
                {!completedActions.length ? <p className="p-4 text-sm text-[#68756f]">Completed actions will appear here.</p> : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
