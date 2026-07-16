import { AppShell, PageHeader } from "@/app/ui";
import { requireCurrentAccess } from "@/lib/cfp/access";
import { MfaChallenge } from "./mfa-challenge";

export const dynamic = "force-dynamic";

export default async function MfaChallengePage() {
  await requireCurrentAccess({ skipAdminMfa: true });

  return (
    <AppShell>
      <PageHeader eyebrow="Account security" title="Authenticator Security" />
      <MfaChallenge />
    </AppShell>
  );
}
