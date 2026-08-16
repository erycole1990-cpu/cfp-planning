import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createPlanDraft,
  finalizePlanDocument,
  recordPlanCompletenessCheck,
  regeneratePlanDraft,
  renamePlanDraft,
  withdrawPlanDocument,
} from "@/app/actions";
import { AppShell, EmptyState, PageHeader } from "@/app/ui";
import { canAccessCustomer, isPersonalCustomer, requireCurrentAccess } from "@/lib/cfp/access";
import { formatCurrency, formatDate } from "@/lib/cfp/format";
import {
  createCfpServerClient,
  type CfpPlanDocument,
  type Customer,
  type FinancialGoal,
  type FinancialStatementItem,
  type NextStepAction,
} from "@/lib/cfp/supabase";
import { PrintPlanButton } from "./print-button";

export const dynamic = "force-dynamic";

type PlanSnapshot = {
  generated_at?: string;
  customer?: Customer;
  goals?: FinancialGoal[];
  statements?: FinancialStatementItem[];
  next_actions?: NextStepAction[];
  reporting_period?: {
    as_of_date?: string;
    year?: number;
    month_index?: number;
    month?: string;
    time_zone?: string;
  };
  summary?: {
    total_assets?: number;
    total_liabilities?: number;
    net_worth?: number;
    monthly_income?: number;
    monthly_expenses?: number;
    monthly_surplus?: number;
  };
};

const statusClasses: Record<CfpPlanDocument["status"], string> = {
  draft: "border-slate-200 bg-slate-50 text-slate-700",
  in_review: "border-amber-200 bg-amber-50 text-amber-800",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  rejected: "border-red-200 bg-red-50 text-red-800",
  superseded: "border-slate-200 bg-slate-100 text-slate-600",
  withdrawn: "border-slate-200 bg-slate-100 text-slate-600",
};

function planStatus(status: CfpPlanDocument["status"]) {
  if (status === "approved") return "Issued";
  if (status === "in_review") return "Legacy review";
  if (status === "rejected") return "Changes requested";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function PlanStatusBadge({ status }: { status: CfpPlanDocument["status"] }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusClasses[status]}`}>{planStatus(status)}</span>;
}

function SummaryCell({ label, value, detail }: { label: string; value: number | undefined; detail?: string }) {
  return (
    <div className="border-b border-[#dce2dc] py-3 last:border-0">
      <p className="text-xs font-bold uppercase text-[#68756f]">{label}</p>
      {detail ? <p className="mt-1 text-xs font-semibold text-[#68756f]">{detail}</p> : null}
      <p className="mt-1 text-xl font-bold">{formatCurrency(value ?? 0)}</p>
    </div>
  );
}

export default async function CustomerPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ document?: string; notice?: string }>;
}) {
  const { id } = await params;
  const query: { document?: string; notice?: string } = searchParams ? await searchParams : {};
  const access = await requireCurrentAccess();
  const supabase = await createCfpServerClient();
  if (!supabase) notFound();

  const [{ data: customer }, { data: planRows, error: planError }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    supabase.from("cfp_plan_documents").select("*").eq("customer_id", id).order("version_number", { ascending: false }),
  ]);
  if (!customer || !canAccessCustomer(access, customer as Customer)) notFound();
  if (planError) throw new Error(planError.message);

  const plans = (planRows || []) as CfpPlanDocument[];
  const selected = plans.find((plan) => plan.id === query.document) || plans[0] || null;
  const snapshot = (selected?.snapshot || {}) as PlanSnapshot;
  const planCustomer = snapshot.customer || (customer as Customer);
  const goals = snapshot.goals || [];
  const statements = snapshot.statements || [];
  const nextActions = snapshot.next_actions || [];
  const summary = snapshot.summary || {};
  const reportingPeriod = snapshot.reporting_period;
  const reportingPeriodLabel = reportingPeriod?.month && reportingPeriod.year
    ? `${reportingPeriod.month} ${reportingPeriod.year}`
    : undefined;
  const personalPlan = isPersonalCustomer(access, customer as Customer);
  const isAssignedAdviser =
    access.isAgent &&
    !personalPlan &&
    (customer as Customer).assigned_agent_user_id === access.user.id;
  const canEditDraft =
    isAssignedAdviser &&
    Boolean(selected && ["draft", "rejected", "in_review"].includes(selected.status));
  const readiness = {
    goals: goals.length > 0,
    risk: Boolean(planCustomer.risk_profile),
    statements: statements.length > 0,
    actions: nextActions.length > 0,
  };

  const notice = query.notice === "created"
    ? "Draft created from the customer's current planning records."
    : query.notice === "renamed"
      ? "Draft title updated."
      : query.notice === "refreshed"
        ? "Draft refreshed from the customer's latest planning records."
        : query.notice === "withdrawn"
          ? "Draft withdrawn. Its history remains available."
          : query.notice === "issued"
            ? "Plan issued by the assigned adviser."
            : query.notice === "completeness"
              ? "Administrative completeness check recorded."
          : null;

  return (
    <AppShell>
      <PageHeader
        eyebrow="CFP plan documents"
        title={planCustomer.full_name}
        actions={
          <div className="no-print flex flex-wrap gap-2">
            {selected ? <PrintPlanButton /> : null}
            <Link className="btn btn-secondary" href={`/customers/${id}`}>Back to Customer</Link>
          </div>
        }
      />

      {notice ? <div className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{notice}</div> : null}

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="no-print space-y-4">
          {isAssignedAdviser ? (
            <form action={createPlanDraft} className="panel p-4">
              <input type="hidden" name="customer_id" value={id} />
              <label className="field">
                <span className="label">Document title</span>
                <input className="input" name="title" defaultValue={`${customer.full_name} CFP Plan`} required />
              </label>
              <button className="btn mt-3 w-full" type="submit">Create New Draft</button>
            </form>
          ) : null}

          <section className="panel p-4">
            <h2 className="font-bold">Versions</h2>
            <div className="mt-3 space-y-2">
              {plans.map((plan) => (
                <Link
                  className={`block rounded-md border p-3 ${selected?.id === plan.id ? "border-[#0f766e] bg-[#eef8f6]" : "border-[#dce2dc] bg-white"}`}
                  href={`/customers/${id}/plan?document=${plan.id}`}
                  key={plan.id}
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong>Version {plan.version_number}</strong>
                    <PlanStatusBadge status={plan.status} />
                  </div>
                  <p className="mt-2 text-xs text-[#68756f]">{formatDate(plan.created_at)}</p>
                </Link>
              ))}
              {!plans.length ? <p className="text-sm text-[#68756f]">No plan versions yet.</p> : null}
            </div>
          </section>
        </aside>

        <div>
          {!selected ? (
            <EmptyState title="No plan document yet" body="Create a draft to freeze the current customer profile, goals, statements, and next actions into a reviewable plan version." />
          ) : (
            <article className="space-y-5">
              <section className="panel p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold uppercase text-[#68756f]">Version {selected.version_number}</p>
                    <h2 className="mt-1 text-2xl font-bold">{selected.title}</h2>
                    <p className="mt-2 text-sm text-[#68756f]">Prepared by {selected.created_by_name} on {formatDate(selected.created_at)}</p>
                    {selected.status === "approved" ? (
                      <p className="mt-1 text-sm text-[#53625b]">
                        Issued by {selected.finalized_by_name || selected.created_by_name}
                        {selected.finalized_at ? ` | ${formatDate(selected.finalized_at)}` : ""}
                      </p>
                    ) : null}
                    <p className="mt-1 break-all text-xs text-[#68756f]">Document ID: {selected.id}</p>
                  </div>
                  <PlanStatusBadge status={selected.status} />
                </div>
              </section>

              {canEditDraft ? (
                <section className="no-print panel p-5">
                  <h2 className="text-xl font-bold">Draft controls</h2>
                  <p className="mt-1 text-sm text-[#68756f]">Correct the title, refresh this version from the latest planning records, or withdraw it without deleting its history.</p>
                  <form action={renamePlanDraft} className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <input type="hidden" name="customer_id" value={id} />
                    <input type="hidden" name="document_id" value={selected.id} />
                    <label className="field min-w-0 flex-1">
                      <span className="label">Document title</span>
                      <input className="input" name="title" defaultValue={selected.title} required />
                    </label>
                    <button className="btn self-end" type="submit">Rename</button>
                  </form>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <form action={regeneratePlanDraft}>
                      <input type="hidden" name="customer_id" value={id} />
                      <input type="hidden" name="document_id" value={selected.id} />
                      <button className="btn btn-secondary" type="submit">Refresh Draft</button>
                    </form>
                    <form action={withdrawPlanDocument}>
                      <input type="hidden" name="customer_id" value={id} />
                      <input type="hidden" name="document_id" value={selected.id} />
                      <button className="btn btn-danger" type="submit">Withdraw Draft</button>
                    </form>
                  </div>
                </section>
              ) : null}

              <section className="panel p-5">
                <h2 className="text-xl font-bold">Plan readiness</h2>
                <p className="mt-1 text-sm text-[#68756f]">Required items must be complete before the assigned adviser can issue this version.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className={`rounded-md border p-3 ${readiness.goals ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
                    <strong>{readiness.goals ? "Ready" : "Missing"}: Financial goals</strong>
                  </div>
                  <div className={`rounded-md border p-3 ${readiness.risk ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
                    <strong>{readiness.risk ? "Ready" : "Missing"}: Risk profile</strong>
                  </div>
                  <div className={`rounded-md border p-3 ${readiness.statements ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                    <strong>{readiness.statements ? "Included" : "Recommended"}: Financial statements</strong>
                  </div>
                  <div className={`rounded-md border p-3 ${readiness.actions ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                    <strong>{readiness.actions ? "Included" : "Recommended"}: Next-step actions</strong>
                  </div>
                </div>
              </section>

              <section className="grid gap-5 md:grid-cols-2">
                <div className="panel p-5">
                  <h2 className="text-xl font-bold">Client profile</h2>
                  <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 text-sm">
                    <div><dt className="label">Client</dt><dd className="mt-1 font-semibold">{planCustomer.full_name}</dd></div>
                    <div><dt className="label">Risk profile</dt><dd className="mt-1 font-semibold capitalize">{planCustomer.risk_profile || "Not set"}</dd></div>
                    <div><dt className="label">Email</dt><dd className="mt-1 break-all">{planCustomer.email || "Not set"}</dd></div>
                    <div><dt className="label">Phone</dt><dd className="mt-1">{planCustomer.phone || "Not set"}</dd></div>
                    <div className="col-span-2"><dt className="label">Adviser</dt><dd className="mt-1 font-semibold">{planCustomer.assigned_advisor_name || "Unassigned"}</dd></div>
                  </dl>
                </div>
                <div className="panel px-5 py-2">
                  <SummaryCell label="Net worth" value={summary.net_worth} />
                  <SummaryCell label="Monthly surplus" value={summary.monthly_surplus} detail={reportingPeriodLabel} />
                  <SummaryCell label="Assets / liabilities" value={summary.total_assets} />
                  <p className="pb-3 text-xs text-[#68756f]">Liabilities: {formatCurrency(summary.total_liabilities || 0)}</p>
                </div>
              </section>

              <section className="panel overflow-hidden">
                <div className="border-b border-[#dce2dc] p-5"><h2 className="text-xl font-bold">Financial goals</h2></div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Goal</th><th>Priority</th><th>Current</th><th>Target</th><th>Target date</th><th>Status</th></tr></thead>
                    <tbody>
                      {goals.map((goal) => <tr key={goal.id}><td><strong>{goal.goal_name}</strong><br /><span className="text-sm text-[#68756f]">{goal.goal_type}</span></td><td className="capitalize">{goal.priority}</td><td>{formatCurrency(goal.current_amount)}</td><td>{formatCurrency(goal.target_amount)}</td><td>{formatDate(goal.target_date)}</td><td className="capitalize">{String(goal.on_track_status || "unreviewed").replaceAll("_", " ")}</td></tr>)}
                      {!goals.length ? <tr><td colSpan={6}>No goals captured in this version.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="panel overflow-hidden">
                <div className="border-b border-[#dce2dc] p-5"><h2 className="text-xl font-bold">Financial position</h2></div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Statement</th><th>Type</th><th>Description</th><th>Amount</th><th>Date</th></tr></thead>
                    <tbody>
                      {statements.map((item) => <tr key={item.id}><td className="capitalize">{item.statement_type.replaceAll("_", " ")}</td><td className="capitalize">{item.item_type}</td><td><strong>{item.description}</strong><br /><span className="text-sm text-[#68756f]">{item.category || "Other"}</span></td><td>{formatCurrency(item.amount)}</td><td>{formatDate(item.statement_date)}</td></tr>)}
                      {!statements.length ? <tr><td colSpan={5}>No financial statement entries captured in this version.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="panel overflow-hidden">
                <div className="border-b border-[#dce2dc] p-5"><h2 className="text-xl font-bold">Recommended next steps</h2></div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Action</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead>
                    <tbody>
                      {nextActions.map((item) => <tr key={item.id}><td><strong>{item.action_title}</strong>{item.action_description ? <><br /><span className="text-sm text-[#68756f]">{item.action_description}</span></> : null}</td><td>{item.assigned_to || "Unassigned"}</td><td>{formatDate(item.due_date)}</td><td>{item.completed ? "Completed" : "Open"}</td></tr>)}
                      {!nextActions.length ? <tr><td colSpan={4}>No next-step actions captured in this version.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </section>

              {selected.review_notes || selected.reviewed_by_name ? (
                <section className="panel p-5">
                  <h2 className="text-xl font-bold">Historical review record</h2>
                  <p className="mt-1 text-sm text-[#68756f]">Preserved from the previous administrator-approval workflow for audit history.</p>
                  <p className="mt-3 text-sm"><strong>{selected.reviewed_by_name || "Reviewer"}</strong>{selected.reviewed_at ? ` · ${formatDate(selected.reviewed_at)}` : ""}</p>
                  <p className="mt-2 whitespace-pre-wrap text-[#53625b]">{selected.review_notes || "No review notes."}</p>
                </section>
              ) : null}

              {canEditDraft ? (
                <form action={finalizePlanDocument} className="no-print panel p-5">
                  <input type="hidden" name="customer_id" value={id} />
                  <input type="hidden" name="document_id" value={selected.id} />
                  <h2 className="text-xl font-bold">Adviser issuance</h2>
                  <p className="mt-1 text-sm text-[#68756f]">
                    The assigned adviser owns the recommendation and confirms the client discussion,
                    assumptions, consent, and professional responsibility before issue.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="flex items-start gap-3 rounded-md border border-[#dce2dc] p-3">
                      <input className="mt-1" name="client_discussion_confirmed" type="checkbox" value="confirmed" required />
                      <span>Client discussion completed</span>
                    </label>
                    <label className="flex items-start gap-3 rounded-md border border-[#dce2dc] p-3">
                      <input className="mt-1" name="assumptions_confirmed" type="checkbox" value="confirmed" required />
                      <span>Assumptions reviewed</span>
                    </label>
                    <label className="flex items-start gap-3 rounded-md border border-[#dce2dc] p-3">
                      <input className="mt-1" name="consent_confirmed" type="checkbox" value="confirmed" required />
                      <span>Client consent recorded</span>
                    </label>
                    <label className="flex items-start gap-3 rounded-md border border-[#dce2dc] p-3">
                      <input className="mt-1" name="adviser_attestation" type="checkbox" value="confirmed" required />
                      <span>I accept adviser responsibility</span>
                    </label>
                  </div>
                  <button className="btn mt-4" type="submit">Issue Plan</button>
                </form>
              ) : null}

              {access.isAdmin && selected.status === "approved" ? (
                <form action={recordPlanCompletenessCheck} className="no-print panel p-5">
                  <input type="hidden" name="customer_id" value={id} />
                  <input type="hidden" name="document_id" value={selected.id} />
                  <h2 className="text-xl font-bold">Administrative completeness</h2>
                  <p className="mt-1 text-sm text-[#68756f]">
                    This records whether required evidence is present. It does not approve, endorse,
                    or validate the adviser&apos;s financial advice.
                  </p>
                  <label className="field mt-4">
                    <span className="label">Process notes</span>
                    <textarea
                      className="input min-h-28"
                      name="completeness_notes"
                      defaultValue={selected.completeness_notes || ""}
                      placeholder="Missing evidence or administrative observations"
                    />
                  </label>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button className="btn" name="decision" value="complete" type="submit">Record Complete</button>
                    <button className="btn btn-secondary" name="decision" value="changes_requested" type="submit">Request Missing Evidence</button>
                  </div>
                </form>
              ) : null}

              <section className="panel p-5">
                <h2 className="text-xl font-bold">Document record</h2>
                <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  <div><dt className="label">Status</dt><dd className="mt-1 font-semibold">{planStatus(selected.status)}</dd></div>
                  <div><dt className="label">Issued by</dt><dd className="mt-1 font-semibold">{selected.finalized_by_name || "Not issued"}</dd></div>
                  <div><dt className="label">Issued date</dt><dd className="mt-1">{selected.finalized_at ? formatDate(selected.finalized_at) : "Not issued"}</dd></div>
                  <div>
                    <dt className="label">Process check</dt>
                    <dd className="mt-1 font-semibold">
                      {selected.completeness_status === "complete"
                        ? "Complete"
                        : selected.completeness_status === "changes_requested"
                          ? "Changes requested"
                          : "Not checked"}
                    </dd>
                  </div>
                  <div><dt className="label">Checked by</dt><dd className="mt-1">{selected.completeness_checked_by_name || "Not checked"}</dd></div>
                  <div><dt className="label">Checked date</dt><dd className="mt-1">{selected.completeness_checked_at ? formatDate(selected.completeness_checked_at) : "Not checked"}</dd></div>
                </dl>
                {selected.completeness_notes ? (
                  <p className="mt-4 whitespace-pre-wrap rounded-md border border-[#dce2dc] p-3 text-sm text-[#53625b]">{selected.completeness_notes}</p>
                ) : null}
                <p className="mt-4 rounded-md bg-[#f5f7f4] p-3 text-sm text-[#53625b]">
                  Plan advice remains the responsibility of the issuing adviser. Administrative
                  completeness does not constitute approval of suitability or recommendations.
                </p>
              </section>
            </article>
          )}
        </div>
      </div>
    </AppShell>
  );
}
