"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

function callbackUrl() {
  return `${window.location.origin}/auth/callback`;
}

export function LoginForm() {
  const [message, setMessage] = useState("");

  async function signInWithGoogle() {
    setMessage("Opening Google sign in...");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl(),
      },
    });
    if (error) setMessage(error.message);
  }

  return (
    <div className="grid gap-3">
      <button className="btn" type="button" onClick={signInWithGoogle}>
        Continue with Google
      </button>
      {message ? <p className="text-sm font-semibold text-[#68756f]">{message}</p> : null}
    </div>
  );
}
