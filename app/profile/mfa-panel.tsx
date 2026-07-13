"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Factor = { id: string; status: string; friendly_name?: string };

export function MfaPanel() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrollment, setEnrollment] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    const supabase = createClient();
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setMessage(error.message);
      return;
    }
    setFactors((data?.totp || []) as Factor[]);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function beginEnrollment() {
    setMessage("Preparing authenticator setup...");
    const supabase = createClient();
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "CFP Planning" });
    if (error) {
      setMessage(error.message);
      return;
    }
    setEnrollment({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    setMessage("Scan the QR code, then enter the 6-digit code.");
  }

  async function verify() {
    if (!enrollment || code.trim().length !== 6) {
      setMessage("Enter the 6-digit code from your authenticator app.");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.id, code: code.trim() });
    if (error) {
      setMessage(error.message);
      return;
    }
    setEnrollment(null);
    setCode("");
    setMessage("Multi-factor authentication is active.");
    await refresh();
  }

  async function removeFactor(factorId: string) {
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setMessage(error ? error.message : "Authenticator removed.");
    if (!error) await refresh();
  }

  const verified = factors.filter((factor) => factor.status === "verified");

  return (
    <section className="panel p-5">
      <h2 className="text-xl font-bold">Account security</h2>
      <p className="mt-1 text-sm text-[#68756f]">Admins should activate an authenticator before real client data is stored.</p>
      {!verified.length && !enrollment ? (
        <ol className="mt-4 grid gap-2 rounded-md border border-[#dce2dc] bg-[#f7f8f5] p-4 text-sm text-[#405047]">
          <li><strong>1.</strong> Install Google Authenticator, Microsoft Authenticator, 1Password, or another TOTP app.</li>
          <li><strong>2.</strong> Select Set Up Authenticator and scan the QR code.</li>
          <li><strong>3.</strong> Enter the 6-digit code to verify and activate MFA.</li>
          <li><strong>4.</strong> Sign out and sign in once to confirm the second-factor challenge works.</li>
        </ol>
      ) : null}
      {verified.length ? (
        <div className="mt-4 grid gap-3">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
            Multi-factor authentication is active.
          </div>
          {verified.map((factor) => (
            <div className="flex items-center justify-between gap-3 rounded-md border border-[#dce2dc] p-3" key={factor.id}>
              <span className="font-semibold">{factor.friendly_name || "Authenticator app"}</span>
              <button className="btn btn-secondary" type="button" onClick={() => removeFactor(factor.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : enrollment ? (
        <div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]">
          <img className="h-[220px] w-[220px] border border-[#dce2dc]" src={enrollment.qr} alt="Authenticator QR code" />
          <div className="grid content-start gap-3">
            <p className="text-sm text-[#405047]">Scan with Google Authenticator, Microsoft Authenticator, 1Password, or a compatible app.</p>
            <p className="text-sm font-semibold text-amber-800">Do not email, message, or store a screenshot of this QR code or manual key.</p>
            <p className="break-all rounded-md bg-[#f5f7f4] p-3 font-mono text-xs">Manual key: {enrollment.secret}</p>
            <input className="input" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} placeholder="6-digit code" />
            <button className="btn" type="button" onClick={verify}>Verify and Activate</button>
          </div>
        </div>
      ) : (
        <button className="btn mt-4" type="button" onClick={beginEnrollment}>Set Up Authenticator</button>
      )}
      {message ? <p className="mt-3 text-sm font-semibold text-[#68756f]">{message}</p> : null}
    </section>
  );
}
