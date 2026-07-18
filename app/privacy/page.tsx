import Link from "next/link";
import { acknowledgePrivacyNotice, submitPrivacyRequest } from "./actions";
import { AppShell, ErrorNotice, PageHeader } from "@/app/ui";
import { getCurrentAccess } from "@/lib/cfp/access";
import { formatDate } from "@/lib/cfp/format";
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

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="text-xl font-bold">How your information is used</h2>
          <p className="mt-3 text-[#53625b]">CFP Planning stores profile, financial planning, goals, progress, and service records so your adviser team can prepare and maintain your plan. Access is limited by role and client assignment.</p>
          <h3 className="mt-5 font-bold">Retention and safeguards</h3>
          <p className="mt-2 text-[#53625b]">Ended client records are scheduled for a retention review after {RETENTION_REVIEW_YEARS} years. A review date is not an automatic deletion date: legal, regulatory, dispute, or legitimate business requirements may require a longer hold.</p>
          <h3 className="mt-5 font-bold">Your choices</h3>
          <p className="mt-2 text-[#53625b]">You may ask to access or correct your information, request deletion, or withdraw consent. The team will review the request and explain any information that must be retained.</p>
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
