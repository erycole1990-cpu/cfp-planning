import Link from "next/link";
import { AppShell, EmptyState, ErrorNotice, PageHeader, Pagination } from "@/app/ui";
import { requireCurrentAccess } from "@/lib/cfp/access";
import { createCfpServerClient, type Notification } from "@/lib/cfp/supabase";
import { markAllNotificationsRead, openNotification, updateNotificationAccountability, updateNotificationWorkflow } from "./actions";

export const dynamic = "force-dynamic";

type AlertView = "open" | "snoozed" | "resolved" | "all";

function notificationDate(value: string) {
  return new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function alertStatus(notification: Notification) {
  const status = notification.workflow_status || "open";
  if (status === "snoozed" && notification.snoozed_until && new Date(notification.snoozed_until) <= new Date()) {
    return "open";
  }
  return status;
}

function tabClass(active: boolean) {
  return active ? "btn" : "btn btn-secondary";
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ view?: string; page?: string }> }) {
  const access = await requireCurrentAccess();
  const params = await searchParams;
  const requestedView = params.view;
  const view: AlertView = requestedView === "snoozed" || requestedView === "resolved" || requestedView === "all" ? requestedView : "open";
  const page = Math.max(1, Number.parseInt(params.page || "1", 10) || 1);
  const pageSize = 20;
  const supabase = await createCfpServerClient();
  if (!supabase) return <AppShell><EmptyState title="Alerts unavailable" body="The planning database is not connected." /></AppShell>;

  await supabase.rpc("cfp_escalate_my_overdue_notifications");
  await supabase
    .from("notifications")
    .update({ workflow_status: "open", snoozed_until: null })
    .eq("recipient_user_id", access.user.id)
    .eq("workflow_status", "snoozed")
    .lt("snoozed_until", new Date().toISOString());

  let notificationQuery = supabase
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("recipient_user_id", access.user.id)
    .order("created_at", { ascending: false });
  if (view !== "all") notificationQuery = notificationQuery.eq("workflow_status", view);
  const [{ data, error, count }, { count: unread }] = await Promise.all([
    notificationQuery.range((page - 1) * pageSize, page * pageSize - 1),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_user_id", access.user.id).is("read_at", null),
  ]);
  const notifications = (data || []) as Notification[];
  const totalPages = Math.max(1, Math.ceil((count || 0) / pageSize));

  return (
    <AppShell>
      <PageHeader
        eyebrow="Workspace"
        title="Alerts"
        actions={unread ? <form action={markAllNotificationsRead}><button className="btn btn-secondary" type="submit">Mark all read</button></form> : null}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link className={tabClass(view === "open")} href="/notifications">Open</Link>
        <Link className={tabClass(view === "snoozed")} href="/notifications?view=snoozed">Snoozed</Link>
        <Link className={tabClass(view === "resolved")} href="/notifications?view=resolved">Resolved</Link>
        <Link className={tabClass(view === "all")} href="/notifications?view=all">All</Link>
      </div>
      <p className="mb-4 text-sm text-[#53625b]">Reading an alert clears its badge. It stays in Open until you resolve or snooze it.</p>
      <ErrorNotice message={error?.message} />
      {!error && notifications.length === 0 ? (
        <EmptyState title={`No ${view} alerts`} body="New referrals, personal-plan updates, and review decisions will appear here." />
      ) : (
        <div className="panel overflow-hidden">
          {notifications.map((notification) => {
            const status = alertStatus(notification);
            return (
              <div className={`border-b border-[#dce2dc] p-4 last:border-0 ${notification.read_at ? "bg-white" : "bg-emerald-50"}`} key={notification.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{notification.title}</span>
                      <span className="rounded-full bg-[#eef3ef] px-2 py-1 text-xs font-bold capitalize text-[#405047]">{status}</span>
                      <span className={`rounded-full px-2 py-1 text-xs font-bold capitalize ${notification.priority === "urgent" ? "bg-red-100 text-red-800" : notification.priority === "high" ? "bg-amber-100 text-amber-900" : "bg-[#eef3ef] text-[#405047]"}`}>{notification.priority || "normal"}</span>
                    </div>
                    <p className="mt-1 text-sm text-[#53625b]">{notification.body}</p>
                    {notification.due_at ? (
                      <p className={`mt-1 text-xs font-semibold ${new Date(notification.due_at) < new Date() && status !== "resolved" ? "text-red-700" : "text-[#68756f]"}`}>
                        {new Date(notification.due_at) < new Date() && status !== "resolved" ? "Overdue: " : "Due: "}{notificationDate(notification.due_at)}
                      </p>
                    ) : null}
                    {status === "snoozed" && notification.snoozed_until ? (
                      <p className="mt-1 text-xs font-semibold text-[#68756f]">Returns to Open {notificationDate(notification.snoozed_until)}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs text-[#68756f]">{notificationDate(notification.created_at)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {notification.href ? (
                    <form action={openNotification}>
                      <input type="hidden" name="notification_id" value={notification.id} />
                      <input type="hidden" name="href" value={notification.href} />
                      <button className="btn" type="submit">Open task</button>
                    </form>
                  ) : null}
                  {status !== "open" ? (
                    <form action={updateNotificationWorkflow}>
                      <input type="hidden" name="notification_id" value={notification.id} />
                      <input type="hidden" name="workflow_action" value="open" />
                      <button className="btn btn-secondary" type="submit">Reopen</button>
                    </form>
                  ) : (
                    <>
                      <form action={updateNotificationWorkflow}>
                        <input type="hidden" name="notification_id" value={notification.id} />
                        <input type="hidden" name="workflow_action" value="snooze_day" />
                        <button className="btn btn-secondary" type="submit">Snooze 1 day</button>
                      </form>
                      <form action={updateNotificationWorkflow}>
                        <input type="hidden" name="notification_id" value={notification.id} />
                        <input type="hidden" name="workflow_action" value="snooze_week" />
                        <button className="btn btn-secondary" type="submit">Snooze 1 week</button>
                      </form>
                    </>
                  )}
                  {status !== "resolved" ? (
                    <form action={updateNotificationWorkflow}>
                      <input type="hidden" name="notification_id" value={notification.id} />
                      <input type="hidden" name="workflow_action" value="resolve" />
                      <button className="btn btn-secondary" type="submit">Resolve</button>
                    </form>
                  ) : null}
                </div>
                {status !== "resolved" ? (
                  <details className="mt-3 rounded-md border border-[#dce2dc] p-3">
                    <summary className="cursor-pointer text-sm font-semibold">Set priority or due date</summary>
                    <form action={updateNotificationAccountability} className="mt-3 grid gap-3 sm:grid-cols-[12rem_14rem_auto]">
                      <input type="hidden" name="notification_id" value={notification.id} />
                      <label className="field"><span className="label">Priority</span><select className="input" name="priority" defaultValue={notification.priority || "normal"}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
                      <label className="field"><span className="label">Due date</span><input className="input" type="date" name="due_date" defaultValue={notification.due_at?.slice(0, 10) || ""} /></label>
                      <button className="btn self-end" type="submit">Save</button>
                    </form>
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} pathname="/notifications" query={{ view: view === "open" ? undefined : view }} />
    </AppShell>
  );
}
