"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { accessDisplayName, requireCurrentAccess } from "@/lib/cfp/access";
import { createCfpServerClient, type Customer, type PendingClientSubmission } from "@/lib/cfp/supabase";
import { calculateOnTrackStatus } from "@/lib/cfp/status";

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

const customerProfileFields = new Set([
  "full_name",
  "email",
  "phone",
  "date_of_birth",
  "nric_passport",
  "nationality",
  "marital_status",
  "number_of_dependents",
  "residential_address",
  "employment_status",
  "occupation",
  "employer_name",
  "monthly_income_range",
  "source_of_funds",
  "source_of_wealth",
  "risk_profile",
  "notes",
]);

function normalizedGoalName(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

export async function reviewPersonalSubmission(formData: FormData) {
  const access = await requireCurrentAccess();
  if (!access.isAdmin && !access.isAgent) throw new Error("Only an independent advisor or admin can review this update.");

  const submissionId = String(formData.get("submission_id") || "");
  const decision = String(formData.get("decision") || "");
  const reviewNotes = text(formData, "review_notes");
  if (!submissionId || !["approved", "rejected"].includes(decision)) throw new Error("The review decision is invalid.");
  if (decision === "rejected" && !reviewNotes) throw new Error("Add a reason before rejecting this update.");

  const supabase = await createCfpServerClient();
  if (!supabase) throw new Error("The database is not configured.");

  const { data: submissionRow, error: submissionError } = await supabase
    .from("pending_client_submissions")
    .select("*")
    .eq("id", submissionId)
    .eq("review_status", "pending")
    .single();
  if (submissionError) throw new Error(submissionError.message);
  const submission = submissionRow as PendingClientSubmission;

  const { data: customerRow, error: customerError } = await supabase
    .from("customers")
    .select("*")
    .eq("id", submission.customer_id)
    .single();
  if (customerError) throw new Error(customerError.message);
  const customer = customerRow as Customer;

  if (submission.submitted_by_user_id === access.user.id || customer.client_user_id === access.user.id) {
    throw new Error("You cannot review your own personal planning update.");
  }
  if (!access.isAdmin && customer.assigned_agent_user_id !== access.user.id) {
    throw new Error("This update belongs to another advisor.");
  }

  if (decision === "approved") {
    const payload = submission.payload || {};
    if (submission.submission_type === "financial_statement_item") {
      const { error } = await supabase.from("financial_statement_items").insert({ ...payload, customer_id: customer.id });
      if (error) throw new Error(error.message);
    } else if (submission.submission_type === "financial_statement_import") {
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      const { error } = await supabase.from("financial_statement_items").insert(
        rows.map((row) => ({ ...(row as Record<string, unknown>), customer_id: customer.id })),
      );
      if (error) throw new Error(error.message);
    } else if (submission.submission_type === "goal_progress") {
      const goalId = String(payload.goal_id || "");
      const loggedAmount = Number(payload.logged_amount);
      const { data: goal, error: goalError } = await supabase
        .from("financial_goals")
        .select("*")
        .eq("id", goalId)
        .eq("customer_id", customer.id)
        .single();
      if (goalError) throw new Error(goalError.message);

      const onTrackStatus = calculateOnTrackStatus({
        currentAmount: loggedAmount,
        targetAmount: Number(goal.target_amount),
        createdAt: goal.created_at,
        targetDate: goal.target_date,
      });
      const { error: logError } = await supabase.from("goal_progress_logs").insert({
        goal_id: goalId,
        logged_amount: loggedAmount,
        logged_by: "Personal update approved by " + accessDisplayName(access),
        notes: String(payload.notes || "") || null,
        on_track_status: onTrackStatus,
      });
      if (logError) throw new Error(logError.message);
      const { error: goalUpdateError } = await supabase
        .from("financial_goals")
        .update({ current_amount: loggedAmount, on_track_status: onTrackStatus })
        .eq("id", goalId);
      if (goalUpdateError) throw new Error(goalUpdateError.message);
    } else if (submission.submission_type === "customer_profile_update") {
      const profileUpdate = Object.fromEntries(
        Object.entries(payload).filter(([key]) => customerProfileFields.has(key)),
      );
      if (!Object.keys(profileUpdate).length) throw new Error("This profile proposal does not contain any supported changes.");
      const { error } = await supabase.from("customers").update(profileUpdate).eq("id", customer.id);
      if (error) throw new Error(error.message);
    } else if (submission.submission_type === "goal_create") {
      const goalName = String(payload.goal_name || "").trim();
      const targetAmount = Number(payload.target_amount);
      const currentAmount = Number(payload.current_amount);
      const targetDate = String(payload.target_date || "");
      if (!goalName) throw new Error("The proposed goal needs a name.");
      if (!Number.isFinite(targetAmount) || targetAmount <= 0) throw new Error("The proposed target amount must be greater than zero.");
      if (!Number.isFinite(currentAmount) || currentAmount < 0) throw new Error("The proposed current amount is invalid.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) throw new Error("The proposed target date is invalid.");

      const { data: activeGoals, error: activeGoalsError } = await supabase
        .from("financial_goals")
        .select("id,goal_name")
        .eq("customer_id", customer.id)
        .eq("status", "active");
      if (activeGoalsError) throw new Error(activeGoalsError.message);
      if ((activeGoals || []).some((goal) => normalizedGoalName(goal.goal_name) === normalizedGoalName(goalName))) {
        throw new Error(`An active goal named "${goalName}" already exists.`);
      }

      const goalPayload = {
        customer_id: customer.id,
        goal_type: String(payload.goal_type || "Other / Custom Goal"),
        goal_name: goalName,
        target_amount: targetAmount,
        current_amount: currentAmount,
        target_date: targetDate,
        priority: String(payload.priority || "medium"),
        status: "active",
      };
      const onTrackStatus = calculateOnTrackStatus({
        currentAmount,
        targetAmount,
        createdAt: new Date(),
        targetDate,
      });
      const { error } = await supabase.from("financial_goals").insert({ ...goalPayload, on_track_status: onTrackStatus });
      if (error) throw new Error(error.message);
    } else {
      throw new Error("This submission type is not supported.");
    }
  }

  const { error: reviewError } = await supabase
    .from("pending_client_submissions")
    .update({ review_status: decision, review_notes: reviewNotes })
    .eq("id", submission.id);
  if (reviewError) throw new Error(reviewError.message);

  await supabase.from("audit_logs").insert({
    user_id: access.user.id,
    actor: accessDisplayName(access),
    action: `personal_submission_${decision}`,
    entity_type: "pending_client_submissions",
    entity_id: submission.id,
    payload: {
      customer_id: customer.id,
      customer_name: customer.full_name,
      submission_type: submission.submission_type,
      notes: reviewNotes,
    },
  });

  revalidatePath("/");
  revalidatePath("/reviews");
  revalidatePath(`/customers/${customer.id}`);
  redirect(`/reviews?saved=${decision}`);
}
