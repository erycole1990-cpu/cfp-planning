import Link from "next/link";
import { acknowledgePrivacyNotice, submitPrivacyRequest } from "./actions";
import { AppShell, ErrorNotice, PageHeader } from "@/app/ui";
import { getCurrentAccess } from "@/lib/cfp/access";
import { formatDate } from "@/lib/cfp/format";
import {
  operatorContact,
  operatorLegalName,
  operatorLicence,
  operatorRegistration,
} from "@/lib/cfp/legal";
import { PRIVACY_NOTICE_VERSION, privacyRequestLabels, RETENTION_REVIEW_YEARS } from "@/lib/cfp/privacy";
import { createCfpServerClient } from "@/lib/cfp/supabase";

export const dynamic = "force-dynamic";

type RequestRow = { id: string; request_type: string; details: string | null; status: string; created_at: string };

export default async function PrivacyPage({ searchParams }: { searchParams?: Promise<{ saved?: string; error?: string }> }) {
  const query = (await searchParams) ?? {};
  const access = await getCurrentAccess();
  const supabase = access ? await createCfpServerClient() : null;
  const consentResult = supabase
    ? await supabase.from("privacy_consents").select("accepted_at,withdrawn_at,notice_version").eq("user_id", access!.user.id).eq("notice_version", PRIVACY_NOTICE_VERSION).maybeSingle()
    : { data: null };
  const requestsResult = supabase
    ? await supabase.from("privacy_requests").select("id,request_type,details,status,created_at").eq("user_id", access!.user.id).order("created_at", { ascending: false }).limit(20)
    : { data: [] as RequestRow[] };
  const consent = consentResult.data;
  const requests = (requestsResult.data || []) as RequestRow[];

  return (
    <AppShell>
      <PageHeader title="Privacy and Data Rights" eyebrow={`Notice ${PRIVACY_NOTICE_VERSION}`} />
      <ErrorNotice message={query.error} />
      {query.saved === "consent" ? <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 font-semibold text-emerald-800">Privacy notice acknowledged.</div> : null}
      {query.saved === "request" ? <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 font-semibold text-emerald-800">Your request was submitted for review.</div> : null}

      <section className="panel mb-5 p-5">
        <p className="text-sm font-bold uppercase text-[#68756f]">Data user and contact</p>
        <h2 className="mt-1 text-xl font-bold">{operatorLegalName}</h2>
        <p className="mt-2 text-[#53625b]">
          {operatorLegalName} operates this workspace and is responsible for deciding how personal data is used for the planning service. Privacy questions and requests may be sent to {operatorContact}.
        </p>
        {operatorRegistration || operatorLicence ? (
          <div className="mt-3 grid gap-1 text-sm text-[#53625b]">
            {operatorRegistration ? <p>Registration: {operatorRegistration}</p> : null}
            {operatorLicence ? <p>Licence or representative details: {operatorLicence}</p> : null}
          </div>
        ) : (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
            Operator registration and applicable licence details must be confirmed before real client data is collected.
          </p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="text-xl font-bold">Information we collect</h2>
          <p className="mt-3 text-[#53625b]">
            This may include identity and contact details, employment and family information, risk-profile answers, assets, liabilities, income, expenses, tax and insurance information, financial goals, documents, adviser notes, progress updates, account activity, consent records, and support or privacy requests.
          </p>
          <h3 className="mt-5 font-bold">Where it comes from</h3>
          <p className="mt-2 text-[#53625b]">
            Information may come from you, your authorised adviser, an administrator, uploaded documents, approved integrations, or another person you authorise. Please do not provide another person&apos;s information without authority.
          </p>
          <h3 className="mt-5 font-bold">Required and optional information</h3>
          <p className="mt-2 text-[#53625b]">
            Fields marked as required are needed to create or administer the requested service. Optional information can improve the plan. Missing or inaccurate information may make calculations, risk assessments, and recommendations incomplete.
          </p>
        </section>

        <section className="panel p-5">
          <h2 className="text-xl font-bold">How information is used</h2>
          <p className="mt-3 text-[#53625b]">
            We use information to create and maintain profiles and plans, calculate goals, assess progress, coordinate adviser reviews, manage client ownership, communicate service events, secure accounts, keep audit records, respond to requests, and meet legal or regulatory duties.
          </p>
          <h3 className="mt-5 font-bold">Automated assistance and human review</h3>
          <p className="mt-2 text-[#53625b]">
            Document extraction and classification may use automated or artificial-intelligence services. Suggested entries can be wrong. A client, adviser, or administrator must review material information before it becomes part of the official plan. The system does not make final legal, tax, investment, insurance, or credit decisions.
          </p>
          <h3 className="mt-5 font-bold">No unrelated marketing by default</h3>
          <p className="mt-2 text-[#53625b]">
            Planning data is not used for unrelated direct marketing unless a separate lawful choice is provided. You may object to direct marketing at any time.
          </p>
        </section>

        <section className="panel p-5">
          <h2 className="text-xl font-bold">Sharing and overseas processing</h2>
          <p className="mt-3 text-[#53625b]">
            Access is limited according to account role and client assignment. Information may be disclosed to your assigned adviser, authorised administrators, professional or regulatory bodies where required, and contracted technology providers that host data, authenticate users, deliver email, process documents, monitor security, or support the service.
          </p>
          <p className="mt-3 text-[#53625b]">
            Some providers may process data outside Malaysia. Appropriate contractual, access, and security measures should be maintained, but no internet service can guarantee absolute security. We do not sell personal financial data.
          </p>
          <h3 className="mt-5 font-bold">Security</h3>
          <p className="mt-2 text-[#53625b]">
            Safeguards include account authentication, role-based access, client assignment controls, audit records, encryption provided by hosting services, and administrative review. Users must protect passwords, use multi-factor authentication where offered, and report suspected unauthorised access promptly.
          </p>
        </section>

        <section className="panel p-5">
          <h2 className="text-xl font-bold">Retention and your rights</h2>
          <p className="mt-3 text-[#53625b]">
            Ended client records are scheduled for a retention review after {RETENTION_REVIEW_YEARS} years. This is not an automatic deletion date. Legal, regulatory, contractual, dispute, fraud-prevention, or legitimate recordkeeping requirements may require a longer hold.
          </p>
          <p className="mt-3 text-[#53625b]">
            Subject to Malaysian law, you may request access or correction, withdraw consent, object to direct marketing or harmful processing, ask about disclosure, or request deletion. We will verify identity and explain when a request cannot be completed because information must be retained.
          </p>
          <h3 className="mt-5 font-bold">Questions and complaints</h3>
          <p className="mt-2 text-[#53625b]">
            Contact {operatorContact} first so the matter can be investigated. You may also contact the Personal Data Protection Commissioner of Malaysia where applicable.
          </p>
          {!access ? <p className="mt-5 font-semibold"><Link className="text-[#0f766e] underline" href="/login?next=%2Fprivacy">Sign in</Link> to view consent and submit a request.</p> : null}
        </section>

        {access ? (
          <section className="panel p-5">
            <h2 className="text-xl font-bold">Your privacy center</h2>
            <div className="mt-3 rounded-md bg-[#f4f7f4] p-4 text-sm">
              <p className="font-bold">Current notice</p>
              <p className="mt-1 text-[#53625b]">{consent && !consent.withdrawn_at ? `Acknowledged ${formatDate(consent.accepted_at)}` : "Not currently acknowledged"}</p>
            </div>
            {(!consent || consent.withdrawn_at) ? <form action={acknowledgePrivacyNotice} className="mt-3"><button className="btn" type="submit">Acknowledge current notice</button></form> : null}
            <form action={submitPrivacyRequest} className="mt-6 grid gap-3">
              <label className="field-label" htmlFor="request_type">Request type</label>
              <select className="field" id="request_type" name="request_type" required defaultValue="access">
                {Object.entries(privacyRequestLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <label className="field-label" htmlFor="details">Details</label>
              <textarea className="field min-h-28" id="details" name="details" maxLength={2000} placeholder="Tell the team what information or change you need." />
              <button className="btn" type="submit">Submit request</button>
            </form>
          </section>
        ) : null}
      </div>

      <section className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-bold">Launch review required</p>
        <p className="mt-1">
          This operational notice supports transparency but is not a substitute for a tailored Malaysian legal, licensing, data-transfer, retention, incident-response, and bilingual notice review before real client data is stored.
        </p>
      </section>

      {access && requests.length ? (
        <section className="panel mt-5 overflow-hidden">
          <div className="border-b border-[#dce2dc] p-5"><h2 className="text-xl font-bold">Your recent requests</h2></div>
          <div className="divide-y divide-[#dce2dc]">
            {requests.map((request) => (
              <div className="grid gap-2 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center" key={request.id}>
                <div><p className="font-bold">{privacyRequestLabels[request.request_type] || request.request_type}</p>{request.details ? <p className="text-sm text-[#68756f]">{request.details}</p> : null}</div>
                <span className="text-sm font-semibold capitalize">{request.status.replace("_", " ")}</span>
                <span className="text-sm text-[#68756f]">{formatDate(request.created_at)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
