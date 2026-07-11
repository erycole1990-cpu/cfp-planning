import Link from "next/link";
import { statusLabel } from "@/lib/cfp/status";
import { getCurrentAccess } from "@/lib/cfp/access";
import { signOut } from "@/app/login/actions";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const access = await getCurrentAccess();

  return (
    <div className="min-h-screen">
      <header className="border-b border-[#dce2dc] bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/" className="text-lg font-bold">
            CFP Planning
          </Link>
          <nav className="flex items-center gap-2 text-sm font-semibold text-[#405047]">
            <Link className="rounded-md px-3 py-2 hover:bg-[#eef3ef]" href="/">
              Dashboard
            </Link>
            <Link className="rounded-md px-3 py-2 hover:bg-[#eef3ef]" href="/customers">
              Customers
            </Link>
            <Link className="rounded-md px-3 py-2 hover:bg-[#eef3ef]" href="/calculator">
              Calculator
            </Link>
            {access?.isAdmin ? (
              <Link className="rounded-md px-3 py-2 hover:bg-[#eef3ef]" href="/admin/access">
                Admin
              </Link>
            ) : null}
            {access?.isAdmin || access?.isAgent ? (
              <Link className="btn" href="/customers/new">
                Add Customer
              </Link>
            ) : null}
            {access ? (
              <form action={signOut} className="flex items-center gap-2">
                <span className="hidden text-xs font-semibold text-[#68756f] md:inline">
                  {access.profile.role} · {access.user.email}
                </span>
                <button className="btn btn-secondary" type="submit">
                  Sign Out
                </button>
              </form>
            ) : null}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {access && access.profile.status !== "active" ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            Your account is waiting for admin approval. You can sign out or ask the admin to activate your role.
          </div>
        ) : null}
        {children}
      </main>
    </div>
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
        This build expects `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and optionally
        `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Once Vercel envs are pulled, the dashboard and forms
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
