import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/";
  const requestedRole = requestUrl.searchParams.get("requested_role") === "agent" ? "agent" : null;

  if (code) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.redirect(new URL("/login?authConfig=missing", requestUrl.origin));
    }

    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return NextResponse.redirect(new URL(`/login?authError=${encodeURIComponent(error.message)}`, requestUrl.origin));
      }
      if (requestedRole) {
        await supabase.auth.updateUser({ data: { requested_role: requestedRole } });
      }
    } catch {
      return NextResponse.redirect(new URL("/login?authError=callback_failed", requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
