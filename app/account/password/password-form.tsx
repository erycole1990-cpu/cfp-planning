"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Password updated. You can continue using the app.");
    setPassword("");
    setConfirmPassword("");
  }

  return (
    <form className="grid gap-3" onSubmit={submit}>
      <label className="field"><span className="label">New password</span><input className="input" type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label className="field"><span className="label">Confirm password</span><input className="input" type="password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
      <button className="btn" type="submit" disabled={busy}>{busy ? "Updating..." : "Update Password"}</button>
      {message ? <p className="text-sm font-semibold text-[#68756f]">{message}</p> : null}
    </form>
  );
}
