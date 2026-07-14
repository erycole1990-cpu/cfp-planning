import Link from "next/link";
import { AppShell, EmptyState, ErrorNotice, PageHeader } from "@/app/ui";
import { requireCurrentAccess } from "@/lib/cfp/access";
import { formatCurrency, formatDate } from "@/lib/cfp/format";
import { createCfpServerClient, type Customer, type PendingClientSubmission } from "@/lib/cfp/supabase";
import { acceptAdvisorRequest, declineAdvisorRequest, reviewPersonalSubmission } from "./actions";

export const dynamic = "force-dynamic";

function submissionLabel(type: string) {
  if (type === "goal_progress") return "Goal progress";
  if (type === "financial_statement_import") return "Statement import";
  if (type === "customer_profile_update") return "Profile update";
  if (type === "goal_create") return "New financial goal";
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
  if (submission.submission_type === "customer_profile_update") {
    return `${Object.keys(payload).length} profile field${Object.keys(payload).length === 1 ? "" : "s"} changed`;
  }
  if (submission.submission_type === "goal_create") {
    return `${String(payload.goal_name || "New goal")} - ${formatCurrency(Number(payload.target_amount) || 0)}`;
  }
  return `${String(payload.description || "Statement item")} - ${formatCurrency(Number(payload.amount) || 0)}`;
}

const profileFieldLabels: Record<string, string> = {
  full_name: "Full name",
  email: "Email",
  phone: "Phone",
  date_of_birth: "Date of birth",
  nric_passport: "NRIC / Passport",
  nationality: "Nationality",
  marital_status: "Marital status",
  number_of_dependents: "Dependents",
  residential_address: "Residential address",
  employment_status: "Employment status",
  occupation: "Occupation",
  employer_name: "Employer / Business",
  monthly_income_range: "Monthly income",
  source_of_funds: "Source of funds",
  source_of_wealth: "Source of wealth",
  risk_profile: "Risk profile",
  notes: "Notes",
};

function readableValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "Not set";
  return String(value);
}

function ProposalComparison({ submission, customer }: { submission: PendingClientSubmission; customer?: Customer }) {
  const payload = submission.payload || {};
  if (submission.submission_type === "customer_profile_update") {
    const current = (customer || {}) as unknown as Record<string, unknown>;
    return (
      <div className="mt-4 overflow-hidden rounded-md border border-[#dce2dc]">
        <div className="grid grid-cols-[minmax(8rem,0.7fr)_1fr_1fr] gap-3 bg-[#f5f7f4] px-4 py-3 text-xs font-bold uppercase text-[#68756f]">
          <span>Field</span><span>Current</span><span>Proposed</span>
        </div>
        {Object.entries(payload).map(([key, value]) => (
          <div className="grid grid-cols-[minmax(8rem,0.7fr)_1fr_1fr] gap-3 border-t border-[#dce2dc] px-4 py-3 text-sm" key={key}>
            <span className="font-bold">{profileFieldLabels[key] || key}</span>
            <span className="whitespace-pre-wrap text-[#68756f]">{readableValue(current[key])}</span>
            <span className="whitespace-pre-wrap font-semibold text-[#115e59]">{readableValue(value)}</span>
          </div>
        ))}
      </div>
    );
  }
  if (submission.submission_type === "goal_create") {
    const rows = [
      ["Goal", payload.goal_name],
      ["Type", payload.goal_type],
      ["Target amount", formatCurrency(Number(payload.target_amount) || 0)],
      ["Current amount", formatCurrency(Number(payload.current_amount) || 0)],
      ["Target date", formatDate(String(payload.target_date || ""))],
      ["Priority", payload.priority],
    ];
    return (
      <dl className="mt-4 grid gap-3 rounded-md border border-[#dce2dc] bg-[#f7f8f5] p-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([label, value]) => <div key={String(label)}><dt className="label">{String(label)}</dt><dd className="mt-1 font-semibold">{readableValue(value)}</dd></div>)}
      </dl>
    );
  }
  return null;
}

type AdvisorRequest = {
  customer_id: string;
  full_name: string;
  email: string | null;
  created_at: string;
};

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ saved?: string; referral?: string }> }) {
  const access = await requireCurrentAccess();
  const params = await searchParams;
  if (!access.isAdmin && !access.isAgent) {
    return <AppShell><EmptyState title="Advisor access required" body="Personal updates are reviewed by the assigned advisor or an admin." /></AppShell>;
  }

  const supabase = await createCfpServerClient();
  if (!supabase) return <AppShell><EmptyState title="Database unavailable" body="This deployment is not connected to the planning database." /></AppShell>;

  let advisorRequests: AdvisorRequest[] = [];
  let intakeCustomers: Customer[] = [];
  let referralError: string | undefined;
  if (access.isAgent) {
    const result = await supabase.rpc("cfp_list_advisor_requests");
    advisorRequests = (result.data || []) as AdvisorRequest[];
    referralError = result.error?.message;
  } else if (access.isAdmin) {
    const result = await supabase
      .from("customers")
      .select("*")
      .eq("advisor_request_status", "unassigned")
      .is("assigned_agent_user_id", null)
      .order("created_at", { ascending: true });
    intakeCustomers = (result.data || []) as Customer[];
    referralError = result.error?.message;
  }

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
  const independentlyReviewableSubmissions = submissions.filter(
    (submission) => submission.submitted_by_user_id !== access.user.id,
  );
  const visibleSubmissions = access.isAdmin
    ? independentlyReviewableSubmissions
    : independentlyReviewableSubmissions.filter((submission) => {
        const customer = customers.get(submission.customer_id);
        return customer?.assigned_agent_user_id === access.user.id;
      });

  return (
    <AppShell>
      <PageHeader
        eyebrow="Independent review"
        title="Personal Plan Reviews"
        actions={<Link className="btn btn-secondary" href="/">Dashboard</Link>}
      />
      <ErrorNotice message={error?.message} />
      <ErrorNotice message={referralError} />
      {params.saved ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          The personal update was {params.saved}.
        </div>
      ) : null}
      {params.referral ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          The adviser referral was {params.referral}.
        </div>
      ) : null}
      {access.isAgent && advisorRequests.length ? (
        <section className="panel mb-6 p-5">
          <div className="mb-4">
            <p className="label">Client intake</p>
            <h2 className="text-xl font-bold">Referral requests</h2>
            <p className="mt-1 text-sm text-[#68756f]">Accept only clients you can independently advise. Declined requests return to admin intake.</p>
          </div>
          <div className="grid gap-4">
            {advisorRequests.map((request) => (
              <article className="rounded-md border border-[#dce2dc] p-4" key={request.customer_id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{request.full_name}</h3>
                    <p className="text-sm text-[#68756f]">{request.email || "Email not provided"}</p>
                    <p className="mt-1 text-xs text-[#68756f]">Requested {formatDate(request.created_at)}</p>
                  </div>
                  <form action={acceptAdvisorRequest}>
                    <input type="hidden" name="customer_id" value={request.customer_id} />
                    <button className="btn" type="submit">Accept Client</button>
                  </form>
                </div>
                <form action={declineAdvisorRequest} className="mt-3 flex flex-wrap gap-2">
                  <input type="hidden" name="customer_id" value={request.customer_id} />
                  <input className="input min-w-56 flex-1" name="decline_reason" placeholder="Reason for returning to admin" required />
                  <button className="btn btn-secondary" type="submit">Decline</button>
                </form>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {access.isAdmin && intakeCustomers.length ? (
        <section className="panel mb-6 p-5">
          <p className="label">Admin intake</p>
          <h2 className="text-xl font-bold">Unassigned personal plans</h2>
          <p className="mt-1 text-sm text-[#68756f]">These clients did not enter a valid adviser code or their requested adviser declined.</p>
          <div className="mt-4 grid gap-3">
            {intakeCustomers.map((customer) => (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#dce2dc] p-4" key={customer.id}>
                <div><p className="font-bold">{customer.full_name}</p><p className="text-sm text-[#68756f]">{customer.email || "Email not provided"}</p></div>
                <Link className="btn btn-secondary" href="/admin/access">Assign Adviser</Link>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {!error && visibleSubmissions.length === 0 ? (
        <EmptyState title="No updates waiting" body="Submitted personal plan changes will appear here for independent review." />
      ) : (
        <div className="grid gap-4">
          {visibleSubmissions.map((submission) => {
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
                <ProposalComparison submission={submission} customer={customer} />
                <form action={reviewPersonalSubmission} className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
                  <input type="hidden" name="submission_id" value={submission.id} />
                  <input className="input" name="review_notes" placeholder="Review note (required when rejecting)" />
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
