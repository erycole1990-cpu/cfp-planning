import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell, EmptyState, PageHeader } from "@/app/ui";
import { accessDisplayName, requireCurrentAccess } from "@/lib/cfp/access";
import { createCfpServerClient } from "@/lib/cfp/supabase";
import { AddCustomerForm } from "./add-customer-form";

export const dynamic = "force-dynamic";

export default async function NewCustomerPage() {
  const access = await requireCurrentAccess();
  if (access.isClient) redirect("/my-plan");
  const supabase = await createCfpServerClient();
  let activeAgents: { id: string; name: string; email: string }[] = [];
  let agentLoadError: string | null = null;

  if (access.isAdmin && supabase) {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id,email,full_name")
      .eq("role", "agent")
      .eq("status", "active")
      .order("full_name", { ascending: true });

    if (error) {
      agentLoadError = error.message;
    } else {
      activeAgents = (data || []).map((agent) => ({
        id: agent.id,
        name: agent.full_name || agent.email,
        email: agent.email,
      }));
    }
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Customer setup"
        title="Add Customer"
        actions={
          <Link className="btn btn-secondary" href="/customers">
            Back to Customers
          </Link>
        }
      />

      {access.isAdmin || access.isAgent ? (
        <AddCustomerForm
          activeAgents={activeAgents}
          agentLoadError={agentLoadError}
          currentUserName={accessDisplayName(access)}
          isAdmin={access.isAdmin}
          isAgent={access.isAgent}
        />
      ) : (
        <EmptyState
          title="Account approval needed"
          body="Only active admins and agents can add customers. Ask an admin to approve your role before creating records."
        />
      )}
    </AppShell>
  );
}
