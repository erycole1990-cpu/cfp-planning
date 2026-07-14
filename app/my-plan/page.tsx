import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell, EmptyState, PageHeader } from "@/app/ui";
import { accessDisplayName, requireCurrentAccess } from "@/lib/cfp/access";
import { createCfpServerClient } from "@/lib/cfp/supabase";
import { PersonalPlanForm } from "./personal-plan-form";

export const dynamic = "force-dynamic";

export default async function MyPlanPage() {
  const access = await requireCurrentAccess();
  const supabase = await createCfpServerClient();
  if (!supabase) {
    return <AppShell><EmptyState title="Database unavailable" body="This deployment is not connected to the planning database." /></AppShell>;
  }

  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .eq("client_user_id", access.user.id)
    .maybeSingle();
  if (existing?.id) redirect(`/customers/${existing.id}`);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Personal planning"
        title="Create My Plan"
        actions={<Link className="btn btn-secondary" href="/">Back</Link>}
      />
      {access.profile.status !== "active" ? (
        <EmptyState title="Account approval needed" body="Your account must be active before a personal plan can be created." />
      ) : (
        <PersonalPlanForm
          defaultName={accessDisplayName(access)}
          email={access.user.email || access.profile.email}
        />
      )}
    </AppShell>
  );
}
