"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { accessDisplayName, requireCurrentAccess } from "@/lib/cfp/access";
import { createCfpServerClient } from "@/lib/cfp/supabase";

async function requireAdmin() {
  const access = await requireCurrentAccess();
  if (!access.isAdmin) throw new Error("Admin access required.");
  const supabase = await createCfpServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  return { access, supabase };
}

export async function updatePrivacyRequest(formData: FormData) {
  const { access, supabase } = await requireAdmin();
  const requestId = String(formData.get("request_id") || "");
  const status = String(formData.get("status") || "submitted");
  const notes = String(formData.get("admin_notes") || "").trim();
  if (!requestId || !["submitted", "in_review", "completed", "rejected"].includes(status)) {
    redirect("/admin/privacy?error=Invalid+privacy+request");
  }
  if (["completed", "rejected"].includes(status) && !notes) {
    redirect("/admin/privacy?error=Record+a+decision+note+before+closing+the+request");
  }

  const reviewed = status === "submitted" ? null : new Date().toISOString();
  const { error } = await supabase.from("privacy_requests").update({
    status,
    admin_notes: notes || null,
    reviewed_by: reviewed ? access.user.id : null,
    reviewed_at: reviewed,
  }).eq("id", requestId);
  if (error) redirect(`/admin/privacy?error=${encodeURIComponent(error.message)}`);

  await supabase.from("audit_logs").insert({
    actor: accessDisplayName(access),
    action: "privacy_request_updated",
    entity_type: "privacy_requests",
    entity_id: requestId,
    payload: { status, notes: notes || null },
  });
  revalidatePath("/admin/privacy");
  redirect("/admin/privacy?saved=request");
}

export async function updateCustomerRetention(formData: FormData) {
  const { access, supabase } = await requireAdmin();
  const customerId = String(formData.get("customer_id") || "");
  const reviewDate = String(formData.get("retention_review_at") || "");
  const legalHold = formData.get("legal_hold") === "on";
  if (!customerId) redirect("/admin/privacy?error=Customer+is+required");

  const { error } = await supabase.from("customers").update({
    legal_hold: legalHold,
    retention_review_at: reviewDate ? `${reviewDate}T00:00:00.000Z` : null,
  }).eq("id", customerId);
  if (error) redirect(`/admin/privacy?error=${encodeURIComponent(error.message)}`);

  await supabase.from("audit_logs").insert({
    actor: accessDisplayName(access),
    action: "customer_retention_updated",
    entity_type: "customers",
    entity_id: customerId,
    payload: { legal_hold: legalHold, retention_review_at: reviewDate || null },
  });
  revalidatePath("/admin/privacy");
  redirect("/admin/privacy?saved=retention");
}
