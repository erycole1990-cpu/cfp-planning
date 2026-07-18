"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PRIVACY_NOTICE_VERSION } from "@/lib/cfp/privacy";

function callbackUrl(requestedRole?: "agent" | "client", advisorCode?: string) {
  const url = new URL("/auth/callback", window.location.origin);
  const next = safeNextPath(new URLSearchParams(window.location.search).get("next"));
  if (next) url.searchParams.set("next", next);
  if (requestedRole === "agent") url.searchParams.set("requested_role", "agent");
  if (requestedRole === "client" && advisorCode?.trim()) url.searchParams.set("advisor_code", advisorCode.trim().toUpperCase());
  return url.toString();
}

function nextPath() {
  return safeNextPath(new URLSearchParams(window.location.search).get("next"));
}

function safeNextPath(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function LoginForm() {
  const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "create-account">("sign-in");
  const [fullName, setFullName] = useState("");
  const [accountType, setAccountType] = useState<"agent" | "client">("agent");
  const [advisorCode, setAdvisorCode] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  function getSupabase() {
    try {
      return createClient();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login is not configured for this deployment.");
      return null;
    }
  }

  async function signInWithGoogle() {
    setMessage("Opening Google sign in...");
    const supabase = getSupabase();
    if (!supabase) return;
    const requestedRole = mode === "create-account" ? accountType : undefined;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl(requestedRole, advisorCode),
      },
    });
    if (error) setMessage(error.message);
  }

  async function submitPasswordLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setMessage("Email is required.");
      return;
    }
    if (password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }

    const supabase = getSupabase();
    if (!supabase) return;

    setBusy(true);
    setMessage(mode === "sign-in" ? "Signing in..." : "Creating account...");

    if (mode === "sign-in") {
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      setBusy(false);
      if (error) {
        setMessage(error.message);
        return;
      }
      window.location.assign(nextPath());
      return;
    }

    if (!privacyAccepted) {
      setBusy(false);
      setMessage("Please acknowledge the privacy notice before creating an account.");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: callbackUrl(accountType, advisorCode),
        data: {
          full_name: fullName.trim() || cleanEmail,
          requested_role: accountType,
          advisor_code: accountType === "client" ? advisorCode.trim().toUpperCase() || null : null,
          privacy_notice_version: PRIVACY_NOTICE_VERSION,
          privacy_accepted_at: new Date().toISOString(),
        },
      },
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    if (data.session) {
      await supabase.rpc("cfp_record_privacy_consent", {
        p_notice_version: PRIVACY_NOTICE_VERSION,
        p_source: "account_registration",
      });
      window.location.assign(nextPath());
      return;
    }
    setMessage("Account created. Check your email once to verify it, then sign in with your password.");
  }

  async function sendMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setMessage("Email is required.");
      return;
    }

    setMessage("Sending magic link...");
    const supabase = getSupabase();
    if (!supabase) return;

    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        emailRedirectTo: callbackUrl(),
      },
    });
    setMessage(error ? error.message : `Magic link sent to ${cleanEmail}. Open it in this browser to continue.`);
  }

  async function sendPasswordReset() {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setMessage("Enter your email first.");
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    const redirectTo = new URL("/auth/callback", window.location.origin);
    redirectTo.searchParams.set("next", "/account/password");
    setBusy(true);
    setMessage("Sending password reset email...");
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: redirectTo.toString() });
    setBusy(false);
    setMessage(error ? error.message : `Password reset email sent to ${cleanEmail}.`);
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2">
        <button
          className={mode === "sign-in" ? "btn" : "btn btn-secondary"}
          type="button"
          onClick={() => setMode("sign-in")}
        >
          Sign In
        </button>
        <button
          className={mode === "create-account" ? "btn" : "btn btn-secondary"}
          type="button"
          onClick={() => setMode("create-account")}
        >
          Create Account
        </button>
      </div>

      <form onSubmit={submitPasswordLogin} className="grid gap-3">
        {mode === "create-account" ? (
          <>
            <label className="field">
              <span className="label">Full Name</span>
              <input
                className="input"
                type="text"
                placeholder="Name shown to admin"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="label">Account Type</span>
              <select
                className="input"
                value={accountType}
                onChange={(event) => setAccountType(event.target.value === "client" ? "client" : "agent")}
              >
                <option value="agent">Agent - request approval to manage clients</option>
                <option value="client">Client - update my own planning data</option>
              </select>
            </label>
            {accountType === "client" ? (
              <label className="field">
                <span className="label">Adviser referral code (optional)</span>
                <input
                  className="input uppercase"
                  type="text"
                  autoComplete="off"
                  placeholder="Example: CFP-A1B2C3"
                  value={advisorCode}
                  onChange={(event) => setAdvisorCode(event.target.value.toUpperCase())}
                />
                <span className="text-xs text-[#68756f]">Use the private code from your adviser. Leave blank for admin assignment.</span>
              </label>
            ) : null}
          </>
        ) : null}
        <label className="field">
          <span className="label">Email / User ID</span>
          <input
            className="input"
            type="email"
            required
            placeholder="name@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="label">Password</span>
          <input
            className="input"
            type="password"
            required
            minLength={8}
            placeholder="At least 8 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {mode === "create-account" ? (
          <label className="flex items-start gap-3 rounded border border-[#d8dfdb] p-3 text-sm">
            <input
              className="mt-1 h-4 w-4"
              type="checkbox"
              required
              checked={privacyAccepted}
              onChange={(event) => setPrivacyAccepted(event.target.checked)}
            />
            <span>
              I have read the <Link className="font-bold text-[#0f766e] underline" href="/privacy">privacy and data rights notice</Link> and agree to the use of my information for financial planning and account administration.
            </span>
          </label>
        ) : null}
        <button className="btn" type="submit" disabled={busy}>
          {mode === "sign-in" ? "Sign In with Password" : "Create Password Account"}
        </button>
        {mode === "sign-in" ? (
          <button className="text-left text-sm font-bold text-[#0f766e]" type="button" onClick={sendPasswordReset} disabled={busy}>
            Forgot password?
          </button>
        ) : null}
      </form>

      <div className="relative text-center text-sm font-semibold text-[#68756f]">or</div>

      {googleEnabled ? (
        <button className="btn btn-secondary" type="button" onClick={signInWithGoogle}>
          Continue with Google
        </button>
      ) : null}

      <form onSubmit={sendMagicLink} className="grid gap-2">
        <button className="btn btn-secondary" type="submit">
          Send Magic Link Backup
        </button>
      </form>

      {message ? <p className="text-sm font-semibold text-[#68756f]">{message}</p> : null}
    </div>
  );
}
