import { AppShell, PageHeader } from "@/app/ui";
import { requireCurrentAccess } from "@/lib/cfp/access";
import { updateAdvisorPreferences, updateOwnProfile } from "./actions";
import { MfaPanel } from "./mfa-panel";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: { searchParams?: Promise<{ saved?: string; preferences?: string }> }) {
  const access = await requireCurrentAccess();
  const query = (await searchParams) || {};
  const profile = access.profile;

  return (
    <AppShell>
      <PageHeader eyebrow="Account" title="My Profile" />
      {query.saved ? <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">Profile saved.</div> : null}
      {query.preferences ? <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">Referral availability saved.</div> : null}
      <div className="grid gap-6">
        <form action={updateOwnProfile} className="panel grid gap-4 p-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <h2 className="text-xl font-bold">Professional identity</h2>
            <p className="mt-1 text-sm text-[#68756f]">This information identifies you inside the agency. Your email remains private login and contact information.</p>
          </div>
          <label className="field md:col-span-2"><span className="label">Full name</span><input className="input" name="full_name" required defaultValue={profile.full_name || ""} /></label>
          <label className="field"><span className="label">Phone</span><input className="input" name="phone" defaultValue={profile.phone || ""} /></label>
          <label className="field"><span className="label">Position / Title</span><input className="input" name="job_title" defaultValue={profile.job_title || ""} placeholder="Financial Planner" /></label>
          <label className="field"><span className="label">Agency</span><input className="input" name="agency_name" defaultValue={profile.agency_name || ""} /></label>
          <label className="field"><span className="label">Branch</span><input className="input" name="branch_name" defaultValue={profile.branch_name || ""} /></label>
          <label className="field"><span className="label">Agency registration number</span><input className="input" name="agency_registration_no" defaultValue={profile.agency_registration_no || ""} /></label>
          <label className="field"><span className="label">Planner / Adviser licence number</span><input className="input" name="license_no" defaultValue={profile.license_no || ""} /></label>
          <label className="field md:col-span-2"><span className="label">Professional summary</span><textarea className="input min-h-24" name="bio" defaultValue={profile.bio || ""} /></label>
          <div className="md:col-span-2"><button className="btn" type="submit">Save Profile</button></div>
        </form>
        {access.isAgent ? (
          <form action={updateAdvisorPreferences} className="panel grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <h2 className="text-xl font-bold">Client referrals</h2>
              <p className="mt-1 text-sm text-[#68756f]">Share this private code only with people who want you to review their plan.</p>
              <p className="mt-3 font-mono text-lg font-bold text-[#0f766e]">{profile.advisor_code || "Code available after migration"}</p>
              <label className="mt-4 flex items-center gap-3 font-semibold">
                <input name="accepting_new_clients" type="checkbox" defaultChecked={profile.accepting_new_clients} />
                Accept new client referral requests
              </label>
            </div>
            <button className="btn" type="submit">Save Availability</button>
          </form>
        ) : null}
        <MfaPanel />
      </div>
    </AppShell>
  );
}
