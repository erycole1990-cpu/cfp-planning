"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Factor = { id: string; friendly_name?: string; status: string };
type Enrollment = { id: string; qrCode: string; secret: string };

export function MfaChallenge() {
  const router = useRouter();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
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
      setMessage(verified.length ? "Enter the 6-digit code from your authenticator app." : "Set up an authenticator before continuing.");
    });
  }, []);

  async function beginEnrollment() {
    setBusy(true);
    setMessage("Preparing authenticator setup...");
    const supabase = createClient();
    const { data: listed } = await supabase.auth.mfa.listFactors();
    const stale = (listed?.totp || []).filter((factor) => factor.status !== "verified");
    await Promise.all(stale.map((factor) => supabase.auth.mfa.unenroll({ factorId: factor.id })));
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "CFP Planning Admin",
    });
    setBusy(false);
    if (error || !data) {
      setMessage(error?.message || "Authenticator setup could not be started.");
      return;
    }
    setEnrollment({ id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    setFactorId(data.id);
    setMessage("Scan the QR code, then enter the six-digit code to finish setup.");
  }

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
      <h2 className="text-xl font-bold">Authenticator security</h2>
      <p className="mt-1 text-sm text-[#68756f]">Admin accounts require a second factor before agency and client records can be accessed.</p>
      {!factors.length && !enrollment ? (
        <button className="btn mt-4 w-full" type="button" disabled={busy} onClick={beginEnrollment}>{busy ? "Preparing..." : "Set Up Authenticator"}</button>
      ) : null}
      {enrollment ? (
        <div className="mt-4 rounded-md border border-[#dce2dc] bg-white p-4">
          <Image unoptimized src={enrollment.qrCode} alt="Authenticator setup QR code" width={200} height={200} />
          <p className="mt-3 text-sm text-[#53625b]">Cannot scan it? Enter this setup key:</p>
          <p className="mt-1 break-all font-mono text-sm font-semibold">{enrollment.secret}</p>
        </div>
      ) : null}
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
      <button className="btn mt-4 w-full" type="button" disabled={busy || !factorId} onClick={verify}>{busy ? "Verifying..." : enrollment ? "Finish Setup" : "Verify and Continue"}</button>
      <p className="mt-3 text-sm font-semibold text-[#68756f]">{message}</p>
    </section>
  );
}
