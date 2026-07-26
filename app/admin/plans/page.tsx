import Link from "next/link";
import { AppShell, EmptyState, ErrorNotice, PageHeader } from "@/app/ui";
import { requireCurrentAccess } from "@/lib/cfp/access";
import { formatDate } from "@/lib/cfp/format";
import { createCfpServerClient, type CfpPlanDocument } from "@/lib/cfp/supabase";

export const dynamic = "force-dynamic";

type CustomerSummary = {
  id: string;
  full_name: string;
  email: string | null;
};

const completenessOrder: Record<CfpPlanDocument["completeness_status"], number> = {
  changes_requested: 0,
  not_checked: 1,
  complete: 2,
};

function completenessLabel(status: CfpPlanDocument["completeness_status"]) {
  if (status === "complete") return "Complete";
  if (status === "changes_requested") return "Follow-up needed";
  return "Needs check";
}

function completenessClass(status: CfpPlanDocument["completeness_status"]) {
  if (status === "complete") return "status status-success";
  if (status === "changes_requested") return "status status-danger";
  return "status status-warning";
}

export default async function PlanCompletenessPage() {
  const access = await requireCurrentAccess();
  if (!access.isAdmin) {
    return (
      <AppShell>
        <EmptyState title="Admin access required" body="Only admins can check administrative completeness across the agency." />
      </AppShell>
    );
  }

  const supabase = await createCfpServerClient();
  if (!supabase) {
    return (
      <AppShell>
        <ErrorNotice message="Supabase is not configured." />
      </AppShell>
    );
  }

  const { data: documentsData, error: documentsError } = await supabase
    .from("cfp_plan_documents")
    .select("*")
    .eq("status", "approved")
    .order("finalized_at", { ascending: false })
    .limit(100);

  const documents = ((documentsData || []) as CfpPlanDocument[]).sort((left, right) => {
    const statusDifference = completenessOrder[left.completeness_status] - completenessOrder[right.completeness_status];
    if (statusDifference !== 0) return statusDifference;
    return String(right.finalized_at || right.created_at).localeCompare(String(left.finalized_at || left.created_at));
  });

  const customerIds = Array.from(new Set(documents.map((document) => document.customer_id)));
  const customerResult = customerIds.length
    ? await supabase.from("customers").select("id,full_name,email").in("id", customerIds)
    : { data: [], error: null };
  const customers = new Map(
    ((customerResult.data || []) as CustomerSummary[]).map((customer) => [customer.id, customer]),
  );
  const pendingCount = documents.filter((document) => document.completeness_status !== "complete").length;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Admin control"
        title="Plan Completeness"
        actions={<Link className="btn btn-secondary" href="/admin/access">Access and Reviews</Link>}
      />
      <ErrorNotice message={documentsError?.message || customerResult.error?.message} />

      <section className="panel mb-5 p-5">
        <h2 className="text-xl font-bold">Administrative check only</h2>
        <p className="mt-2 max-w-4xl text-[#5f6d67]">
          Confirm that required records, disclosures, and process evidence are present. This check does not approve,
          endorse, or validate the adviser&apos;s recommendation. The assigned adviser remains responsible for the advice
          and for issuing the plan.
        </p>
        <p className="mt-3 font-semibold">{pendingCount} plan{pendingCount === 1 ? "" : "s"} need attention.</p>
      </section>

      {!documents.length ? (
        <EmptyState
          title="No issued plans yet"
          body="Plans will appear here after the assigned adviser completes the readiness checklist and issues them."
        />
      ) : (
        <section className="panel overflow-hidden">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Document</th>
                  <th>Adviser</th>
                  <th>Issued</th>
                  <th>Process status</th>
                  <th><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {documents.map((document) => {
                  const customer = customers.get(document.customer_id);
                  return (
                    <tr key={document.id}>
                      <td>
                        <p className="font-semibold">{customer?.full_name || "Customer"}</p>
                        <p className="text-sm text-[#68756f]">{customer?.email || "No email"}</p>
                      </td>
                      <td>
                        <p className="font-semibold">{document.title}</p>
                        <p className="text-sm text-[#68756f]">Version {document.version_number}</p>
                      </td>
                      <td>{document.finalized_by_name || document.created_by_name || "Adviser"}</td>
                      <td>{formatDate(document.finalized_at || document.created_at)}</td>
                      <td>
                        <span className={completenessClass(document.completeness_status)}>
                          {completenessLabel(document.completeness_status)}
                        </span>
                      </td>
                      <td>
                        <Link
                          className="btn btn-secondary"
                          href={`/customers/${document.customer_id}/plan?document=${document.id}`}
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </AppShell>
  );
}
