import Link from "next/link";
import { AppShell, EmptyState, ErrorNotice, PageHeader } from "@/app/ui";
import { requireCurrentAccess } from "@/lib/cfp/access";
import { formatCurrency, formatDate } from "@/lib/cfp/format";
import { createCfpServerClient, type Customer, type PendingClientSubmission } from "@/lib/cfp/supabase";
import { reviewPersonalSubmission } from "./actions";

export const dynamic = "force-dynamic";

function submissionLabel(type: string) {
  if (type === "goal_progress") return "Goal progress";
  if (type === "financial_statement_import") return "Statement import";
  return "Financial statement item";
}

function submissionSummary(submission: PendingClientSubmission) {
  const payload = submission.payload || {};
  if (submission.submission_type === "goal_progress") {
    return `Proposed value ${formatCurrency(Number(payload.logged_amount) || 0)}${payload.notes ? `; ${String(payload.notes)}` : ""}`;
  }
  if (submission.submission_type === "financial_statement_import") {
    return `${Array.isArray(payload.rows) ? payload.rows.length : 0} imported rows`;
  }
  return `${String(payload.description || "Statement item")} - ${formatCurrency(Number(payload.amount) || 0)}`;
}

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const access = await requireCurrentAccess();
  const params = await searchParams;
  if (!access.isAdmin && !access.isAgent) {
    return <AppShell><EmptyState title="Advisor access required" body="Personal updates are reviewed by the assigned advisor or an admin." /></AppShell>;
  }

  const supabase = await createCfpServerClient();
  if (!supabase) return <AppShell><EmptyState title="Database unavailable" body="This deployment is not connected to the planning database." /></AppShell>;

  const { data, error } = await supabase
    .from("pending_client_submissions")
    .select("*")
    .eq("review_status", "pending")
    .order("created_at", { ascending: true });
  const submissions = (data || []) as PendingClientSubmission[];
  const customerIds = [...new Set(submissions.map((submission) => submission.customer_id))];
  const { data: customerRows } = customerIds.length
    ? await supabase.from("customers").select("*").in("id", customerIds)
    : { data: [] };
  const customers = new Map(((customerRows || []) as Customer[]).map((customer) => [customer.id, customer]));

  return (
    <AppShell>
      <PageHeader
        eyebrow="Independent review"
        title="Personal Plan Reviews"
        actions={<Link className="btn btn-secondary" href="/">Dashboard</Link>}
      />
      <ErrorNotice message={error?.message} />
      {params.saved ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          The personal update was {params.saved}.
        </div>
      ) : null}
      {!error && submissions.length === 0 ? (
        <EmptyState title="No updates waiting" body="Submitted personal plan changes will appear here for independent review." />
      ) : (
        <div className="grid gap-4">
          {submissions.map((submission) => {
            const customer = customers.get(submission.customer_id);
            return (
              <article className="panel p-5" key={submission.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="label">{submissionLabel(submission.submission_type)}</p>
                    <h2 className="text-xl font-bold">{customer?.full_name || "Personal plan"}</h2>
                    <p className="mt-1 text-sm text-[#68756f]">Submitted {formatDate(submission.created_at)}</p>
                    <p className="mt-3 font-semibold">{submissionSummary(submission)}</p>
                  </div>
                </div>
                <form action={reviewPersonalSubmission} className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
                  <input type="hidden" name="submission_id" value={submission.id} />
                  <input className="input" name="review_notes" placeholder="Review note or reason" />
                  <button className="btn" type="submit" name="decision" value="approved">Approve</button>
                  <button className="btn btn-secondary" type="submit" name="decision" value="rejected">Reject</button>
                </form>
              </article>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
