"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

function callbackUrl() {
  return `${window.location.origin}/auth/callback`;
}

export function LoginForm() {
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");

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
    <div className="grid gap-3">
      <button className="btn" type="button" onClick={signInWithGoogle}>
        Continue with Google
      </button>
      <div className="relative text-center text-sm font-semibold text-[#68756f]">or</div>
      <form onSubmit={sendMagicLink} className="grid gap-3">
        <label className="field">
          <span className="label">Email magic link</span>
          <input
            className="input"
            type="email"
            required
            placeholder="name@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <button className="btn btn-secondary" type="submit">
          Send Magic Link
        </button>
      </form>
      {message ? <p className="text-sm font-semibold text-[#68756f]">{message}</p> : null}
    </div>
  );
}
