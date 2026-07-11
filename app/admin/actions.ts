"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentAccess } from "@/lib/cfp/access";
import { createCfpServerClient } from "@/lib/cfp/supabase";

async function requireSupabase() {
  const supabase = await createCfpServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

async function requireAdmin() {
  const access = await requireCurrentAccess();
  if (!access.isAdmin) throw new Error("Only admin can manage access.");
  return access;
}

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value.length ? value : null;
}

export async function updateUserAccess(formData: FormData) {
  const access = await requireAdmin();
  const supabase = await requireSupabase();
  const userId = String(formData.get("user_id") || "");
  const role = String(formData.get("role") || "");
  const status = String(formData.get("status") || "");
  if (!["admin", "agent", "client"].includes(role)) throw new Error("Invalid role.");
  if (!["active", "pending", "inactive"].includes(status)) throw new Error("Invalid status.");

  const { error } = await supabase.from("user_profiles").update({ role, status, full_name: text(formData, "full_name") }).eq("id", userId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_logs").insert({
    actor: access.user.email,
    action: "user_access_updated",
    entity_type: "user_profiles",
    entity_id: userId,
    payload: { role, status },
  });

  revalidatePath("/admin/access");
  redirect("/admin/access?saved=user");
}

export async function reassignCustomer(formData: FormData) {
  const access = await requireAdmin();
  const supabase = await requireSupabase();
  const customerId = String(formData.get("customer_id") || "");
  const agentId = text(formData, "assigned_agent_user_id");
  const reason = text(formData, "reason");
  if (!customerId) throw new Error("Customer is required.");
  if (!reason) throw new Error("Reassignment reason is required.");

  const { data: agent } = agentId
    ? await supabase.from("user_profiles").select("*").eq("id", agentId).single()
    : { data: null };

  const payload = {
    assigned_agent_user_id: agentId,
    assigned_advisor_name: agent ? agent.full_name || agent.email : "Unassigned",
  };

  const { error } = await supabase.from("customers").update(payload).eq("id", customerId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_logs").insert({
    actor: access.user.email,
    action: "customer_reassigned",
    entity_type: "customers",
    entity_id: customerId,
    payload: { ...payload, reason },
  });

  revalidatePath("/");
  revalidatePath("/customers");
  revalidatePath("/admin/access");
  redirect("/admin/access?saved=reassigned");
}

export async function reviewClientSubmission(formData: FormData) {
  const access = await requireAdmin();
  const supabase = await requireSupabase();
  const submissionId = String(formData.get("submission_id") || "");
  const decision = String(formData.get("decision") || "");
  const notes = text(formData, "review_notes");
  if (!["approved", "rejected"].includes(decision)) throw new Error("Decision is invalid.");

  const { data: submission, error: submissionError } = await supabase
    .from("pending_client_submissions")
    .select("*")
    .eq("id", submissionId)
    .single();
  if (submissionError) throw new Error(submissionError.message);

  if (decision === "approved") {
    const payload = submission.payload as { rows?: unknown[] };
    const rows = Array.isArray(payload.rows) ? payload.rows : [payload];
    const statementRows = rows.map((row) => ({ ...(row as Record<string, unknown>), customer_id: submission.customer_id }));
    const { error: insertError } = await supabase.from("financial_statement_items").insert(statementRows);
    if (insertError) throw new Error(insertError.message);
  }

  const { error } = await supabase
    .from("pending_client_submissions")
    .update({
      review_status: decision,
      reviewed_by_user_id: access.user.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes,
    })
    .eq("id", submissionId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_logs").insert({
    actor: access.user.email,
    action: `client_submission_${decision}`,
    entity_type: "pending_client_submissions",
    entity_id: submissionId,
    payload: { notes },
  });

  revalidatePath("/admin/access");
  revalidatePath(`/customers/${submission.customer_id}`);
  redirect("/admin/access?saved=submission");
}
