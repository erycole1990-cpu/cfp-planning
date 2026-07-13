"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { accessDisplayName, requireCurrentAccess } from "@/lib/cfp/access";
import { sendAgentAssignmentEmail, sendAgentPortfolioTransferEmail } from "@/lib/cfp/notifications";
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

  const { data: currentProfile } = await supabase.from("user_profiles").select("role,status").eq("id", userId).single();
  if (currentProfile?.role === "agent" && (role !== "agent" || status !== "active")) {
    const { count } = await supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("assigned_agent_user_id", userId)
      .or("service_status.is.null,service_status.eq.active");
    if ((count || 0) > 0) {
      redirect(`/admin/access?error=${encodeURIComponent(`Transfer this agent's ${count} active client(s) before changing their role or status.`)}`);
    }
  }

  const { error } = await supabase.from("user_profiles").update({ role, status, full_name: text(formData, "full_name") }).eq("id", userId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_logs").insert({
    user_id: access.user.id,
    actor: accessDisplayName(access),
    action: "user_access_updated",
    entity_type: "user_profiles",
    entity_id: userId,
    payload: { role, status },
  });

  revalidatePath("/admin/access");
  redirect("/admin/access?saved=user");
}

export async function syncAuthUserProfile(formData: FormData) {
  const access = await requireAdmin();
  const supabase = await requireSupabase();
  const email = text(formData, "email");
  const role = String(formData.get("role") || "agent");
  const status = String(formData.get("status") || "pending");
  const fullName = text(formData, "full_name");
  if (!email) throw new Error("Email is required.");
  if (!["admin", "agent", "client"].includes(role)) throw new Error("Invalid role.");
  if (!["active", "pending", "inactive"].includes(status)) throw new Error("Invalid status.");

  const { data: profile, error } = await supabase
    .rpc("cfp_admin_sync_user_profile", {
      target_email: email,
      target_role: role,
      target_status: status,
      target_full_name: fullName,
    })
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("audit_logs").insert({
    user_id: access.user.id,
    actor: accessDisplayName(access),
    action: "user_profile_synced",
    entity_type: "user_profiles",
    entity_id: typeof profile === "object" && profile && "id" in profile ? String(profile.id) : null,
    payload: { email, role, status },
  });

  revalidatePath("/admin/access");
  redirect("/admin/access?saved=synced");
}

export async function reassignCustomer(formData: FormData) {
  const access = await requireAdmin();
  const supabase = await requireSupabase();
  const customerId = String(formData.get("customer_id") || "");
  const agentId = text(formData, "assigned_agent_user_id");
  const reason = text(formData, "reason");
  if (!customerId) throw new Error("Customer is required.");
  if (!agentId) throw new Error("Choose an active agent.");
  if (!reason) throw new Error("Reassignment reason is required.");

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, full_name, email, service_status, assigned_agent_user_id, assigned_advisor_name")
    .eq("id", customerId)
    .single();
  if (customerError) throw new Error(customerError.message);
  if (customer.assigned_agent_user_id === agentId) {
    redirect("/admin/access?saved=assignment-unchanged");
  }

  const { data: agent, error: agentError } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", agentId)
    .eq("role", "agent")
    .eq("status", "active")
    .single();
  if (agentError || !agent) throw new Error("The selected agent is not active.");

  const payload = {
    assigned_agent_user_id: agentId,
    assigned_advisor_name: agent.full_name || "Advisor",
  };

  const { data: updatedCustomer, error } = await supabase
    .from("customers")
    .update(payload)
    .eq("id", customerId)
    .select("id, service_status, assigned_agent_user_id, assigned_advisor_name")
    .single();
  if (error) throw new Error(error.message);
  if (updatedCustomer.assigned_agent_user_id !== agentId) throw new Error("The ownership change was not saved. Please try again.");

  const emailNotification = await sendAgentAssignmentEmail({
    to: agent?.email ?? null,
    agentName: agent.full_name || "Advisor",
    customerName: customer.full_name,
    adminName: accessDisplayName(access),
    reason,
  });

  await supabase.from("audit_logs").insert({
    user_id: access.user.id,
    actor: accessDisplayName(access),
    action: "customer_reassigned",
    entity_type: "customers",
    entity_id: customerId,
    payload: {
      previous_agent_user_id: customer.assigned_agent_user_id,
      previous_advisor_name: customer.assigned_advisor_name,
      customer_name: customer.full_name,
      customer_email: customer.email,
      agent_email: agent?.email ?? null,
      ...payload,
      reason,
      service_status: updatedCustomer.service_status,
      email_notification: emailNotification,
    },
  });

  revalidatePath("/");
  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/admin/access");
  redirect(`/admin/access?saved=reassigned&email=${emailNotification.status}`);
}

export async function resendCustomerAssignmentEmail(formData: FormData) {
  const access = await requireAdmin();
  const supabase = await requireSupabase();
  const customerId = String(formData.get("customer_id") || "");
  if (!customerId) throw new Error("Customer is required.");

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, full_name, email, assigned_agent_user_id, assigned_advisor_name")
    .eq("id", customerId)
    .single();
  if (customerError) throw new Error(customerError.message);
  if (!customer.assigned_agent_user_id) throw new Error("Assign this customer to an agent before sending a notice.");

  const { data: agent, error: agentError } = await supabase
    .from("user_profiles")
    .select("id,email,full_name")
    .eq("id", customer.assigned_agent_user_id)
    .eq("role", "agent")
    .eq("status", "active")
    .single();
  if (agentError || !agent) throw new Error("The assigned agent is not active.");

  const reason = "Reminder of the current client assignment";
  const emailNotification = await sendAgentAssignmentEmail({
    to: agent.email,
    agentName: agent.full_name || "Advisor",
    customerName: customer.full_name,
    adminName: accessDisplayName(access),
    reason,
  });

  await supabase.from("audit_logs").insert({
    user_id: access.user.id,
    actor: accessDisplayName(access),
    action: "customer_assignment_notification_resent",
    entity_type: "customers",
    entity_id: customer.id,
    payload: {
      customer_name: customer.full_name,
      customer_email: customer.email,
      assigned_agent_user_id: agent.id,
      assigned_advisor_name: agent.full_name || customer.assigned_advisor_name || "Advisor",
      agent_email: agent.email,
      reason,
      email_notification: emailNotification,
    },
  });

  revalidatePath("/admin/access");
  revalidatePath("/admin/audit");
  redirect(`/admin/access?saved=notice-resent&email=${emailNotification.status}`);
}

export async function transferAgentPortfolio(formData: FormData) {
  const access = await requireAdmin();
  const supabase = await requireSupabase();
  const sourceAgentId = String(formData.get("source_agent_user_id") || "");
  const targetAgentId = String(formData.get("target_agent_user_id") || "");
  const reason = text(formData, "reason");
  if (!sourceAgentId || !targetAgentId || sourceAgentId === targetAgentId) throw new Error("Choose two different agents.");
  if (!reason) throw new Error("Transfer reason is required.");

  const [{ data: sourceAgent }, { data: targetAgent, error: targetError }] = await Promise.all([
    supabase.from("user_profiles").select("id,email,full_name").eq("id", sourceAgentId).eq("role", "agent").single(),
    supabase.from("user_profiles").select("id,email,full_name").eq("id", targetAgentId).eq("role", "agent").eq("status", "active").single(),
  ]);
  if (targetError || !targetAgent) throw new Error("Choose an approved active receiving agent.");

  const { data: customers, error: customerError } = await supabase
    .from("customers")
    .select("id,full_name,email,assigned_advisor_name")
    .eq("assigned_agent_user_id", sourceAgentId)
    .or("service_status.is.null,service_status.eq.active");
  if (customerError) throw new Error(customerError.message);
  if (!customers?.length) redirect("/admin/access?saved=no-clients");

  const targetName = targetAgent.full_name || "Advisor";
  const { error: updateError } = await supabase
    .from("customers")
    .update({ assigned_agent_user_id: targetAgentId, assigned_advisor_name: targetName })
    .in("id", customers.map((customer) => customer.id));
  if (updateError) throw new Error(updateError.message);

  const notification = await sendAgentPortfolioTransferEmail({
    to: targetAgent.email,
    agentName: targetName,
    customerCount: customers.length,
    adminName: accessDisplayName(access),
    reason,
  });

  await supabase.from("audit_logs").insert(
    customers.map((customer) => ({
      user_id: access.user.id,
      actor: accessDisplayName(access),
      action: "customer_reassigned",
      entity_type: "customers",
      entity_id: customer.id,
      payload: {
        customer_name: customer.full_name,
        customer_email: customer.email,
        previous_agent_user_id: sourceAgentId,
        previous_advisor_name: customer.assigned_advisor_name || sourceAgent?.full_name || "Unassigned",
        assigned_agent_user_id: targetAgentId,
        assigned_advisor_name: targetName,
        agent_email: targetAgent.email,
        reason,
        bulk_transfer: true,
        email_notification: notification,
      },
    })),
  );

  revalidatePath("/");
  revalidatePath("/customers");
  revalidatePath("/admin/access");
  redirect(`/admin/access?saved=portfolio-transferred&count=${customers.length}&email=${notification.status}`);
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
    user_id: access.user.id,
    actor: accessDisplayName(access),
    action: `client_submission_${decision}`,
    entity_type: "pending_client_submissions",
    entity_id: submissionId,
    payload: { notes },
  });

  revalidatePath("/admin/access");
  revalidatePath(`/customers/${submission.customer_id}`);
  redirect("/admin/access?saved=submission");
}
