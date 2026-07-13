import Link from "next/link";
import { AppShell, EmptyState, ErrorNotice, PageHeader } from "@/app/ui";
import { requireCurrentAccess } from "@/lib/cfp/access";
import { createCfpServerClient } from "@/lib/cfp/supabase";
import { formatDate } from "@/lib/cfp/format";
import { assignmentEmailDetail } from "@/lib/cfp/audit";
import { reassignCustomer, resendCustomerAssignmentEmail, reviewClientSubmission, syncAuthUserProfile, transferAgentPortfolio, updateUserAccess } from "../actions";

export const dynamic = "force-dynamic";

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  phone: string | null;
  job_title: string | null;
  agency_name: string | null;
  license_no: string | null;
  branch_name: string | null;
};

type CustomerRow = {
  id: string;
  full_name: string;
  email: string | null;
  assigned_agent_user_id: string | null;
  assigned_advisor_name: string | null;
  service_status: string | null;
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

type AssignmentLogRow = {
  id: string;
  created_at: string;
  actor: string | null;
  entity_id: string | null;
  payload: {
    customer_name?: string | null;
    previous_advisor_name?: string | null;
    assigned_advisor_name?: string | null;
    agent_email?: string | null;
    reason?: string | null;
    email_notification?: {
      status?: string;
      message?: string;
    } | null;
  } | null;
};

export default async function AdminAccessPage({
  searchParams,
}: {
  searchParams?: Promise<{ saved?: string; email?: string; error?: string; count?: string }>;
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

  const [profilesResult, customersResult, submissionsResult, assignmentLogsResult] = await Promise.all([
    supabase.from("user_profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("customers").select("id, full_name, email, service_status, assigned_agent_user_id, assigned_advisor_name").order("full_name"),
    supabase
      .from("pending_client_submissions")
      .select("*, customer:customers(full_name)")
      .eq("review_status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("audit_logs")
      .select("id, created_at, actor, entity_id, payload")
      .eq("action", "customer_reassigned")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const mfaResult = await supabase.auth.mfa.listFactors();
  const adminMfaActive = (mfaResult.data?.totp || []).some((factor) => factor.status === "verified");

  const profiles = (profilesResult.data ?? []) as Profile[];
  const agents = profiles.filter((profile) => profile.role === "agent" && profile.status === "active");
  const pendingAgents = profiles.filter((profile) => profile.role === "agent" && profile.status === "pending");
  const customers = (customersResult.data ?? []) as CustomerRow[];
  const submissions = (submissionsResult.data ?? []) as SubmissionRow[];
  const assignmentLogs = (assignmentLogsResult.data ?? []) as AssignmentLogRow[];
  const clientCountByAgent = new Map<string, number>();
  const profileNameByEmail = new Map(profiles.map((profile) => [profile.email.toLowerCase(), profile.full_name]));
  for (const customer of customers) {
    if (customer.assigned_agent_user_id) clientCountByAgent.set(customer.assigned_agent_user_id, (clientCountByAgent.get(customer.assigned_agent_user_id) || 0) + 1);
  }
  const error =
    profilesResult.error?.message || customersResult.error?.message || submissionsResult.error?.message || assignmentLogsResult.error?.message;
  const savedMessage =
    query.saved === "reassigned"
      ? query.email === "sent"
        ? "Client reassigned successfully and the agent email was sent."
        : query.email === "not_configured"
          ? "Client reassigned successfully. Email notifications are not configured yet, so no email was sent."
          : query.email === "failed"
            ? "Client reassigned successfully. The email notification failed, but the assignment history was saved."
            : "Client reassigned successfully."
      : query.saved === "user"
        ? "User access saved."
        : query.saved === "assignment-unchanged"
          ? "No assignment changed because this client already belongs to the selected agent."
          : query.saved === "portfolio-transferred"
            ? `${query.count || "0"} client portfolio(s) transferred successfully.`
            : query.saved === "no-clients"
              ? "This agent has no active clients to transfer."
        : query.saved === "synced"
          ? "Login profile synced."
          : query.saved === "notice-resent"
            ? query.email === "sent"
              ? "Assignment notice sent to the agent."
              : query.email === "failed"
                ? "The notice could not be sent. Open the Audit Log for the plain-language reason."
                : "The notice was recorded, but email delivery is not configured."
          : query.saved === "submission"
            ? "Client submission reviewed."
            : query.saved
              ? "Admin change saved."
              : null;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Admin control"
        title="Access and Reviews"
        actions={
          <div className="flex gap-2">
            <Link className="btn btn-secondary" href="/admin/audit">Audit Log</Link>
            <Link className="btn btn-secondary" href="/admin/operations">Operations</Link>
            <Link className="btn btn-secondary" href="/">Dashboard</Link>
          </div>
        }
      />
      <ErrorNotice message={error} />
      <ErrorNotice message={query.error} />
      {savedMessage ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
          {savedMessage}
        </div>
      ) : null}
      {!adminMfaActive ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          <span>Admin multi-factor authentication is not active yet. Set it up before storing real client data.</span>
          <Link className="btn btn-secondary" href="/profile">Set Up MFA</Link>
        </div>
      ) : null}

      <div className="grid gap-6">
        <section className="panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Agent access requests</h2>
              <p className="mt-1 text-sm text-[#68756f]">
                New agents appear here first. Approve only after you confirm they should service clients under your team.
              </p>
            </div>
            <span className="rounded-full border border-[#dce2dc] bg-[#f5f7f4] px-3 py-1 text-sm font-bold">
              {pendingAgents.length} pending
            </span>
          </div>
          <div className="mt-4 grid gap-3">
            {pendingAgents.map((profile) => (
              <div key={profile.id} className="rounded-md border border-[#dce2dc] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold">{profile.full_name || profile.email}</p>
                    <p className="text-sm text-[#68756f]">{profile.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form action={updateUserAccess}>
                      <input type="hidden" name="user_id" value={profile.id} />
                      <input type="hidden" name="full_name" value={profile.full_name || profile.email} />
                      <input type="hidden" name="role" value="agent" />
                      <input type="hidden" name="status" value="active" />
                      <button className="btn" type="submit">
                        Approve Agent
                      </button>
                    </form>
                    <form action={updateUserAccess}>
                      <input type="hidden" name="user_id" value={profile.id} />
                      <input type="hidden" name="full_name" value={profile.full_name || profile.email} />
                      <input type="hidden" name="role" value="agent" />
                      <input type="hidden" name="status" value="inactive" />
                      <button className="btn btn-secondary" type="submit">
                        Reject
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
            {!pendingAgents.length ? <p className="text-sm text-[#68756f]">No pending agent requests.</p> : null}
          </div>

          <form action={syncAuthUserProfile} className="mt-5 grid gap-3 rounded-md border border-[#dce2dc] p-4">
            <div>
              <h3 className="font-bold">Recover missing login</h3>
              <p className="mt-1 text-sm text-[#68756f]">
                Use this when an agent can sign in but does not appear above. The email must already exist in Supabase Auth.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-[1.3fr_1fr_0.8fr_0.8fr_auto]">
              <label className="field">
                <span className="label">Email</span>
                <input className="input" name="email" type="email" required placeholder="agent@example.com" />
              </label>
              <label className="field">
                <span className="label">Name</span>
                <input className="input" name="full_name" placeholder="Optional" />
              </label>
              <label className="field">
                <span className="label">Role</span>
                <select className="input" name="role" defaultValue="agent">
                  <option value="agent">Agent</option>
                  <option value="client">Client</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label className="field">
                <span className="label">Status</span>
                <select className="input" name="status" defaultValue="pending">
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              <button className="btn self-end" type="submit">
                Sync
              </button>
            </div>
          </form>
        </section>

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
                      <p className="mt-1 text-xs text-[#68756f]">
                        {[profile.job_title, profile.agency_name, profile.branch_name].filter(Boolean).join(" | ") || "Professional profile not completed"}
                      </p>
                      {profile.license_no ? <p className="mt-1 text-xs text-[#68756f]">Licence: {profile.license_no}</p> : null}
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
                  <th>Service status</th>
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
                        <select className="input" name="assigned_agent_user_id" required defaultValue={customer.assigned_agent_user_id || ""}>
                          <option value="" disabled>Choose active agent</option>
                          {agents.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                              {agent.full_name || "Advisor"}
                            </option>
                          ))}
                        </select>
                      </form>
                      <p className="mt-1 text-sm text-[#68756f]">Current: {customer.assigned_advisor_name || "Unassigned"}</p>
                    </td>
                    <td className="capitalize">{String(customer.service_status || "active").replaceAll("_", " ")}</td>
                    <td>
                      <input className="input" name="reason" form={`assign-${customer.id}`} required placeholder="Capacity, client preference, resignation..." />
                    </td>
                    <td>
                      <div className="grid gap-2">
                        <button className="btn btn-secondary" type="submit" form={`assign-${customer.id}`}>Reassign</button>
                        {customer.assigned_agent_user_id ? (
                          <form action={resendCustomerAssignmentEmail}>
                            <input type="hidden" name="customer_id" value={customer.id} />
                            <button className="btn btn-secondary w-full" type="submit">Resend Notice</button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 rounded-md border border-[#dce2dc] p-4">
            <h3 className="text-lg font-bold">Agent departure and portfolio transfer</h3>
            <p className="mt-1 text-sm text-[#68756f]">Transfer all active clients before making an agent inactive. The receiving agent gets one summary email and every client change is audited.</p>
            <form action={transferAgentPortfolio} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1.4fr_auto]">
              <label className="field"><span className="label">From agent</span><select className="input" name="source_agent_user_id" required defaultValue=""><option value="" disabled>Choose current agent</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name || "Advisor"} ({clientCountByAgent.get(agent.id) || 0} clients)</option>)}</select></label>
              <label className="field"><span className="label">To agent</span><select className="input" name="target_agent_user_id" required defaultValue=""><option value="" disabled>Choose receiving agent</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name || "Advisor"}</option>)}</select></label>
              <label className="field"><span className="label">Reason</span><input className="input" name="reason" required placeholder="Resignation, capacity, client preference..." /></label>
              <button className="btn self-end" type="submit">Transfer Portfolio</button>
            </form>
          </div>

          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">Latest assignment changes</h3>
                <p className="mt-1 text-sm text-[#68756f]">
                  The latest five ownership changes are shown here. The complete audit history is retained for accountability.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-[#dce2dc] bg-[#f5f7f4] px-3 py-1 text-sm font-bold">
                  {assignmentLogs.length} latest
                </span>
                <Link className="btn btn-secondary" href="/admin/audit?action=customer_reassigned">
                  View Full History
                </Link>
              </div>
            </div>
            <div className="mt-3 table-wrap rounded-md border border-[#dce2dc]">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Client</th>
                    <th>From / To</th>
                    <th>Reason</th>
                    <th>Admin / Notification</th>
                  </tr>
                </thead>
                <tbody>
                  {assignmentLogs.map((log) => {
                    const notification = assignmentEmailDetail(log.payload?.email_notification);
                    return (
                      <tr key={log.id}>
                        <td>
                          {new Date(log.created_at).toLocaleString("en-MY", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </td>
                        <td>{log.payload?.customer_name || "Customer"}</td>
                        <td>
                          <p className="text-sm text-[#68756f]">From: {log.payload?.previous_advisor_name || "Unassigned"}</p>
                          <p className="font-bold">To: {log.payload?.assigned_advisor_name || "Unassigned"}</p>
                        </td>
                        <td>{log.payload?.reason || "No reason recorded"}</td>
                        <td>
                          <p>{(log.actor && profileNameByEmail.get(log.actor.toLowerCase())) || log.actor || "Admin"}</p>
                          <p className="mt-1 text-sm text-[#68756f]">
                            {notification.value}
                            {log.payload?.agent_email ? ` to ${log.payload.agent_email}` : ""}
                          </p>
                        </td>
                      </tr>
                    );
                  })}
                  {!assignmentLogs.length ? (
                    <tr>
                      <td colSpan={5} className="text-sm text-[#68756f]">
                        No reassignment history yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
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
                      {submission.submission_type} | client submitted | {formatDate(submission.created_at)}
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
