import { AppShell, EmptyState, ErrorNotice, PageHeader } from "@/app/ui";
import { requireCurrentAccess } from "@/lib/cfp/access";
import { createCfpServerClient, type Notification } from "@/lib/cfp/supabase";
import { markAllNotificationsRead, openNotification } from "./actions";

export const dynamic = "force-dynamic";

function notificationDate(value: string) {
  return new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function NotificationsPage() {
  const access = await requireCurrentAccess();
  const supabase = await createCfpServerClient();
  if (!supabase) return <AppShell><EmptyState title="Alerts unavailable" body="The planning database is not connected." /></AppShell>;

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_user_id", access.user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const notifications = (data || []) as Notification[];
  const unread = notifications.filter((notification) => !notification.read_at).length;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Workspace"
        title="Alerts"
        actions={unread ? <form action={markAllNotificationsRead}><button className="btn btn-secondary" type="submit">Mark all read</button></form> : null}
      />
      <ErrorNotice message={error?.message} />
      {!error && notifications.length === 0 ? (
        <EmptyState title="No alerts yet" body="New referrals, personal-plan updates, and review decisions will appear here." />
      ) : (
        <div className="panel overflow-hidden">
          {notifications.map((notification) => (
            <form action={openNotification} className={`border-b border-[#dce2dc] p-4 last:border-0 ${notification.read_at ? "bg-white" : "bg-emerald-50"}`} key={notification.id}>
              <input type="hidden" name="notification_id" value={notification.id} />
              <input type="hidden" name="href" value={notification.href || "/notifications"} />
              <button className="flex w-full items-start justify-between gap-4 text-left" type="submit">
                <span>
                  <span className="block font-bold">{notification.title}</span>
                  <span className="mt-1 block text-sm text-[#53625b]">{notification.body}</span>
                </span>
                <span className="shrink-0 text-xs text-[#68756f]">{notificationDate(notification.created_at)}</span>
              </button>
            </form>
          ))}
        </div>
      )}
    </AppShell>
  );
}
