import Link from "next/link";
import { AppShell, EmptyState, ErrorNotice, PageHeader, Pagination } from "@/app/ui";
import { requireCurrentAccess } from "@/lib/cfp/access";
import { auditActionLabel, auditDetails, auditEntityLabel } from "@/lib/cfp/audit";
import { formatDate } from "@/lib/cfp/format";
import { createCfpServerClient } from "@/lib/cfp/supabase";

export const dynamic = "force-dynamic";

type AuditRow = {
  id: string;
  created_at: string;
  actor: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
};

export default async function AuditPage({ searchParams }: { searchParams?: Promise<{ q?: string; action?: string; page?: string }> }) {
  const access = await requireCurrentAccess();
  const query = (await searchParams) || {};
  if (!access.isAdmin) return <AppShell><EmptyState title="Admin access required" body="Only admins can review the agency audit record." /></AppShell>;

  const supabase = await createCfpServerClient();
  if (!supabase) return <AppShell><ErrorNotice message="Supabase is not configured." /></AppShell>;
  const { data, error } = await supabase.from("audit_logs").select("id,created_at,actor,action,entity_type,entity_id,payload").order("created_at", { ascending: false }).limit(250);
  const allRows = (data || []) as AuditRow[];
  const q = String(query.q || "").trim().toLowerCase();
  const action = String(query.action || "").trim();
  const actions = Array.from(new Set(allRows.map((row) => row.action))).sort();
  const rows = allRows.filter((row) => {
    if (action && row.action !== action) return false;
    if (!q) return true;
    return [row.actor, row.action, row.entity_type, row.entity_id, JSON.stringify(row.payload || {})].join(" ").toLowerCase().includes(q);
  });
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(1, Number.parseInt(query.page || "1", 10) || 1), totalPages);
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <AppShell>
      <PageHeader eyebrow="Admin control" title="Audit Log" actions={<Link className="btn btn-secondary" href="/admin/access">Access and Reviews</Link>} />
      <ErrorNotice message={error?.message} />
      <section className="panel p-5">
        <form className="grid gap-3 md:grid-cols-[1fr_0.8fr_auto_auto]" method="get">
          <label className="field"><span className="label">Search</span><input className="input" name="q" defaultValue={query.q || ""} placeholder="Person, client, action, record ID..." /></label>
          <label className="field"><span className="label">Action</span><select className="input" name="action" defaultValue={action}><option value="">All actions</option>{actions.map((item) => <option key={item} value={item}>{auditActionLabel(item)}</option>)}</select></label>
          <button className="btn self-end" type="submit">Search</button>
          <Link className="btn btn-secondary self-end" href="/admin/audit">Clear</Link>
        </form>
        <div className="mt-5 table-wrap rounded-md border border-[#dce2dc]">
          <table className="data-table">
            <thead><tr><th>Date</th><th>Person</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
            <tbody>
              {pageRows.map((row) => {
                const details = auditDetails(row.action, row.payload);
                return (
                  <tr key={row.id}>
                    <td>{formatDate(row.created_at)}</td>
                    <td>{row.actor || "System"}</td>
                    <td className="font-semibold">{auditActionLabel(row.action)}</td>
                    <td>
                      <p>{auditEntityLabel(row.entity_type)}</p>
                      <details className="mt-1 text-xs text-[#68756f]">
                        <summary className="cursor-pointer">Record reference</summary>
                        <p className="mt-1 break-all">{row.entity_id || "Multiple records"}</p>
                      </details>
                    </td>
                    <td>
                      <dl className="grid min-w-64 gap-2 text-sm">
                        {details.map((detail, index) => (
                          <div key={`${detail.label}-${index}`}>
                            <dt className="text-xs font-bold uppercase text-[#68756f]">{detail.label}</dt>
                            <dd className={detail.tone === "danger" ? "font-semibold text-red-700" : detail.tone === "warning" ? "font-semibold text-amber-800" : detail.tone === "success" ? "font-semibold text-emerald-800" : ""}>{detail.value}</dd>
                          </div>
                        ))}
                      </dl>
                      <details className="mt-3 text-xs text-[#68756f]">
                        <summary className="cursor-pointer font-semibold">Technical details</summary>
                        <pre className="mt-2 max-h-36 max-w-xl overflow-auto whitespace-pre-wrap rounded-md bg-[#f5f7f4] p-2">{JSON.stringify(row.payload || {}, null, 2)}</pre>
                      </details>
                    </td>
                  </tr>
                );
              })}
              {!rows.length ? <tr><td colSpan={5}>No audit entries match these filters.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} pathname="/admin/audit" query={{ q: query.q, action: action || undefined }} />
        <p className="mt-3 text-sm text-[#68756f]">Showing {pageRows.length} of {rows.length} matching entries from the latest 250 changes.</p>
      </section>
    </AppShell>
  );
}
