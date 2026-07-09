import Link from "next/link";
import { notFound } from "next/navigation";
import { completeNextStepAction } from "@/app/actions";
import { AppShell, EnvNotice, ErrorNotice, PageHeader, PriorityBadge, StatusBadge } from "@/app/ui";
import { formatCurrency, formatDate } from "@/lib/cfp/format";
import { getGoalDetail } from "@/lib/cfp/data";

export const dynamic = "force-dynamic";

function timelinePoints(logs: Array<{ logged_amount: number | string }>, targetAmount: number) {
  if (!logs.length) return "";
  const width = 680;
  const height = 220;
  const max = Math.max(targetAmount, ...logs.map((log) => Number(log.logged_amount)));
  return logs
    .map((log, index) => {
      const x = logs.length === 1 ? width / 2 : (index / (logs.length - 1)) * width;
      const y = height - (Number(log.logged_amount) / max) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export default async function GoalDetailPage({
  params,
}: {
  params: Promise<{ id: string; goalId: string }>;
}) {
  const { id, goalId } = await params;
  const data = await getGoalDetail(id, goalId);

  if (data.configured && (!data.customer || !data.goal) && !data.error) notFound();

  const targetAmount = Number(data.goal?.target_amount ?? 0);
  const points = timelinePoints(data.logs ?? [], targetAmount);
  const openActions = (data.actions ?? []).filter((action) => !action.completed);
  const completedActions = (data.actions ?? []).filter((action) => action.completed);

  return (
    <AppShell>
      <PageHeader
        eyebrow={data.customer?.full_name || "Goal"}
        title={data.goal?.goal_name || "Goal History"}
        actions={
          <Link className="btn btn-secondary" href={`/customers/${id}`}>
            Back to Customer
          </Link>
        }
      />

      {!data.configured ? <EnvNotice /> : null}
      <ErrorNotice message={data.error} />

      {data.configured && data.goal ? (
        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-4">
            <div className="panel p-4">
              <p className="text-sm font-bold uppercase text-[#68756f]">Status</p>
              <div className="mt-3">
                <StatusBadge status={data.goal.on_track_status} />
              </div>
            </div>
            <div className="panel p-4">
              <p className="text-sm font-bold uppercase text-[#68756f]">Current</p>
              <p className="mt-2 text-2xl font-bold">{formatCurrency(data.goal.current_amount)}</p>
            </div>
            <div className="panel p-4">
              <p className="text-sm font-bold uppercase text-[#68756f]">Target</p>
              <p className="mt-2 text-2xl font-bold">{formatCurrency(data.goal.target_amount)}</p>
            </div>
            <div className="panel p-4">
              <p className="text-sm font-bold uppercase text-[#68756f]">Priority</p>
              <div className="mt-3">
                <PriorityBadge priority={data.goal.priority} />
              </div>
            </div>
          </section>

          <section className="panel p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Progress timeline</h2>
                <p className="mt-1 text-sm text-[#68756f]">Logged value over time against the target amount.</p>
              </div>
              <p className="text-sm font-semibold text-[#68756f]">Target date {formatDate(data.goal.target_date)}</p>
            </div>

            {points ? (
              <div className="mt-5 overflow-x-auto">
                <svg viewBox="0 0 720 260" className="min-w-[680px]" role="img" aria-label="Goal progress timeline">
                  <line x1="20" y1="230" x2="700" y2="230" stroke="#dce2dc" strokeWidth="2" />
                  <line x1="20" y1="10" x2="20" y2="230" stroke="#dce2dc" strokeWidth="2" />
                  <line x1="20" y1="30" x2="700" y2="30" stroke="#0f766e" strokeDasharray="6 6" strokeWidth="2" />
                  <text x="24" y="24" fill="#0f766e" fontSize="13" fontWeight="700">
                    {formatCurrency(targetAmount)}
                  </text>
                  <g transform="translate(20 10)">
                    <polyline fill="none" points={points} stroke="#115e59" strokeWidth="4" strokeLinejoin="round" />
                    {(data.logs ?? []).map((log, index) => {
                      const [x, y] = points.split(" ")[index].split(",");
                      return <circle key={log.id} cx={x} cy={y} r="6" fill="#115e59" />;
                    })}
                  </g>
                </svg>
              </div>
            ) : (
              <p className="mt-5 rounded-md border border-[#dce2dc] p-4 text-sm text-[#68756f]">No progress logs yet.</p>
            )}
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="panel">
              <div className="border-b border-[#dce2dc] p-4">
                <h2 className="text-xl font-bold">Progress logs</h2>
              </div>
              <div className="divide-y divide-[#dce2dc]">
                {(data.logs ?? [])
                  .slice()
                  .reverse()
                  .map((log) => (
                    <div className="p-4" key={log.id}>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold">{formatCurrency(log.logged_amount)}</p>
                        <StatusBadge status={log.on_track_status} />
                      </div>
                      <p className="mt-1 text-sm text-[#68756f]">
                        {formatDate(log.created_at)} · {log.logged_by || "Advisor"}
                      </p>
                      <p className="mt-2 text-sm text-[#405047]">{log.notes || "No note"}</p>
                    </div>
                  ))}
                {!data.logs?.length ? <p className="p-4 text-sm text-[#68756f]">No progress logged yet.</p> : null}
              </div>
            </div>

            <div className="panel">
              <div className="border-b border-[#dce2dc] p-4">
                <h2 className="text-xl font-bold">Actions</h2>
              </div>
              <div className="divide-y divide-[#dce2dc]">
                {openActions.map((action) => (
                  <div key={action.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto]">
                    <div>
                      <p className="font-bold">{action.action_title}</p>
                      <p className="mt-1 text-sm text-[#68756f]">
                        {action.assigned_to || "Unassigned"} · due {formatDate(action.due_date)}
                      </p>
                      <p className="mt-2 text-sm text-[#405047]">{action.action_description || "No description"}</p>
                    </div>
                    <form action={completeNextStepAction}>
                      <input type="hidden" name="action_id" value={action.id} />
                      <input type="hidden" name="customer_id" value={id} />
                      <input type="hidden" name="goal_id" value={goalId} />
                      <input type="hidden" name="actor" value={action.assigned_to || data.customer?.assigned_advisor_name || "Advisor"} />
                      <button className="btn btn-secondary" type="submit">
                        Complete
                      </button>
                    </form>
                  </div>
                ))}
                {completedActions.map((action) => (
                  <div key={action.id} className="p-4">
                    <p className="font-bold">{action.action_title}</p>
                    <p className="mt-1 text-sm text-[#68756f]">Completed {formatDate(action.completed_at)}</p>
                  </div>
                ))}
                {!data.actions?.length ? <p className="p-4 text-sm text-[#68756f]">No actions yet.</p> : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
