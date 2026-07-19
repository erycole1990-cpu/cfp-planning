import { AppShell, PageHeader } from "@/app/ui";
import {
  LEGAL_NOTICE_VERSION,
  operatorContact,
  operatorLegalName,
  operatorLicence,
  operatorRegistration,
} from "@/lib/cfp/legal";

export default function TermsPage() {
  return (
    <AppShell>
      <PageHeader title="Terms of Use" eyebrow={`Effective ${LEGAL_NOTICE_VERSION}`} />

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="text-xl font-bold">Service operator and scope</h2>
          <p className="mt-3 text-[#53625b]">
            These terms govern access to the CFP Planning workspace operated by {operatorLegalName}. The workspace helps clients, advisers, and administrators collect information, calculate scenarios, coordinate reviews, and track planning actions.
          </p>
          {operatorRegistration ? <p className="mt-3 text-sm text-[#53625b]">Registration: {operatorRegistration}</p> : null}
          {operatorLicence ? <p className="mt-1 text-sm text-[#53625b]">Licence or representative details: {operatorLicence}</p> : null}
          <h3 className="mt-5 font-bold">Human professional review</h3>
          <p className="mt-2 text-[#53625b]">
            Software outputs, automated classifications, dashboards, and calculators are working tools. They are not by themselves financial, investment, tax, legal, insurance, estate-planning, lending, or accounting advice. A suitably qualified person must review material decisions and disclose the capacity in which advice is provided.
          </p>
        </section>

        <section className="panel p-5">
          <h2 className="text-xl font-bold">Calculations and projections</h2>
          <p className="mt-3 text-[#53625b]">
            Results depend on assumptions and information supplied by users. Inflation, returns, costs, taxes, product terms, laws, and personal circumstances can change. Projections are estimates, not promises or guarantees of performance, suitability, approval, or goal achievement.
          </p>
          <p className="mt-3 text-[#53625b]">
            Users should check inputs, review source documents, consider fees and risks, and obtain appropriate professional advice before acting.
          </p>
        </section>

        <section className="panel p-5">
          <h2 className="text-xl font-bold">Account and data responsibilities</h2>
          <p className="mt-3 text-[#53625b]">
            You must provide accurate information, keep credentials confidential, use only your own account, respect client assignments, and access information only for authorised planning work. Do not upload unlawful, malicious, or unauthorised third-party data.
          </p>
          <p className="mt-3 text-[#53625b]">
            Clients should promptly correct material errors. Advisers and administrators must document reviews, conflicts, ownership changes, and material decisions in the workspace.
          </p>
        </section>

        <section className="panel p-5">
          <h2 className="text-xl font-bold">Availability, third parties, and liability</h2>
          <p className="mt-3 text-[#53625b]">
            The service may depend on third-party hosting, authentication, email, document-processing, and artificial-intelligence providers. Availability and extraction accuracy are not guaranteed. To the extent permitted by law, the operator is not responsible for loss caused by inaccurate inputs, unauthorised use, ignored warnings, or decisions made without appropriate review.
          </p>
          <p className="mt-3 text-[#53625b]">
            Nothing in these terms excludes liability that cannot lawfully be excluded. Specific engagement letters, regulated-service terms, product documents, and professional duties prevail where they apply.
          </p>
        </section>

        <section className="panel p-5 lg:col-span-2">
          <h2 className="text-xl font-bold">Suspension, changes, and contact</h2>
          <p className="mt-3 text-[#53625b]">
            Access may be restricted to protect clients, investigate misuse, comply with law, or manage an ended service relationship. Material changes to these terms should be identified by a new effective date and, where appropriate, require renewed acknowledgement.
          </p>
          <p className="mt-3 text-[#53625b]">
            Questions, corrections, and complaints may be directed to {operatorContact}. These terms should be reviewed with Malaysian counsel and against the operator&apos;s actual licences, representative status, contracts, and insurance before production use.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
