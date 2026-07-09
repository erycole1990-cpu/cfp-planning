import Link from "next/link";
import { notFound } from "next/navigation";
import { completeNextStepAction, createGoal, createNextStepAction, logProgress, updateCustomer, updateGoalPriority } from "@/app/actions";
import { AppShell, EmptyState, EnvNotice, ErrorNotice, PageHeader, PriorityBadge, StatusBadge } from "@/app/ui";
import { formatCurrency, formatDate, toDateInputValue } from "@/lib/cfp/format";
import { getCustomerDetail } from "@/lib/cfp/data";

export const dynamic = "force-dynamic";

const priorityOrder = { high: 0, medium: 1, low: 2 } as const;

function progressPercent(currentAmount: number | string, targetAmount: number | string) {
  const current = Number(currentAmount);
  const target = Number(targetAmount);
  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

function nextPriority(priority: string, direction: "up" | "down") {
  const order = ["high", "medium", "low"];
  const index = order.indexOf(priority);
  if (index === -1) return "medium";
  const nextIndex = direction === "up" ? Math.max(0, index - 1) : Math.min(order.length - 1, index + 1);
  return order[nextIndex];
}

function yearsUntil(targetDate: string) {
  const today = new Date();
  const target = new Date(`${targetDate}T00:00:00`);
  const years = (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return Math.max(0, Math.round(years * 10) / 10);
}

function calculatorHref(goal: {
  goal_name: string;
  target_amount: number | string;
  current_amount: number | string;
  target_date: string;
}) {
  const params = new URLSearchParams({
    goalName: goal.goal_name,
    todayCost: String(goal.target_amount),
    currentSavings: String(goal.current_amount),
    years: String(yearsUntil(goal.target_date)),
  });
  return `/calculator?${params.toString()}`;
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const data = await getCustomerDetail(id);

  if (data.configured && !data.customer && !data.error) notFound();

  const customer = data.customer;
  const today = toDateInputValue(new Date());
  const actionsByGoal = new Map<string, NonNullable<typeof data.actions>>();
  for (const action of data.actions ?? []) {
    if (!action.goal_id) continue;
    const list = actionsByGoal.get(action.goal_id) ?? [];
    list.push(action);
    actionsByGoal.set(action.goal_id, list);
  }

  const activity = [
    ...(data.logs ?? []).map((log) => ({
      id: `log-${log.id}`,
      date: log.created_at,
      title: "Progress logged",
      detail: `${formatCurrency(log.logged_amount)} by ${log.logged_by || "Advisor"}${log.notes ? `: ${log.notes}` : ""}`,
    })),
    ...(data.actions ?? []).map((action) => ({
      id: `action-${action.id}`,
      date: action.completed_at || action.created_at,
      title: action.completed ? "Action completed" : "Action created",
      detail: `${action.action_title} · ${action.assigned_to || "Unassigned"}`,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const sortedGoals = (data.goals ?? []).slice().sort((a, b) => {
    const priorityDelta =
      (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 1) -
      (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 1);
    if (priorityDelta) return priorityDelta;
    return new Date(a.target_date).getTime() - new Date(b.target_date).getTime();
  });

  return (
    <AppShell>
      <PageHeader
        eyebrow={customer?.assigned_advisor_name || "Customer detail"}
        title={customer?.full_name || "Customer"}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link className="btn btn-secondary" href="/customers">
              Back
            </Link>
            <Link className="btn btn-secondary" href="/">
              Dashboard
            </Link>
          </div>
        }
      />

      {!data.configured ? <EnvNotice /> : null}
      <ErrorNotice message={data.error} />
      {query.saved ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          Saved. The database and dashboard are updated.
        </div>
      ) : null}

      {data.configured && customer ? (
        <div className="space-y-6">
          <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="panel p-5">
              <h2 className="text-xl font-bold">Customer profile</h2>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-bold text-[#68756f]">Email</dt>
                  <dd>{customer.email || "Not set"}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[#68756f]">Phone</dt>
                  <dd>{customer.phone || "Not set"}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[#68756f]">DOB</dt>
                  <dd>{formatDate(customer.date_of_birth)}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[#68756f]">Risk</dt>
                  <dd className="capitalize">{customer.risk_profile || "Not set"}</dd>
                </div>
              </dl>
              <p className="mt-4 text-sm text-[#405047]">{customer.notes || "No customer notes yet."}</p>

              <details className="mt-5 rounded-md border border-[#dce2dc] p-4">
                <summary className="cursor-pointer font-bold">Edit customer</summary>
                <form action={updateCustomer} className="mt-4 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="customer_id" value={customer.id} />
                  <label className="field sm:col-span-2">
                    <span className="label">Full name</span>
                    <input className="input" name="full_name" required defaultValue={customer.full_name} />
                  </label>
                  <label className="field">
                    <span className="label">Email</span>
                    <input className="input" name="email" type="email" defaultValue={customer.email || ""} />
                  </label>
                  <label className="field">
                    <span className="label">Phone</span>
                    <input className="input" name="phone" defaultValue={customer.phone || ""} />
                  </label>
                  <label className="field">
                    <span className="label">DOB</span>
                    <input className="input" name="date_of_birth" type="date" defaultValue={customer.date_of_birth || ""} />
                  </label>
                  <label className="field">
                    <span className="label">Risk</span>
                    <select className="input" name="risk_profile" required defaultValue={customer.risk_profile || "moderate"}>
                      <option value="conservative">Conservative</option>
                      <option value="moderate">Moderate</option>
                      <option value="aggressive">Aggressive</option>
                    </select>
                  </label>
                  <label className="field sm:col-span-2">
                    <span className="label">Advisor</span>
                    <input className="input" name="assigned_advisor_name" required defaultValue={customer.assigned_advisor_name || ""} />
                  </label>
                  <label className="field sm:col-span-2">
                    <span className="label">Notes</span>
                    <textarea className="input min-h-24" name="notes" defaultValue={customer.notes || ""} />
                  </label>
                  <button className="btn sm:col-span-2" type="submit">
                    Save Profile
                  </button>
                </form>
              </details>
            </div>

            <div className="panel p-5">
              <h2 className="text-xl font-bold">Add financial goal</h2>
              <form action={createGoal} className="mt-4 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="customer_id" value={customer.id} />
                <input type="hidden" name="actor" value={customer.assigned_advisor_name || "Advisor"} />
                <label className="field">
                  <span className="label">Goal type</span>
                  <select className="input" name="goal_type" required defaultValue="Retirement">
                    <option>Retirement</option>
                    <option>Education</option>
                    <option>Emergency Fund</option>
                    <option>Wealth Accumulation</option>
                    <option>Protection</option>
                  </select>
                </label>
                <label className="field">
                  <span className="label">Priority</span>
                  <select className="input" name="priority" required defaultValue="medium">
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </label>
                <label className="field sm:col-span-2">
                  <span className="label">Goal name</span>
                  <input className="input" name="goal_name" required placeholder="Retire with income floor" />
                </label>
                <label className="field">
                  <span className="label">Target amount</span>
                  <input className="input" name="target_amount" required min="1" step="1" type="number" />
                </label>
                <label className="field">
                  <span className="label">Current amount</span>
                  <input className="input" name="current_amount" required min="0" step="1" type="number" defaultValue="0" />
                </label>
                <label className="field">
                  <span className="label">Target date</span>
                  <input className="input" name="target_date" required min={today} type="date" />
                </label>
                <button className="btn self-end" type="submit">
                  Add Goal
                </button>
              </form>
            </div>
          </section>

          <section className="space-y-4">
            <div id="goal-setting-list" className="panel p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold">Goal Setting List</h2>
                  <p className="mt-1 text-sm text-[#68756f]">Priority order controls which goals stay at the top of this portfolio.</p>
                </div>
                <Link className="btn btn-secondary" href="/calculator">
                  Open Calculator
                </Link>
              </div>

              {sortedGoals.length ? (
                <div className="mt-4 space-y-3">
                  {sortedGoals.map((goal, index) => {
                    const percent = progressPercent(goal.current_amount, goal.target_amount);
                    const canMoveUp = goal.priority !== "high";
                    const canMoveDown = goal.priority !== "low";
                    return (
                      <div key={goal.id} className="rounded-md border border-[#dce2dc] p-4">
                        <div className="grid gap-4 lg:grid-cols-[auto_1fr_auto]">
                          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#eef3ef] text-sm font-bold text-[#405047]">
                            {index + 1}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Link className="text-lg font-bold text-[#0f766e]" href={`#goal-${goal.id}`}>
                                {goal.goal_name}
                              </Link>
                              <PriorityBadge priority={goal.priority} />
                              <StatusBadge status={goal.on_track_status} />
                            </div>
                            <p className="mt-1 text-sm text-[#68756f]">
                              {goal.goal_type} - target {formatCurrency(goal.target_amount)} by {formatDate(goal.target_date)}
                            </p>
                            <div className="mt-3">
                              <div className="mb-1 flex items-center justify-between text-sm">
                                <span className="font-semibold">{formatCurrency(goal.current_amount)} saved</span>
                                <span className="font-bold text-[#115e59]">{percent}%</span>
                              </div>
                              <div className="h-2 rounded-full bg-[#eef3ef]">
                                <div className="h-2 rounded-full bg-[#0f766e]" style={{ width: `${percent}%` }} />
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-start gap-2 lg:justify-end">
                            <form action={updateGoalPriority}>
                              <input type="hidden" name="customer_id" value={customer.id} />
                              <input type="hidden" name="goal_id" value={goal.id} />
                              <input type="hidden" name="priority" value={nextPriority(goal.priority, "up")} />
                              <input type="hidden" name="actor" value={customer.assigned_advisor_name || "Advisor"} />
                              <button className="btn btn-secondary" disabled={!canMoveUp} type="submit">
                                Move Up
                              </button>
                            </form>
                            <form action={updateGoalPriority}>
                              <input type="hidden" name="customer_id" value={customer.id} />
                              <input type="hidden" name="goal_id" value={goal.id} />
                              <input type="hidden" name="priority" value={nextPriority(goal.priority, "down")} />
                              <input type="hidden" name="actor" value={customer.assigned_advisor_name || "Advisor"} />
                              <button className="btn btn-secondary" disabled={!canMoveDown} type="submit">
                                Move Down
                              </button>
                            </form>
                            <Link className="btn" href={calculatorHref(goal)}>
                              Calculate Number
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-4">
                  <EmptyState title="No goals in the setting list" body="Add the first financial goal, then use the calculator to confirm its target number." />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-bold">Goals</h2>
              <p className="text-sm text-[#68756f]">{data.goals?.length || 0} active planning goals</p>
            </div>

            {sortedGoals.length ? (
              sortedGoals.map((goal) => {
                const latestLog = data.latestLogsByGoal?.[goal.id];
                const goalActions = actionsByGoal.get(goal.id) ?? [];
                const openGoalActions = goalActions.filter((action) => !action.completed);
                const completedGoalActions = goalActions.filter((action) => action.completed);
                const percent = progressPercent(goal.current_amount, goal.target_amount);
                return (
                  <article id={`goal-${goal.id}`} key={goal.id} className="panel p-5">
                    <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-xl font-bold">{goal.goal_name}</h3>
                          <StatusBadge status={goal.on_track_status} />
                          <PriorityBadge priority={goal.priority} />
                        </div>
                        <p className="mt-2 text-sm text-[#68756f]">
                          {goal.goal_type} · {formatCurrency(goal.current_amount)} of {formatCurrency(goal.target_amount)} · target{" "}
                          {formatDate(goal.target_date)}
                        </p>
                        <div className="mt-3 max-w-xl">
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span className="font-semibold">Goal progress</span>
                            <span className="font-bold text-[#115e59]">{percent}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-[#eef3ef]">
                            <div className="h-2 rounded-full bg-[#0f766e]" style={{ width: `${percent}%` }} />
                          </div>
                        </div>
                        <p className="mt-3 text-sm text-[#405047]">
                          <span className="font-bold">Last progress note: </span>
                          {latestLog?.notes || "No progress logged yet"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <Link className="btn btn-secondary" href={calculatorHref(goal)}>
                          Calculate Number
                        </Link>
                        <Link className="btn btn-secondary" href={`/customers/${customer.id}/goals/${goal.id}`}>
                          View History
                        </Link>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                      <details className="rounded-md border border-[#dce2dc] p-4" open={goal.on_track_status === "off_track"}>
                        <summary className="cursor-pointer font-bold">Log Progress</summary>
                        <form action={logProgress} className="mt-4 grid gap-3">
                          <input type="hidden" name="customer_id" value={customer.id} />
                          <input type="hidden" name="goal_id" value={goal.id} />
                          <label className="field">
                            <span className="label">Current value</span>
                            <input
                              className="input"
                              name="logged_amount"
                              required
                              min="0"
                              step="1"
                              type="number"
                              defaultValue={String(goal.current_amount)}
                            />
                          </label>
                          <label className="field">
                            <span className="label">Logged by</span>
                            <input className="input" name="logged_by" required defaultValue={customer.assigned_advisor_name || ""} />
                          </label>
                          <label className="field">
                            <span className="label">Notes</span>
                            <textarea className="input min-h-24" name="notes" placeholder="What changed since the last review?" />
                          </label>
                          <button className="btn" type="submit">
                            Save Progress
                          </button>
                        </form>
                      </details>

                      <details className="rounded-md border border-[#dce2dc] p-4" open={goal.on_track_status === "off_track"}>
                        <summary className="cursor-pointer font-bold">Add Next-Step Action</summary>
                        <form action={createNextStepAction} className="mt-4 grid gap-3">
                          <input type="hidden" name="customer_id" value={customer.id} />
                          <input type="hidden" name="goal_id" value={goal.id} />
                          <label className="field">
                            <span className="label">Action title</span>
                            <input className="input" name="action_title" required placeholder="Review asset allocation" />
                          </label>
                          <label className="field">
                            <span className="label">Description</span>
                            <textarea className="input min-h-20" name="action_description" />
                          </label>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <label className="field">
                              <span className="label">Assigned to</span>
                              <input className="input" name="assigned_to" required defaultValue={customer.assigned_advisor_name || ""} />
                            </label>
                            <label className="field">
                              <span className="label">Due date</span>
                              <input className="input" name="due_date" required min={today} type="date" />
                            </label>
                            <label className="field">
                              <span className="label">Priority</span>
                              <select className="input" name="priority" required defaultValue="high">
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                              </select>
                            </label>
                          </div>
                          <button className="btn" type="submit">
                            Save Action
                          </button>
                        </form>
                      </details>
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                      <div>
                        <h4 className="font-bold">Open actions</h4>
                        <div className="mt-2 divide-y divide-[#dce2dc] rounded-md border border-[#dce2dc]">
                          {openGoalActions.map((action) => (
                            <div className="grid gap-3 p-3 sm:grid-cols-[1fr_auto]" key={action.id}>
                              <div>
                                <p className="font-semibold">{action.action_title}</p>
                                <p className="text-sm text-[#68756f]">
                                  {action.assigned_to || "Unassigned"} · due {formatDate(action.due_date)}
                                </p>
                              </div>
                              <form action={completeNextStepAction}>
                                <input type="hidden" name="action_id" value={action.id} />
                                <input type="hidden" name="customer_id" value={customer.id} />
                                <input type="hidden" name="goal_id" value={goal.id} />
                                <input type="hidden" name="actor" value={action.assigned_to || customer.assigned_advisor_name || "Advisor"} />
                                <button className="btn btn-secondary" type="submit">
                                  Complete
                                </button>
                              </form>
                            </div>
                          ))}
                          {!openGoalActions.length ? <p className="p-3 text-sm text-[#68756f]">No open actions for this goal.</p> : null}
                        </div>
                      </div>
                      <div>
                        <h4 className="font-bold">Completed actions</h4>
                        <div className="mt-2 divide-y divide-[#dce2dc] rounded-md border border-[#dce2dc]">
                          {completedGoalActions.slice(0, 3).map((action) => (
                            <div className="p-3" key={action.id}>
                              <p className="font-semibold">{action.action_title}</p>
                              <p className="text-sm text-[#68756f]">Completed {formatDate(action.completed_at)}</p>
                            </div>
                          ))}
                          {!completedGoalActions.length ? <p className="p-3 text-sm text-[#68756f]">No completed actions yet.</p> : null}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <EmptyState title="No goals yet" body="Use Add financial goal to create the first goal for this customer." />
            )}
          </section>

          <section className="panel p-5">
            <h2 className="text-xl font-bold">Activity feed</h2>
            <div className="mt-4 divide-y divide-[#dce2dc]">
              {activity.slice(0, 10).map((item) => (
                <div key={item.id} className="py-3">
                  <p className="font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm text-[#68756f]">{item.detail}</p>
                  <p className="mt-1 text-xs font-bold uppercase text-[#8a9690]">{formatDate(item.date)}</p>
                </div>
              ))}
              {!activity.length ? <p className="text-sm text-[#68756f]">Progress logs and actions will appear here.</p> : null}
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
