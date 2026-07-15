import Link from "next/link";
import { AppShell, EmptyState, ErrorNotice, PageHeader } from "@/app/ui";
import { requireCurrentAccess } from "@/lib/cfp/access";
import { createCfpServerClient, type Notification } from "@/lib/cfp/supabase";
import { markAllNotificationsRead, openNotification, updateNotificationWorkflow } from "./actions";

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

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const access = await requireCurrentAccess();
  const params = await searchParams;
  const requestedView = params.view;
  const view: AlertView = requestedView === "snoozed" || requestedView === "resolved" || requestedView === "all" ? requestedView : "open";
  const supabase = await createCfpServerClient();
  if (!supabase) return <AppShell><EmptyState title="Alerts unavailable" body="The planning database is not connected." /></AppShell>;

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_user_id", access.user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  const allNotifications = (data || []) as Notification[];
  const unread = allNotifications.filter((notification) => !notification.read_at).length;
  const notifications = allNotifications.filter((notification) => view === "all" || alertStatus(notification) === view);

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
                    </div>
                    <p className="mt-1 text-sm text-[#53625b]">{notification.body}</p>
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
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
