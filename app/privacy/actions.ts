"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { accessDisplayName, requireCurrentAccess } from "@/lib/cfp/access";
import { PRIVACY_NOTICE_VERSION, privacyRequestLabels } from "@/lib/cfp/privacy";
import { createCfpServerClient } from "@/lib/cfp/supabase";

async function requireSupabase() {
  const supabase = await createCfpServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function acknowledgePrivacyNotice() {
  await requireCurrentAccess();
  const supabase = await requireSupabase();
  const { error } = await supabase.rpc("cfp_record_privacy_consent", {
    p_notice_version: PRIVACY_NOTICE_VERSION,
    p_source: "privacy_center",
  });
  if (error) redirect(`/privacy?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/privacy");
  redirect("/privacy?saved=consent");
}

export async function submitPrivacyRequest(formData: FormData) {
  const access = await requireCurrentAccess();
  const supabase = await requireSupabase();
  const requestType = String(formData.get("request_type") || "");
  const details = String(formData.get("details") || "").trim();
  if (!(requestType in privacyRequestLabels)) redirect("/privacy?error=Choose+a+valid+request+type.");
  if (details.length > 2000) redirect("/privacy?error=Request+details+must+be+under+2%2C000+characters.");

  const { data, error } = await supabase
    .from("privacy_requests")
    .insert({ user_id: access.user.id, request_type: requestType, details: details || null })
    .select("id")
    .single();
  if (error) redirect(`/privacy?error=${encodeURIComponent(error.message)}`);

  if (requestType === "withdrawal") {
    await supabase.from("privacy_consents").update({ withdrawn_at: new Date().toISOString() }).eq("user_id", access.user.id).is("withdrawn_at", null);
  }

  await supabase.from("audit_logs").insert({
    user_id: access.user.id,
    actor: accessDisplayName(access),
    action: "privacy_request_submitted",
    entity_type: "privacy_requests",
    entity_id: data.id,
    payload: { request_type: requestType },
  });
  revalidatePath("/privacy");
  revalidatePath("/admin/privacy");
  redirect("/privacy?saved=request");
}
