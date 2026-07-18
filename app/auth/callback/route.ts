import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PRIVACY_NOTICE_VERSION } from "@/lib/cfp/privacy";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const requestedNext = requestUrl.searchParams.get("next");
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/";
  const requestedRole = requestUrl.searchParams.get("requested_role") === "agent" ? "agent" : null;
  const advisorCode = (requestUrl.searchParams.get("advisor_code") || "").trim().toUpperCase().slice(0, 40);

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
      const { data: userData } = await supabase.auth.getUser();
      const acceptedVersion = userData.user?.user_metadata?.privacy_notice_version;
      if (acceptedVersion) {
        await supabase.rpc("cfp_record_privacy_consent", {
          p_notice_version: String(acceptedVersion || PRIVACY_NOTICE_VERSION),
          p_source: "account_registration",
        });
      }
      if (requestedRole || advisorCode) {
        await supabase.auth.updateUser({
          data: {
            ...(userData.user?.user_metadata || {}),
            ...(requestedRole ? { requested_role: requestedRole } : {}),
            ...(advisorCode ? { advisor_code: advisorCode } : {}),
          },
        });
      }
    } catch {
      return NextResponse.redirect(new URL("/login?authError=callback_failed", requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
