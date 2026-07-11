import Link from "next/link";
import { AppShell, EmptyState, ErrorNotice, PageHeader } from "@/app/ui";
import { requireCurrentAccess } from "@/lib/cfp/access";
import { createCfpServerClient } from "@/lib/cfp/supabase";
import { formatDate } from "@/lib/cfp/format";
import { reassignCustomer, reviewClientSubmission, updateUserAccess } from "../actions";

export const dynamic = "force-dynamic";

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
};

type CustomerRow = {
  id: string;
  full_name: string;
  email: string | null;
  assigned_agent_user_id: string | null;
  assigned_advisor_name: string | null;
};

type SubmissionRow = {
  id: string;
  created_at: string;
  customer_id: string;
  submission_type: string;
  payload: Record<string, unknown>;
  customer?: { full_name: string } | null;
  submitted_by?: { email: string } | null;
};

export default async function AdminAccessPage({
  searchParams,
}: {
  searchParams?: Promise<{ saved?: string }>;
}) {
  const access = await requireCurrentAccess();
  const query = (await searchParams) ?? {};
  const supabase = await createCfpServerClient();

  if (!access.isAdmin) {
    return (
      <AppShell>
        <EmptyState title="Admin access required" body="Only admins can manage users, assignments, and client submissions." />
      </AppShell>
    );
  }

  if (!supabase) {
    return (
      <AppShell>
        <ErrorNotice message="Supabase is not configured." />
      </AppShell>
    );
  }

  const [profilesResult, customersResult, submissionsResult] = await Promise.all([
    supabase.from("user_profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("customers").select("id, full_name, email, assigned_agent_user_id, assigned_advisor_name").order("full_name"),
    supabase
      .from("pending_client_submissions")
      .select("*, customer:customers(full_name)")
      .eq("review_status", "pending")
      .order("created_at", { ascending: true }),
  ]);

  const profiles = (profilesResult.data ?? []) as Profile[];
  const agents = profiles.filter((profile) => profile.role === "agent" && profile.status === "active");
  const customers = (customersResult.data ?? []) as CustomerRow[];
  const submissions = (submissionsResult.data ?? []) as SubmissionRow[];
  const error = profilesResult.error?.message || customersResult.error?.message || submissionsResult.error?.message;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Admin control"
        title="Access and Reviews"
        actions={
          <Link className="btn btn-secondary" href="/">
            Dashboard
          </Link>
        }
      />
      <ErrorNotice message={error} />
      {query.saved ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          Admin change saved.
        </div>
      ) : null}

      <div className="grid gap-6">
        <section className="panel p-5">
          <h2 className="text-xl font-bold">Users</h2>
          <p className="mt-1 text-sm text-[#68756f]">Approve pending logins and decide whether each user is admin, agent, or client.</p>
          <div className="mt-4 table-wrap rounded-md border border-[#dce2dc]">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => (
                  <tr key={profile.id}>
                    <td>{profile.email}</td>
                    <td>
                      <form id={`user-${profile.id}`} action={updateUserAccess}>
                        <input type="hidden" name="user_id" value={profile.id} />
                        <input className="input" name="full_name" defaultValue={profile.full_name || ""} />
                      </form>
                    </td>
                    <td>
                      <select className="input" name="role" form={`user-${profile.id}`} defaultValue={profile.role}>
                        <option value="admin">Admin</option>
                        <option value="agent">Agent</option>
                        <option value="client">Client</option>
                      </select>
                    </td>
                    <td>
                      <select className="input" name="status" form={`user-${profile.id}`} defaultValue={profile.status}>
                        <option value="active">Active</option>
                        <option value="pending">Pending</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </td>
                    <td>
                      <button className="btn btn-secondary" type="submit" form={`user-${profile.id}`}>
                        Save
                      </button>
                    </td>
                  </tr>
                ))}
                {!profiles.length ? (
                  <tr>
                    <td colSpan={5} className="text-sm text-[#68756f]">
                      No users yet. Users appear here after first login.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="text-xl font-bold">Client ownership</h2>
          <p className="mt-1 text-sm text-[#68756f]">Each client should have one assigned agent. Reassignment requires a reason for audit history.</p>
          <div className="mt-4 table-wrap rounded-md border border-[#dce2dc]">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Assigned agent</th>
                  <th>Reason</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <Link className="font-bold text-[#0f766e]" href={`/customers/${customer.id}`}>
                        {customer.full_name}
                      </Link>
                      <p className="mt-1 text-sm text-[#68756f]">{customer.email || "No email"}</p>
                    </td>
                    <td>
                      <form id={`assign-${customer.id}`} action={reassignCustomer}>
                        <input type="hidden" name="customer_id" value={customer.id} />
                        <select className="input" name="assigned_agent_user_id" defaultValue={customer.assigned_agent_user_id || ""}>
                          <option value="">Unassigned</option>
                          {agents.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                              {agent.full_name || agent.email}
                            </option>
                          ))}
                        </select>
                      </form>
                      <p className="mt-1 text-sm text-[#68756f]">Current: {customer.assigned_advisor_name || "Unassigned"}</p>
                    </td>
                    <td>
                      <input className="input" name="reason" form={`assign-${customer.id}`} required placeholder="Capacity, client preference, resignation..." />
                    </td>
                    <td>
                      <button className="btn btn-secondary" type="submit" form={`assign-${customer.id}`}>
                        Reassign
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="text-xl font-bold">Pending client submissions</h2>
          <p className="mt-1 text-sm text-[#68756f]">Client financial updates stay here until admin/advisor review.</p>
          <div className="mt-4 space-y-3">
            {submissions.map((submission) => (
              <div key={submission.id} className="rounded-md border border-[#dce2dc] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{submission.customer?.full_name || "Customer"}</p>
                    <p className="text-sm text-[#68756f]">
                      {submission.submission_type} · client submitted · {formatDate(submission.created_at)}
                    </p>
                    <pre className="mt-3 max-h-48 overflow-auto rounded-md bg-[#f5f7f4] p-3 text-xs">
                      {JSON.stringify(submission.payload, null, 2)}
                    </pre>
                  </div>
                  <form action={reviewClientSubmission} className="grid min-w-64 gap-2">
                    <input type="hidden" name="submission_id" value={submission.id} />
                    <textarea className="input min-h-20" name="review_notes" placeholder="Review notes" />
                    <button className="btn" name="decision" value="approved" type="submit">
                      Approve
                    </button>
                    <button className="btn btn-secondary" name="decision" value="rejected" type="submit">
                      Reject
                    </button>
                  </form>
                </div>
              </div>
            ))}
            {!submissions.length ? <p className="text-sm text-[#68756f]">No pending client submissions.</p> : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
