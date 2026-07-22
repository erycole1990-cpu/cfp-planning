"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { evaluateGoalHealth } from "@/lib/cfp/status";
import { createCfpServerClient, type Customer } from "@/lib/cfp/supabase";
import { accessDisplayName, canAccessCustomer, getCurrentAccess, isPersonalCustomer, requireCurrentAccess } from "@/lib/cfp/access";
import { createClient as createSessionSupabaseClient } from "@/lib/supabase/server";

async function requireSupabase() {
  const supabase = await createCfpServerClient();
  if (!supabase) {
    throw new Error("Supabase environment is not configured. Pull .env.local from Vercel before saving data.");
  }
  return supabase;
}

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value.length ? value : null;
}

function requiredText(formData: FormData, key: string) {
  const value = text(formData, key);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function numberValue(formData: FormData, key: string) {
  const value = Number(formData.get(key));
  if (!Number.isFinite(value) || value < 0) throw new Error(`${key} must be a non-negative number.`);
  return value;
}

function optionalWholeNumber(formData: FormData, key: string) {
  const raw = text(formData, key);
  if (raw === null) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${key} must be a whole number.`);
  return value;
}

async function writeAudit(input: {
  actor?: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  payload: Record<string, unknown>;
}) {
  const supabase = await requireSupabase();
  const { error } = await supabase.from("audit_logs").insert({
    user_id: (await getCurrentAccess())?.user.id || null,
    actor: input.actor || "system",
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    payload: input.payload,
  });
  if (error) console.error("Audit log write failed:", error.message);
}

export type CustomerFormState = {
  error: string | null;
};

export type GoalFormState = {
  error: string | null;
};

function isRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

function supabaseProjectHost() {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host : "not configured";
  } catch {
    return "not configured";
  }
}

async function accessDiagnostics() {
  try {
    const access = await getCurrentAccess();
    const sessionSupabase = await createSessionSupabaseClient();
    const roleResult = await sessionSupabase.rpc("cfp_user_role");
    const adminResult = await sessionSupabase.rpc("cfp_is_admin");
    const profileResult = access
      ? await sessionSupabase.from("user_profiles").select("id,email,role,status").eq("id", access.user.id).maybeSingle()
      : null;

    const appAccess = access
      ? `App session ${access.user.email}; app profile ${access.profile.role}/${access.profile.status}.`
      : "App session was not found.";
    const dbRole = roleResult.error ? `Database role check error: ${roleResult.error.message}.` : `Database role: ${roleResult.data || "not active"}.`;
    const dbAdmin = adminResult.error
      ? `Database admin check error: ${adminResult.error.message}.`
      : `Database admin check: ${adminResult.data ? "yes" : "no"}.`;
    const profile = profileResult?.error
      ? `Profile row check error: ${profileResult.error.message}.`
      : `Profile row: ${
          profileResult?.data ? `${profileResult.data.email} ${profileResult.data.role}/${profileResult.data.status}` : "not found for this login"
        }.`;

    return `${appAccess} ${dbRole} ${dbAdmin} ${profile} Supabase project: ${supabaseProjectHost()}.`;
  } catch (diagnosticError) {
    const message = diagnosticError instanceof Error ? diagnosticError.message : "unknown diagnostic error";
    return `Could not read access diagnostics: ${message}. Supabase project: ${supabaseProjectHost()}.`;
  }
}

async function friendlySaveError(error: unknown) {
  const message = error instanceof Error ? error.message : "The record could not be saved.";
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("row-level security") || lowerMessage.includes("permission denied")) {
    const diagnostics = await accessDiagnostics();
    return `Database blocked this save: ${message}. ${diagnostics}`;
  }

  if (lowerMessage.includes("duplicate key")) {
    return "This record already exists. Check the customer list before creating another one.";
  }

  return message;
}

async function customerForAccess(customerId: string) {
  const supabase = await requireSupabase();
  const { data, error } = await supabase.from("customers").select("*").eq("id", customerId).single();
  if (error) throw new Error(error.message);
  return data as Customer;
}

async function requireCustomerAccess(customerId: string) {
  const access = await requireCurrentAccess();
  const customer = await customerForAccess(customerId);
  if (!canAccessCustomer(access, customer)) throw new Error("You do not have access to this customer.");
  return { access, customer };
}

function requiresIndependentReview(
  access: Awaited<ReturnType<typeof requireCurrentAccess>>,
  customer: Pick<Customer, "client_user_id">,
) {
  return access.isClient || isPersonalCustomer(access, customer);
}

function comparableValue(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  return typeof value === "string" ? value.trim() || null : value;
}

export async function createCustomer(formData: FormData) {
  const access = await requireCurrentAccess();
  if (!access.isAdmin && !access.isAgent) throw new Error("Only admins and agents can add customers.");
  const supabase = await requireSupabase();
  let assignedAgentUserId = access.user.id;
  let assignedAdvisorName = accessDisplayName(access);

  if (access.isAdmin) {
    const selectedAgentId = text(formData, "assigned_agent_user_id");
    if (!selectedAgentId) throw new Error("Choose an approved active agent before saving this customer.");

    const { data: agent, error: agentError } = await supabase
      .from("user_profiles")
      .select("id,email,full_name")
      .eq("id", selectedAgentId)
      .eq("role", "agent")
      .eq("status", "active")
      .single();

    if (agentError || !agent) throw new Error("Choose an approved active agent before saving this customer.");
    assignedAgentUserId = agent.id;
    assignedAdvisorName = agent.full_name || agent.email;
  }

  const payload = {
    full_name: requiredText(formData, "full_name"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
    date_of_birth: text(formData, "date_of_birth"),
    nric_passport: text(formData, "nric_passport"),
    nationality: text(formData, "nationality"),
    marital_status: text(formData, "marital_status"),
    number_of_dependents: optionalWholeNumber(formData, "number_of_dependents"),
    residential_address: text(formData, "residential_address"),
    employment_status: text(formData, "employment_status"),
    occupation: text(formData, "occupation"),
    employer_name: text(formData, "employer_name"),
    monthly_income_range: text(formData, "monthly_income_range"),
    source_of_funds: text(formData, "source_of_funds"),
    source_of_wealth: text(formData, "source_of_wealth"),
    risk_profile: requiredText(formData, "risk_profile"),
    assigned_advisor_name: assignedAdvisorName,
    assigned_agent_user_id: assignedAgentUserId,
    client_stage: "lead",
    notes: text(formData, "notes"),
  };

  const { data, error } = await supabase.rpc("cfp_create_customer", { customer_payload: payload });
  if (error) throw new Error(error.message);
  const customerId = String(data);

  await writeAudit({
    actor: accessDisplayName(access),
    action: "customer_created",
    entityType: "customers",
    entityId: customerId,
    payload,
  });

  revalidatePath("/");
  revalidatePath("/customers");
  redirect(`/customers/${customerId}?saved=customer`);
}

export async function createCustomerFromIntake(_state: CustomerFormState, formData: FormData): Promise<CustomerFormState> {
  try {
    await createCustomer(formData);
    return { error: null };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { error: await friendlySaveError(error) };
  }
}

export async function updateCustomer(formData: FormData) {
  const supabase = await requireSupabase();
  const customerId = requiredText(formData, "customer_id");
  const { access, customer } = await requireCustomerAccess(customerId);
  const payload = {
    full_name: requiredText(formData, "full_name"),
    email: text(formData, "email"),
    phone: text(formData, "phone"),
    date_of_birth: text(formData, "date_of_birth"),
    nric_passport: text(formData, "nric_passport"),
    nationality: text(formData, "nationality"),
    marital_status: text(formData, "marital_status"),
    number_of_dependents: optionalWholeNumber(formData, "number_of_dependents"),
    residential_address: text(formData, "residential_address"),
    employment_status: text(formData, "employment_status"),
    occupation: text(formData, "occupation"),
    employer_name: text(formData, "employer_name"),
    monthly_income_range: text(formData, "monthly_income_range"),
    source_of_funds: text(formData, "source_of_funds"),
    source_of_wealth: text(formData, "source_of_wealth"),
    risk_profile: requiredText(formData, "risk_profile"),
    notes: text(formData, "notes"),
  };

  const cleanPayload = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
  const currentCustomer = customer as unknown as Record<string, unknown>;
  const changedPayload = Object.fromEntries(
    Object.entries(cleanPayload).filter(([key, value]) => comparableValue(currentCustomer[key]) !== comparableValue(value)),
  );

  if (!Object.keys(changedPayload).length) {
    redirect(`/customers/${customerId}?saved=customer`);
  }

  if (requiresIndependentReview(access, customer)) {
    const { data: existingSubmission, error: pendingError } = await supabase
      .from("pending_client_submissions")
      .select("id")
      .eq("customer_id", customerId)
      .eq("submission_type", "customer_profile_update")
      .eq("review_status", "pending")
      .limit(1)
      .maybeSingle();
    if (pendingError) throw new Error(pendingError.message);
    if (existingSubmission) throw new Error("A profile update is already waiting for advisor review.");

    const { error: submissionError } = await supabase.from("pending_client_submissions").insert({
      customer_id: customerId,
      submitted_by_user_id: access.user.id,
      submission_type: "customer_profile_update",
      payload: changedPayload,
    });
    if (submissionError) throw new Error(submissionError.message);

    revalidatePath("/reviews");
    revalidatePath(`/customers/${customerId}`);
    redirect(`/customers/${customerId}?saved=pending`);
  }

  const { error } = await supabase.from("customers").update(cleanPayload).eq("id", customerId);
  if (error) throw new Error(error.message);

  await writeAudit({
    actor: accessDisplayName(access),
    action: "customer_updated",
    entityType: "customers",
    entityId: customerId,
    payload: cleanPayload,
  });

  revalidatePath("/");
  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}?saved=customer`);
}

export async function endCustomerService(formData: FormData) {
  const supabase = await requireSupabase();
  const customerId = requiredText(formData, "customer_id");
  const { access } = await requireCustomerAccess(customerId);
  if (!access.isAdmin && !access.isAgent) throw new Error("Only admins and agents can end service.");
  const actor = requiredText(formData, "actor");
  const reason = requiredText(formData, "service_ended_reason");
  const payload = {
    service_status: "inactive",
    service_ended_at: new Date().toISOString(),
    service_ended_reason: reason,
  };

  const { error } = await supabase.from("customers").update(payload).eq("id", customerId);
  if (error) throw new Error(error.message);

  await writeAudit({
    actor,
    action: "customer_service_ended",
    entityType: "customers",
    entityId: customerId,
    payload,
  });

  revalidatePath("/");
  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  redirect("/customers?saved=service-ended");
}

export async function reactivateCustomerService(formData: FormData) {
  const supabase = await requireSupabase();
  const customerId = requiredText(formData, "customer_id");
  const { access } = await requireCustomerAccess(customerId);
  if (!access.isAdmin && !access.isAgent) throw new Error("Only admins and agents can reactivate service.");
  const actor = requiredText(formData, "actor");
  const payload = {
    service_status: "active",
    service_ended_at: null,
    service_ended_reason: null,
  };

  const { error } = await supabase.from("customers").update(payload).eq("id", customerId);
  if (error) throw new Error(error.message);

  await writeAudit({
    actor,
    action: "customer_service_reactivated",
    entityType: "customers",
    entityId: customerId,
    payload,
  });

  revalidatePath("/");
  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}?saved=reactivated`);
}

export async function createFinancialStatementItem(formData: FormData) {
  const supabase = await requireSupabase();
  const customerId = requiredText(formData, "customer_id");
  const { access, customer } = await requireCustomerAccess(customerId);
  const actor = requiredText(formData, "actor");
  const statementType = requiredText(formData, "statement_type");
  const itemType = requiredText(formData, "item_type");

  if (!["balance_sheet", "cash_flow", "profit_loss"].includes(statementType)) {
    throw new Error("Statement type is invalid.");
  }

  const payload = {
    customer_id: customerId,
    statement_type: statementType,
    item_type: itemType,
    category: text(formData, "category"),
    description: requiredText(formData, "description"),
    amount: numberValue(formData, "amount"),
    frequency: text(formData, "frequency") || "monthly",
    statement_date: text(formData, "statement_date"),
  };

  if (requiresIndependentReview(access, customer)) {
    const { error } = await supabase.from("pending_client_submissions").insert({
      customer_id: customerId,
      submitted_by_user_id: access.user.id,
      submission_type: "financial_statement_item",
      payload,
    });
    if (error) throw new Error(error.message);
    revalidatePath(`/customers/${customerId}`);
    redirect(`/customers/${customerId}?saved=pending#financial-statements`);
  }

  const { data, error } = await supabase.from("financial_statement_items").insert(payload).select("id").single();
  if (error) throw new Error(error.message);

  await writeAudit({
    actor,
    action: "financial_statement_item_created",
    entityType: "financial_statement_items",
    entityId: data.id,
    payload,
  });

  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}?saved=statement#financial-statements`);
}

export async function deleteFinancialStatementItem(formData: FormData) {
  const supabase = await requireSupabase();
  const customerId = requiredText(formData, "customer_id");
  const { access, customer } = await requireCustomerAccess(customerId);
  if (requiresIndependentReview(access, customer)) throw new Error("Personal-plan official records need advisor review.");
  const itemId = requiredText(formData, "statement_item_id");
  const actor = requiredText(formData, "actor");

  const { data: item, error: itemError } = await supabase
    .from("financial_statement_items")
    .select("*")
    .eq("id", itemId)
    .eq("customer_id", customerId)
    .single();
  if (itemError) throw new Error(itemError.message);

  const { error } = await supabase.from("financial_statement_items").delete().eq("id", itemId).eq("customer_id", customerId);
  if (error) throw new Error(error.message);

  await writeAudit({
    actor,
    action: "financial_statement_item_deleted",
    entityType: "financial_statement_items",
    entityId: itemId,
    payload: item,
  });

  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}?saved=statement#financial-statements`);
}

export async function importFinancialStatementItems(formData: FormData) {
  const supabase = await requireSupabase();
  const customerId = requiredText(formData, "customer_id");
  const { access, customer } = await requireCustomerAccess(customerId);
  const actor = requiredText(formData, "actor");
  const statementTypes = formData.getAll("statement_type").map(String);
  const itemTypes = formData.getAll("item_type").map(String);
  const categories = formData.getAll("category").map(String);
  const descriptions = formData.getAll("description").map(String);
  const amounts = formData.getAll("amount").map(String);
  const frequencies = formData.getAll("frequency").map(String);
  const statementDates = formData.getAll("statement_date").map(String);

  const rows = descriptions
    .map((description, index) => ({
      customer_id: customerId,
      statement_type: statementTypes[index],
      item_type: itemTypes[index],
      category: categories[index] || null,
      description: description.trim(),
      amount: Number(amounts[index]),
      frequency: frequencies[index] || "one_time",
      statement_date: statementDates[index] || null,
    }))
    .filter((row) => row.description && Number.isFinite(row.amount) && row.amount >= 0);

  for (const row of rows) {
    if (!["balance_sheet", "cash_flow", "profit_loss"].includes(row.statement_type)) {
      throw new Error("One imported row has an invalid statement type.");
    }
    if (!row.item_type) throw new Error("One imported row is missing a type.");
  }

  if (!rows.length) throw new Error("No valid imported rows to save.");

  if (requiresIndependentReview(access, customer)) {
    const { error } = await supabase.from("pending_client_submissions").insert({
      customer_id: customerId,
      submitted_by_user_id: access.user.id,
      submission_type: "financial_statement_import",
      payload: { rows },
    });
    if (error) throw new Error(error.message);
    revalidatePath(`/customers/${customerId}`);
    redirect(`/customers/${customerId}?saved=pending#financial-statements`);
  }

  const { error } = await supabase.from("financial_statement_items").insert(rows);
  if (error) throw new Error(error.message);

  await writeAudit({
    actor,
    action: "financial_statement_items_imported",
    entityType: "financial_statement_items",
    entityId: null,
    payload: { customer_id: customerId, count: rows.length },
  });

  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}?saved=statement-import#financial-statements`);
}

export async function createGoal(formData: FormData) {
  const supabase = await requireSupabase();
  const customerId = requiredText(formData, "customer_id");
  const { access, customer } = await requireCustomerAccess(customerId);
  const targetDate = requiredText(formData, "target_date");
  const targetDateValue = new Date(`${targetDate}T00:00:00`);
  if (targetDateValue < new Date(new Date().toDateString())) {
    throw new Error("Target date must be today or later.");
  }

  const goalName = requiredText(formData, "goal_name");
  const { data: activeGoals, error: activeGoalsError } = await supabase
    .from("financial_goals")
    .select("id,goal_name")
    .eq("customer_id", customerId)
    .eq("status", "active");
  if (activeGoalsError) throw new Error(activeGoalsError.message);
  const normalizedGoalName = goalName.trim().replace(/\s+/g, " ").toLowerCase();
  const duplicate = (activeGoals || []).find(
    (goal) => String(goal.goal_name || "").trim().replace(/\s+/g, " ").toLowerCase() === normalizedGoalName,
  );
  if (duplicate) {
    throw new Error(`An active goal named "${goalName}" already exists. Use a more specific name or archive the existing goal first.`);
  }

  if (requiresIndependentReview(access, customer)) {
    const { data: pendingGoals, error: pendingGoalsError } = await supabase
      .from("pending_client_submissions")
      .select("payload")
      .eq("customer_id", customerId)
      .eq("submission_type", "goal_create")
      .eq("review_status", "pending");
    if (pendingGoalsError) throw new Error(pendingGoalsError.message);
    const pendingDuplicate = (pendingGoals || []).some(
      (submission) =>
        String((submission.payload as Record<string, unknown> | null)?.goal_name || "")
          .trim()
          .replace(/\s+/g, " ")
          .toLowerCase() === normalizedGoalName,
    );
    if (pendingDuplicate) throw new Error(`A proposed goal named "${goalName}" is already waiting for advisor review.`);
  }

  const payload = {
    customer_id: customerId,
    goal_type: requiredText(formData, "goal_type"),
    goal_name: goalName,
    target_amount: numberValue(formData, "target_amount"),
    current_amount: numberValue(formData, "current_amount"),
    target_date: targetDate,
    priority: requiredText(formData, "priority"),
    status: "active",
  };
  const health = evaluateGoalHealth({
    currentAmount: payload.current_amount,
    targetAmount: payload.target_amount,
    createdAt: new Date(),
    targetDate: payload.target_date,
  });
  const healthFields = {
    on_track_status: health.status,
    health_score: health.score,
    health_reasons: health.reasons,
    health_evaluated_at: new Date().toISOString(),
  };

  if (requiresIndependentReview(access, customer)) {
    const { error: submissionError } = await supabase.from("pending_client_submissions").insert({
      customer_id: customerId,
      submitted_by_user_id: access.user.id,
      submission_type: "goal_create",
      payload,
    });
    if (submissionError) throw new Error(submissionError.message);

    revalidatePath("/reviews");
    revalidatePath(`/customers/${customerId}`);
    redirect(`/customers/${customerId}?saved=pending`);
  }

  const { data, error } = await supabase
    .from("financial_goals")
    .insert({ ...payload, ...healthFields })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await writeAudit({
    actor: text(formData, "actor"),
    action: "goal_created",
    entityType: "financial_goals",
    entityId: data.id,
    payload: { ...payload, ...healthFields },
  });

  revalidatePath("/");
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}?saved=goal`);
}

export async function createGoalFromForm(_previousState: GoalFormState, formData: FormData): Promise<GoalFormState> {
  try {
    await createGoal(formData);
    return { error: null };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { error: error instanceof Error ? error.message : "Goal could not be saved." };
  }
}

export async function archiveGoal(formData: FormData) {
  const supabase = await requireSupabase();
  const customerId = requiredText(formData, "customer_id");
  const { access, customer } = await requireCustomerAccess(customerId);
  if (requiresIndependentReview(access, customer)) throw new Error("Only the assigned advisor or another admin can archive this goal.");
  const goalId = requiredText(formData, "goal_id");

  const { data: goal, error: goalError } = await supabase
    .from("financial_goals")
    .select("id,goal_name,status")
    .eq("id", goalId)
    .eq("customer_id", customerId)
    .single();
  if (goalError) throw new Error(goalError.message);
  if (goal.status !== "active") redirect(`/customers/${customerId}`);

  const { error } = await supabase.from("financial_goals").update({ status: "paused" }).eq("id", goalId);
  if (error) throw new Error(error.message);

  await writeAudit({
    actor: accessDisplayName(access),
    action: "goal_archived",
    entityType: "financial_goals",
    entityId: goalId,
    payload: { customer_id: customerId, goal_name: goal.goal_name },
  });

  revalidatePath("/");
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}?saved=goal-archived`);
}

export async function completeGoal(formData: FormData) {
  const supabase = await requireSupabase();
  const customerId = requiredText(formData, "customer_id");
  const { access, customer } = await requireCustomerAccess(customerId);
  if (requiresIndependentReview(access, customer)) throw new Error("Only the assigned advisor or another admin can complete this goal.");
  const goalId = requiredText(formData, "goal_id");

  const { data: goal, error: goalError } = await supabase
    .from("financial_goals")
    .select("id,goal_name,status")
    .eq("id", goalId)
    .eq("customer_id", customerId)
    .single();
  if (goalError) throw new Error(goalError.message);
  if (goal.status !== "active") redirect(`/customers/${customerId}`);

  const { error } = await supabase.from("financial_goals").update({ status: "achieved" }).eq("id", goalId);
  if (error) throw new Error(error.message);

  await writeAudit({
    actor: accessDisplayName(access),
    action: "goal_completed",
    entityType: "financial_goals",
    entityId: goalId,
    payload: { customer_id: customerId, goal_name: goal.goal_name },
  });

  revalidatePath("/");
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}?saved=goal-completed`);
}

export async function restoreGoal(formData: FormData) {
  const supabase = await requireSupabase();
  const customerId = requiredText(formData, "customer_id");
  const { access, customer } = await requireCustomerAccess(customerId);
  if (requiresIndependentReview(access, customer)) throw new Error("Only the assigned advisor or another admin can restore this goal.");
  const goalId = requiredText(formData, "goal_id");

  const { data: goal, error: goalError } = await supabase
    .from("financial_goals")
    .select("id,goal_name,status")
    .eq("id", goalId)
    .eq("customer_id", customerId)
    .single();
  if (goalError) throw new Error(goalError.message);
  if (goal.status === "active") redirect(`/customers/${customerId}`);

  const normalizedName = goal.goal_name.trim().replace(/\s+/g, " ").toLowerCase();
  const { data: activeGoals, error: duplicateError } = await supabase
    .from("financial_goals")
    .select("id,goal_name")
    .eq("customer_id", customerId)
    .eq("status", "active");
  if (duplicateError) throw new Error(duplicateError.message);
  const duplicate = (activeGoals ?? []).some(
    (activeGoal) => activeGoal.id !== goalId && activeGoal.goal_name.trim().replace(/\s+/g, " ").toLowerCase() === normalizedName,
  );
  if (duplicate) {
    redirect(`/customers/${customerId}?error=${encodeURIComponent("Archive or rename the active goal with the same name before restoring this one.")}`);
  }

  const { error } = await supabase.from("financial_goals").update({ status: "active" }).eq("id", goalId);
  if (error) throw new Error(error.message);

  await writeAudit({
    actor: accessDisplayName(access),
    action: "goal_restored",
    entityType: "financial_goals",
    entityId: goalId,
    payload: { customer_id: customerId, goal_name: goal.goal_name, previous_status: goal.status },
  });

  revalidatePath("/");
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}?saved=goal-restored`);
}

export async function deleteEmptyGoal(formData: FormData) {
  const supabase = await requireSupabase();
  const customerId = requiredText(formData, "customer_id");
  const { access, customer } = await requireCustomerAccess(customerId);
  if (requiresIndependentReview(access, customer)) throw new Error("Only the assigned advisor or another admin can delete this goal.");
  const goalId = requiredText(formData, "goal_id");

  const { data: goal, error: goalError } = await supabase
    .from("financial_goals")
    .select("id,goal_name,status")
    .eq("id", goalId)
    .eq("customer_id", customerId)
    .single();
  if (goalError) throw new Error(goalError.message);

  const [logsResult, actionsResult, insightsResult] = await Promise.all([
    supabase.from("goal_progress_logs").select("id", { count: "exact", head: true }).eq("goal_id", goalId),
    supabase.from("next_step_actions").select("id", { count: "exact", head: true }).eq("goal_id", goalId),
    supabase.from("goal_ai_insights").select("id", { count: "exact", head: true }).eq("goal_id", goalId),
  ]);
  const relatedError = logsResult.error || actionsResult.error || insightsResult.error;
  if (relatedError) throw new Error(relatedError.message);
  const relatedCount = (logsResult.count || 0) + (actionsResult.count || 0) + (insightsResult.count || 0);
  if (relatedCount > 0) {
    redirect(
      `/customers/${customerId}?error=${encodeURIComponent("This goal has planning history and cannot be permanently deleted. Mark it completed or archive it instead.")}&goal=${goalId}#goal-${goalId}`,
    );
  }

  const { error } = await supabase.from("financial_goals").delete().eq("id", goalId).eq("customer_id", customerId);
  if (error) throw new Error(error.message);

  await writeAudit({
    actor: accessDisplayName(access),
    action: "empty_goal_deleted",
    entityType: "financial_goals",
    entityId: goalId,
    payload: { customer_id: customerId, goal_name: goal.goal_name, previous_status: goal.status },
  });

  revalidatePath("/");
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}?saved=goal-deleted`);
}

export async function applyCalculatedGoalNumber(formData: FormData) {
  const supabase = await requireSupabase();
  const customerId = requiredText(formData, "customer_id");
  const { access, customer } = await requireCustomerAccess(customerId);
  if (requiresIndependentReview(access, customer)) throw new Error("Calculated goal numbers need independent advisor review before becoming official.");
  const goalId = requiredText(formData, "goal_id");
  const targetAmount = numberValue(formData, "target_amount");

  const { data: goal, error: goalError } = await supabase
    .from("financial_goals")
    .select("*")
    .eq("id", goalId)
    .eq("customer_id", customerId)
    .single();
  if (goalError) throw new Error(goalError.message);

  const health = evaluateGoalHealth({
    currentAmount: Number(goal.current_amount),
    targetAmount,
    createdAt: goal.created_at,
    targetDate: goal.target_date,
  });

  const { error } = await supabase
    .from("financial_goals")
    .update({
      target_amount: targetAmount,
      on_track_status: health.status,
      health_score: health.score,
      health_reasons: health.reasons,
      health_evaluated_at: new Date().toISOString(),
    })
    .eq("id", goalId)
    .eq("customer_id", customerId);
  if (error) throw new Error(error.message);

  await writeAudit({
    actor: accessDisplayName(access),
    action: "goal_target_calculated",
    entityType: "financial_goals",
    entityId: goalId,
    payload: {
      previous_target_amount: goal.target_amount,
      target_amount: targetAmount,
      previous_on_track_status: goal.on_track_status,
      on_track_status: health.status,
      health_score: health.score,
      health_reasons: health.reasons,
      calculation: {
        today_cost: numberValue(formData, "today_cost"),
        years_to_goal: numberValue(formData, "years_to_goal"),
        inflation_rate: numberValue(formData, "inflation_rate"),
        expected_return: numberValue(formData, "expected_return"),
        current_savings_today: numberValue(formData, "current_savings_today"),
        projected_current_savings: numberValue(formData, "projected_current_savings"),
        projected_gap: numberValue(formData, "projected_gap"),
        required_payment: numberValue(formData, "required_payment"),
        annual_contribution: numberValue(formData, "annual_contribution"),
        contribution_frequency: text(formData, "contribution_frequency"),
        contribution_timing: text(formData, "contribution_timing"),
      },
    },
  });

  revalidatePath("/");
  revalidatePath(`/customers/${customerId}`);
  revalidatePath(`/customers/${customerId}/goals/${goalId}`);
  redirect(`/customers/${customerId}?saved=goal-number#goal-${goalId}`);
}

export async function logProgress(formData: FormData) {
  const supabase = await requireSupabase();
  const customerId = requiredText(formData, "customer_id");
  const { access, customer } = await requireCustomerAccess(customerId);
  const goalId = requiredText(formData, "goal_id");
  const loggedAmount = numberValue(formData, "logged_amount");
  const loggedBy = accessDisplayName(access);

  const { data: goal, error: goalError } = await supabase
    .from("financial_goals")
    .select("*")
    .eq("id", goalId)
    .single();
  if (goalError) throw new Error(goalError.message);

  if (requiresIndependentReview(access, customer)) {
    const { error } = await supabase.from("pending_client_submissions").insert({
      customer_id: customerId,
      submitted_by_user_id: access.user.id,
      submission_type: "goal_progress",
      payload: {
        goal_id: goalId,
        logged_amount: loggedAmount,
        notes: text(formData, "notes"),
      },
    });
    if (error) throw new Error(error.message);
    revalidatePath(`/customers/${customerId}`);
    redirect(`/customers/${customerId}?saved=pending#goal-${goalId}`);
  }

  const health = evaluateGoalHealth({
    currentAmount: loggedAmount,
    targetAmount: Number(goal.target_amount),
    createdAt: goal.created_at,
    targetDate: goal.target_date,
  });

  const { data: log, error: logError } = await supabase
    .from("goal_progress_logs")
    .insert({
      goal_id: goalId,
      logged_amount: loggedAmount,
      logged_by: loggedBy,
      notes: text(formData, "notes"),
      on_track_status: health.status,
    })
    .select("id")
    .single();
  if (logError) throw new Error(logError.message);

  const { error: updateError } = await supabase
    .from("financial_goals")
    .update({
      current_amount: loggedAmount,
      on_track_status: health.status,
      health_score: health.score,
      health_reasons: health.reasons,
      health_evaluated_at: new Date().toISOString(),
    })
    .eq("id", goalId);
  if (updateError) throw new Error(updateError.message);

  await writeAudit({
    actor: loggedBy,
    action: "progress_logged",
    entityType: "goal_progress_logs",
    entityId: log.id,
    payload: {
      goal_id: goalId,
      logged_amount: loggedAmount,
      previous_status: goal.on_track_status,
      on_track_status: health.status,
      health_score: health.score,
      health_reasons: health.reasons,
    },
  });

  revalidatePath("/");
  revalidatePath(`/customers/${customerId}`);
  revalidatePath(`/customers/${customerId}/goals/${goalId}`);
  redirect(`/customers/${customerId}?saved=progress#goal-${goalId}`);
}

export async function createNextStepAction(formData: FormData) {
  const supabase = await requireSupabase();
  const customerId = requiredText(formData, "customer_id");
  const { access, customer } = await requireCustomerAccess(customerId);
  if (requiresIndependentReview(access, customer)) throw new Error("Only the assigned advisor or another admin can create next-step actions.");
  const goalId = text(formData, "goal_id");
  const payload = {
    customer_id: customerId,
    goal_id: goalId,
    action_title: requiredText(formData, "action_title"),
    action_description: text(formData, "action_description"),
    assigned_to: requiredText(formData, "assigned_to"),
    due_date: requiredText(formData, "due_date"),
    priority: requiredText(formData, "priority"),
  };

  const { data, error } = await supabase.from("next_step_actions").insert(payload).select("id").single();
  if (error) throw new Error(error.message);

  await writeAudit({
    actor: payload.assigned_to,
    action: "action_created",
    entityType: "next_step_actions",
    entityId: data.id,
    payload,
  });

  revalidatePath("/");
  revalidatePath(`/customers/${customerId}`);
  if (goalId) revalidatePath(`/customers/${customerId}/goals/${goalId}`);
  redirect(`/customers/${customerId}?saved=action${goalId ? `#goal-${goalId}` : ""}`);
}

export async function updateGoalPriority(formData: FormData) {
  const supabase = await requireSupabase();
  const customerId = requiredText(formData, "customer_id");
  const { access, customer } = await requireCustomerAccess(customerId);
  if (requiresIndependentReview(access, customer)) throw new Error("Goal priority changes need independent advisor review.");
  const goalId = requiredText(formData, "goal_id");
  const priority = requiredText(formData, "priority");
  const actor = text(formData, "actor");

  if (!["high", "medium", "low"].includes(priority)) {
    throw new Error("Priority must be high, medium, or low.");
  }

  const { data: goal, error: goalError } = await supabase
    .from("financial_goals")
    .select("priority")
    .eq("id", goalId)
    .single();
  if (goalError) throw new Error(goalError.message);

  const { error } = await supabase.from("financial_goals").update({ priority }).eq("id", goalId);
  if (error) throw new Error(error.message);

  await writeAudit({
    actor,
    action: "goal_priority_updated",
    entityType: "financial_goals",
    entityId: goalId,
    payload: { previous_priority: goal.priority, priority },
  });

  revalidatePath("/");
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}?saved=priority#goal-setting-list`);
}

export async function completeNextStepAction(formData: FormData) {
  const supabase = await requireSupabase();
  const actionId = requiredText(formData, "action_id");
  const customerId = requiredText(formData, "customer_id");
  const { access, customer } = await requireCustomerAccess(customerId);
  if (requiresIndependentReview(access, customer)) throw new Error("Only the assigned advisor or another admin can complete next-step actions.");
  const goalId = text(formData, "goal_id");
  const actor = requiredText(formData, "actor");

  const { error } = await supabase
    .from("next_step_actions")
    .update({ completed: true, completed_at: new Date().toISOString() })
    .eq("id", actionId)
    .eq("completed", false);
  if (error) throw new Error(error.message);

  await writeAudit({
    actor,
    action: "action_completed",
    entityType: "next_step_actions",
    entityId: actionId,
    payload: { completed: true, goal_id: goalId },
  });

  revalidatePath("/");
  revalidatePath(`/customers/${customerId}`);
  if (goalId) revalidatePath(`/customers/${customerId}/goals/${goalId}`);
  redirect(`/customers/${customerId}?saved=completed${goalId ? `#goal-${goalId}` : ""}`);
}

function monthlyEquivalent(amountInput: unknown, frequencyInput: unknown) {
  const amount = Number(amountInput) || 0;
  const frequency = String(frequencyInput || "monthly");
  if (frequency === "weekly") return (amount * 52) / 12;
  if (frequency === "quarterly") return amount / 3;
  if (frequency === "annual") return amount / 12;
  if (frequency === "one_time") return 0;
  return amount;
}

export async function createPlanDraft(formData: FormData) {
  const supabase = await requireSupabase();
  const customerId = requiredText(formData, "customer_id");
  const { access, customer } = await requireCustomerAccess(customerId);
  if ((!access.isAdmin && !access.isAgent) || requiresIndependentReview(access, customer)) {
    throw new Error("Only the assigned adviser or an admin can create an official plan draft.");
  }
  if (!customer.agency_id) throw new Error("This customer is not connected to an agency yet.");

  const [goalsResult, statementsResult, actionsResult, latestResult] = await Promise.all([
    supabase.from("financial_goals").select("*").eq("customer_id", customerId).order("created_at", { ascending: true }),
    supabase.from("financial_statement_items").select("*").eq("customer_id", customerId).order("statement_date", { ascending: false }),
    supabase.from("next_step_actions").select("*").eq("customer_id", customerId).order("created_at", { ascending: false }),
    supabase.from("cfp_plan_documents").select("version_number").eq("customer_id", customerId).order("version_number", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const queryError = goalsResult.error || statementsResult.error || actionsResult.error || latestResult.error;
  if (queryError) throw new Error(queryError.message);

  const goals = goalsResult.data || [];
  const statements = statementsResult.data || [];
  const nextActions = actionsResult.data || [];
  const balanceItems = statements.filter((item) => item.statement_type === "balance_sheet");
  const cashFlowItems = statements.filter((item) => item.statement_type === "cash_flow");
  const assets = balanceItems.filter((item) => item.item_type === "asset").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const liabilities = balanceItems.filter((item) => item.item_type === "liability").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const monthlyIncome = cashFlowItems
    .filter((item) => item.item_type === "income")
    .reduce((sum, item) => sum + monthlyEquivalent(item.amount, item.frequency), 0);
  const monthlyExpenses = cashFlowItems
    .filter((item) => item.item_type === "expense")
    .reduce((sum, item) => sum + monthlyEquivalent(item.amount, item.frequency), 0);
  const versionNumber = Number(latestResult.data?.version_number || 0) + 1;
  const title = text(formData, "title") || `${customer.full_name} CFP Plan`;
  const snapshot = {
    generated_at: new Date().toISOString(),
    customer,
    goals,
    statements,
    next_actions: nextActions,
    summary: {
      total_assets: assets,
      total_liabilities: liabilities,
      net_worth: assets - liabilities,
      monthly_income: monthlyIncome,
      monthly_expenses: monthlyExpenses,
      monthly_surplus: monthlyIncome - monthlyExpenses,
    },
  };

  const { data: document, error } = await supabase
    .from("cfp_plan_documents")
    .insert({
      agency_id: customer.agency_id,
      customer_id: customerId,
      version_number: versionNumber,
      title,
      snapshot,
      created_by: access.user.id,
      created_by_name: accessDisplayName(access),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await writeAudit({
    actor: accessDisplayName(access),
    action: "plan_draft_created",
    entityType: "cfp_plan_documents",
    entityId: document.id,
    payload: { customer_id: customerId, customer_name: customer.full_name, version_number: versionNumber, title },
  });
  revalidatePath(`/customers/${customerId}/plan`);
  redirect(`/customers/${customerId}/plan?document=${document.id}&notice=created`);
}

export async function submitPlanForReview(formData: FormData) {
  const supabase = await requireSupabase();
  const customerId = requiredText(formData, "customer_id");
  const documentId = requiredText(formData, "document_id");
  const { access, customer } = await requireCustomerAccess(customerId);
  if ((!access.isAdmin && !access.isAgent) || requiresIndependentReview(access, customer)) {
    throw new Error("Only the assigned adviser or an admin can submit this plan.");
  }
  const { data: document, error: readError } = await supabase
    .from("cfp_plan_documents")
    .select("status,version_number,title")
    .eq("id", documentId)
    .eq("customer_id", customerId)
    .single();
  if (readError) throw new Error(readError.message);
  if (!document || !["draft", "rejected"].includes(document.status)) throw new Error("Only a draft or rejected plan can be submitted.");

  const { error } = await supabase
    .from("cfp_plan_documents")
    .update({ status: "in_review", submitted_at: new Date().toISOString(), reviewed_by: null, reviewed_by_name: null, reviewed_at: null, review_notes: null })
    .eq("id", documentId);
  if (error) throw new Error(error.message);
  await writeAudit({
    actor: accessDisplayName(access),
    action: "plan_submitted_for_review",
    entityType: "cfp_plan_documents",
    entityId: documentId,
    payload: { customer_id: customerId, version_number: document.version_number, title: document.title },
  });
  revalidatePath(`/customers/${customerId}/plan`);
  redirect(`/customers/${customerId}/plan?document=${documentId}&notice=submitted`);
}

export async function reviewPlanDocument(formData: FormData) {
  const supabase = await requireSupabase();
  const customerId = requiredText(formData, "customer_id");
  const documentId = requiredText(formData, "document_id");
  const decision = requiredText(formData, "decision");
  const notes = text(formData, "review_notes");
  const { access } = await requireCustomerAccess(customerId);
  if (!access.isAdmin) throw new Error("Only an admin can approve or reject an official CFP plan.");
  if (!["approved", "rejected"].includes(decision)) throw new Error("Choose approve or reject.");

  const { data: document, error: readError } = await supabase
    .from("cfp_plan_documents")
    .select("status,version_number,title")
    .eq("id", documentId)
    .eq("customer_id", customerId)
    .single();
  if (readError) throw new Error(readError.message);
  if (!document || document.status !== "in_review") throw new Error("This plan is not waiting for review.");

  if (decision === "approved") {
    const { error: supersedeError } = await supabase
      .from("cfp_plan_documents")
      .update({ status: "superseded" })
      .eq("customer_id", customerId)
      .eq("status", "approved")
      .neq("id", documentId);
    if (supersedeError) throw new Error(supersedeError.message);
  }
  const { error } = await supabase
    .from("cfp_plan_documents")
    .update({
      status: decision,
      reviewed_by: access.user.id,
      reviewed_by_name: accessDisplayName(access),
      reviewed_at: new Date().toISOString(),
      review_notes: notes,
    })
    .eq("id", documentId);
  if (error) throw new Error(error.message);
  await writeAudit({
    actor: accessDisplayName(access),
    action: `plan_${decision}`,
    entityType: "cfp_plan_documents",
    entityId: documentId,
    payload: { customer_id: customerId, version_number: document.version_number, title: document.title, review_notes: notes },
  });
  revalidatePath(`/customers/${customerId}/plan`);
  redirect(`/customers/${customerId}/plan?document=${documentId}&notice=${decision}`);
}
