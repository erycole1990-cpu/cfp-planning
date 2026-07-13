import Link from "next/link";
import { AppShell, EmptyState, PageHeader } from "@/app/ui";
import { requireCurrentAccess } from "@/lib/cfp/access";

export const dynamic = "force-dynamic";

const checks = [
  {
    title: "Database backup and restore test",
    frequency: "Monthly check, quarterly restore test",
    body: "Confirm the latest Supabase backup exists. If the project is on the Free plan, create an encrypted logical database export and store it outside the production account. Test restoring a copy every quarter.",
  },
  {
    title: "Staff access review",
    frequency: "Monthly and whenever staff leave",
    body: "Review every admin and agent. Transfer active clients before making an agent inactive, remove access promptly, and keep the recorded reason in the audit log.",
  },
  {
    title: "Retention and PDPA review",
    frequency: "Quarterly",
    body: "Keep only information needed for advice, service, legal, and audit duties. Document the approved retention period for active records, ended-service records, imports, and audit logs with your Malaysian compliance adviser.",
  },
  {
    title: "Email delivery domain",
    frequency: "Before inviting real agents",
    body: "Verify a sending domain in Resend and use that verified address in NOTIFICATION_FROM_EMAIL. The Resend test address only delivers to the Resend account owner.",
  },
  {
    title: "Client-submitted changes",
    frequency: "Every working day",
    body: "Treat client changes as pending proposals. An assigned adviser or admin reviews the original and proposed values before the official financial plan is changed.",
  },
];

export default async function OperationsPage() {
  const access = await requireCurrentAccess();
  if (!access.isAdmin) {
    return <AppShell><EmptyState title="Admin access required" body="Only admins can review the operating and privacy checklist." /></AppShell>;
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Admin control"
        title="Operations and Privacy"
        actions={<Link className="btn btn-secondary" href="/admin/access">Access and Reviews</Link>}
      />
      <div className="grid gap-4">
        {checks.map((check) => (
          <section className="panel p-5" key={check.title}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-4xl">
                <h2 className="text-xl font-bold">{check.title}</h2>
                <p className="mt-2 text-[#53625b]">{check.body}</p>
              </div>
              <span className="rounded-full border border-[#dce2dc] bg-[#f5f7f4] px-3 py-1 text-sm font-bold text-[#405047]">{check.frequency}</span>
            </div>
          </section>
        ))}
        <section className="panel p-5">
          <h2 className="text-xl font-bold">Useful records</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link className="btn btn-secondary" href="/admin/audit">Review Audit Log</Link>
            <Link className="btn btn-secondary" href="/admin/access">Review Access and Pending Changes</Link>
            <a className="btn btn-secondary" href="https://supabase.com/docs/guides/platform/backups" target="_blank" rel="noreferrer">Supabase Backup Guide</a>
            <a className="btn btn-secondary" href="https://resend.com/docs/dashboard/domains/introduction" target="_blank" rel="noreferrer">Resend Domain Guide</a>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
