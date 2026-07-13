"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Factor = { id: string; friendly_name?: string; status: string };

export function MfaChallenge() {
  const router = useRouter();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("Loading your authenticator...");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (error) {
        setMessage(error.message);
        return;
      }
      const verified = ((data?.totp || []) as Factor[]).filter((factor) => factor.status === "verified");
      setFactors(verified);
      setFactorId(verified[0]?.id || "");
      setMessage(verified.length ? "Enter the 6-digit code from your authenticator app." : "No verified authenticator is available.");
    });
  }, []);

  async function verify() {
    if (!factorId || code.trim().length !== 6) {
      setMessage("Enter the 6-digit code from your authenticator app.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <section className="panel mx-auto max-w-xl p-5">
      <h2 className="text-xl font-bold">Authenticator verification</h2>
      <p className="mt-1 text-sm text-[#68756f]">Admin accounts require a second factor before agency and client records can be accessed.</p>
      {factors.length > 1 ? (
        <label className="field mt-4">
          <span className="label">Authenticator</span>
          <select className="input" value={factorId} onChange={(event) => setFactorId(event.target.value)}>
            {factors.map((factor) => <option key={factor.id} value={factor.id}>{factor.friendly_name || "Authenticator app"}</option>)}
          </select>
        </label>
      ) : null}
      <label className="field mt-4">
        <span className="label">Verification code</span>
        <input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
      </label>
      <button className="btn mt-4 w-full" type="button" disabled={busy || !factorId} onClick={verify}>{busy ? "Verifying..." : "Verify and Continue"}</button>
      <p className="mt-3 text-sm font-semibold text-[#68756f]">{message}</p>
    </section>
  );
}
