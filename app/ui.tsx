import Link from "next/link";
import { statusLabel } from "@/lib/cfp/status";
import { accessDisplayName, getCurrentAccess } from "@/lib/cfp/access";
import { createCfpServerClient } from "@/lib/cfp/supabase";
import { NavigationShell } from "@/app/navigation-shell";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const access = await getCurrentAccess();
  let unreadAlerts = 0;
  if (access) {
    const supabase = await createCfpServerClient();
    if (supabase) {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_user_id", access.user.id)
        .is("read_at", null);
      unreadAlerts = count || 0;
    }
  }

  return (
    <NavigationShell
      access={{
        signedIn: Boolean(access),
        role: access?.profile.role,
        status: access?.profile.status,
        displayName: access ? accessDisplayName(access) : undefined,
        unreadAlerts,
        isAdmin: Boolean(access?.isAdmin),
        isAgent: Boolean(access?.isAgent),
      }}
    >
      {children}
    </NavigationShell>
  );
}

export function PageHeader({
  title,
  eyebrow,
  actions,
}: {
  title: string;
  eyebrow?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow ? <p className="mb-1 text-sm font-bold uppercase text-[#68756f]">{eyebrow}</p> : null}
        <h1 className="text-3xl font-bold tracking-normal">{title}</h1>
      </div>
      {actions}
    </div>
  );
}

export function EnvNotice() {
  return (
    <div className="panel p-5">
      <h2 className="text-xl font-bold">Connect Supabase to use the workspace</h2>
      <p className="mt-2 max-w-3xl text-[#53625b]">
        This build expects `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.
        Once Vercel envs are pulled, the dashboard and forms
        will read and write the existing migration tables.
      </p>
    </div>
  );
}

export function ErrorNotice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
      {message}
    </div>
  );
}

export function StatusBadge({ status }: { status?: string | null }) {
  const classes =
    status === "on_track"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : status === "at_risk"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : status === "off_track"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${classes}`}>
      {statusLabel(status)}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority?: string | null }) {
  const text = priority || "medium";
  return <span className="rounded-full bg-[#eef3ef] px-2.5 py-1 text-xs font-bold capitalize text-[#405047]">{text}</span>;
}

export function StatCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="panel p-4">
      <p className="text-sm font-bold uppercase text-[#68756f]">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      {detail ? <p className="mt-1 text-sm text-[#68756f]">{detail}</p> : null}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="panel p-6 text-center">
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mx-auto mt-2 max-w-2xl text-[#68756f]">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  pathname,
  query = {},
}: {
  page: number;
  totalPages: number;
  pathname: string;
  query?: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;
  const href = (nextPage: number) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    if (nextPage > 1) params.set("page", String(nextPage));
    const suffix = params.toString();
    return suffix ? `${pathname}?${suffix}` : pathname;
  };
  return (
    <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Pagination">
      {page > 1 ? <Link className="btn btn-secondary" href={href(page - 1)}>Previous</Link> : <span />}
      <span className="text-sm font-semibold text-[#68756f]">Page {page} of {totalPages}</span>
      {page < totalPages ? <Link className="btn btn-secondary" href={href(page + 1)}>Next</Link> : <span />}
    </nav>
  );
}
