"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

function callbackUrl() {
  const url = new URL("/auth/callback", window.location.origin);
  const next = new URLSearchParams(window.location.search).get("next");
  if (next) url.searchParams.set("next", next);
  return url.toString();
}

function nextPath() {
  return new URLSearchParams(window.location.search).get("next") || "/";
}

export function LoginForm() {
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "create-account">("sign-in");
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

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl(),
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

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: callbackUrl(),
      },
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    if (data.session) {
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
        <button className="btn" type="submit" disabled={busy}>
          {mode === "sign-in" ? "Sign In with Password" : "Create Password Account"}
        </button>
      </form>

      <div className="relative text-center text-sm font-semibold text-[#68756f]">or</div>

      <button className="btn btn-secondary" type="button" onClick={signInWithGoogle}>
        Continue with Google
      </button>

      <form onSubmit={sendMagicLink} className="grid gap-2">
        <button className="btn btn-secondary" type="submit">
          Send Magic Link Backup
        </button>
      </form>

      {message ? <p className="text-sm font-semibold text-[#68756f]">{message}</p> : null}
    </div>
  );
}
