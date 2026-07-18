import Link from "next/link";
import { AppShell, EmptyState, ErrorNotice, PageHeader, Pagination } from "@/app/ui";
import { accessDisplayName, requireCurrentAccess } from "@/lib/cfp/access";
import { formatDate } from "@/lib/cfp/format";
import { privacyRequestLabels } from "@/lib/cfp/privacy";
import { createCfpServerClient, type Customer } from "@/lib/cfp/supabase";
import { updateCustomerRetention, updatePrivacyRequest } from "./actions";

export const dynamic = "force-dynamic";

type RequestRow = {
  id: string; user_id: string; request_type: string; details: string | null;
  status: string; admin_notes: string | null; reviewed_by: string | null;
  reviewed_at: string | null; created_at: string;
};
type Profile = { id: string; email: string; full_name: string | null };

export default async function AdminPrivacyPage({ searchParams }: { searchParams?: Promise<{ page?: string; saved?: string; error?: string }> }) {
  const access = await requireCurrentAccess();
  const query = (await searchParams) || {};
  if (!access.isAdmin) return <AppShell><EmptyState title="Admin access required" body="Only admins can manage privacy requests and retention controls." /></AppShell>;
  const supabase = await createCfpServerClient();
  if (!supabase) return <AppShell><ErrorNotice message="Supabase is not configured." /></AppShell>;

  const [requestsResult, profilesResult, customersResult] = await Promise.all([
    supabase.from("privacy_requests").select("*").order("created_at", { ascending: false }),
    supabase.from("user_profiles").select("id,email,full_name"),
    supabase.from("customers").select("*").or("service_status.eq.inactive,service_ended_at.not.is.null").order("retention_review_at", { ascending: true }),
  ]);
  const requests = (requestsResult.data || []) as RequestRow[];
  const profiles = (profilesResult.data || []) as Profile[];
  const customers = (customersResult.data || []) as Customer[];
  const names = new Map(profiles.map((profile) => [profile.id, profile.full_name || profile.email]));
  const pageSize = 15;
  const page = Math.max(1, Number(query.page) || 1);
  const pageRequests = requests.slice((page - 1) * pageSize, page * pageSize);
  const error = requestsResult.error?.message || profilesResult.error?.message || customersResult.error?.message || query.error;

  return <AppShell>
    <PageHeader eyebrow="Admin control" title="Privacy and Retention" actions={<Link className="btn btn-secondary" href="/admin/access">Access and Reviews</Link>} />
    <ErrorNotice message={error} />
    {query.saved ? <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{query.saved === "retention" ? "Retention control saved." : "Privacy request updated."}</div> : null}

    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">Privacy requests</h2><p className="mt-1 text-sm text-[#68756f]">Track each access, correction, deletion, or consent-withdrawal request to a recorded decision.</p></div><span className="rounded-full border border-[#dce2dc] bg-[#f5f7f4] px-3 py-1 text-sm font-bold">{requests.filter((item) => !["completed", "rejected"].includes(item.status)).length} open</span></div>
      <div className="mt-4 grid gap-3">
        {pageRequests.map((request) => <article className="rounded-md border border-[#dce2dc] p-4" key={request.id}>
          <div className="flex flex-wrap justify-between gap-3"><div><p className="font-bold">{privacyRequestLabels[request.request_type] || request.request_type}</p><p className="text-sm text-[#68756f]">{names.get(request.user_id) || "Signed-in user"} - submitted {formatDate(request.created_at)}</p></div><span className="capitalize">{request.status.replaceAll("_", " ")}</span></div>
          {request.details ? <p className="mt-3 whitespace-pre-wrap text-sm">{request.details}</p> : null}
          <form action={updatePrivacyRequest} className="mt-4 grid gap-3 md:grid-cols-[0.6fr_1fr_auto]">
            <input type="hidden" name="request_id" value={request.id} />
            <select className="input" name="status" defaultValue={request.status}><option value="submitted">Submitted</option><option value="in_review">In review</option><option value="completed">Completed</option><option value="rejected">Rejected</option></select>
            <input className="input" name="admin_notes" defaultValue={request.admin_notes || ""} placeholder="Outcome or next action" />
            <button className="btn" type="submit">Save</button>
          </form>
          {request.reviewed_at ? <p className="mt-2 text-xs text-[#68756f]">Last reviewed by {request.reviewed_by ? names.get(request.reviewed_by) || "Admin" : accessDisplayName(access)} on {formatDate(request.reviewed_at)}</p> : null}
        </article>)}
        {!pageRequests.length ? <p className="text-sm text-[#68756f]">No privacy requests have been submitted.</p> : null}
      </div>
      <Pagination
        page={page}
        totalPages={Math.max(1, Math.ceil(requests.length / pageSize))}
        pathname="/admin/privacy"
      />
    </section>

    <section className="panel mt-6 p-5">
      <h2 className="text-xl font-bold">Retention review</h2><p className="mt-1 text-sm text-[#68756f]">Review ended-service records at the scheduled date. Legal hold prevents deletion while a dispute or regulatory matter is active.</p>
      <div className="mt-4 table-wrap rounded-md border border-[#dce2dc]"><table className="data-table"><thead><tr><th>Customer</th><th>Service ended</th><th>Review date</th><th>Legal hold</th><th></th></tr></thead><tbody>
        {customers.map((customer) => <tr key={customer.id}><td><p className="font-bold">{customer.full_name}</p><p className="text-sm text-[#68756f]">{customer.email || "No email"}</p></td><td>{customer.service_ended_at ? formatDate(customer.service_ended_at) : "Not recorded"}</td><td><input className="input" form={`retention-${customer.id}`} type="date" name="retention_review_at" defaultValue={customer.retention_review_at?.slice(0, 10) || ""} /></td><td><label className="flex items-center gap-2"><input form={`retention-${customer.id}`} type="checkbox" name="legal_hold" defaultChecked={customer.legal_hold} /> Hold</label></td><td><form id={`retention-${customer.id}`} action={updateCustomerRetention}><input type="hidden" name="customer_id" value={customer.id} /><button className="btn btn-secondary" type="submit">Save</button></form></td></tr>)}
        {!customers.length ? <tr><td colSpan={5}>No ended-service records require retention review.</td></tr> : null}
      </tbody></table></div>
    </section>
  </AppShell>;
}
