"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { calculateOnTrackStatus } from "@/lib/cfp/status";
import { createCfpServerClient, type Customer } from "@/lib/cfp/supabase";
import { canAccessCustomer, requireCurrentAccess } from "@/lib/cfp/access";

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
    actor: input.actor || "system",
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    payload: input.payload,
  });
  if (error) throw new Error(error.message);
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

export async function createCustomer(formData: FormData) {
  const access = await requireCurrentAccess();
  if (!access.isAdmin && !access.isAgent) throw new Error("Only admins and agents can add customers.");
  const supabase = await requireSupabase();
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
    assigned_advisor_name: access.isAgent ? access.profile.full_name || access.user.email : requiredText(formData, "assigned_advisor_name"),
    assigned_agent_user_id: access.isAgent ? access.user.id : null,
    client_stage: "lead",
    notes: text(formData, "notes"),
  };

  const { data, error } = await supabase.from("customers").insert(payload).select("id").single();
  if (error) throw new Error(error.message);

  await writeAudit({
    actor: payload.assigned_advisor_name,
    action: "customer_created",
    entityType: "customers",
    entityId: data.id,
    payload,
  });

  revalidatePath("/");
  revalidatePath("/customers");
  redirect(`/customers/${data.id}?saved=customer`);
}

export async function updateCustomer(formData: FormData) {
  const supabase = await requireSupabase();
  const customerId = requiredText(formData, "customer_id");
  const { access } = await requireCustomerAccess(customerId);
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
    assigned_advisor_name: access.isClient ? undefined : requiredText(formData, "assigned_advisor_name"),
    notes: text(formData, "notes"),
  };

  const cleanPayload = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
  const { error } = await supabase.from("customers").update(cleanPayload).eq("id", customerId);
  if (error) throw new Error(error.message);

  await writeAudit({
    actor: access.profile.full_name || access.user.email,
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
  const { access } = await requireCustomerAccess(customerId);
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

  if (access.isClient) {
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
  const { access } = await requireCustomerAccess(customerId);
  if (access.isClient) throw new Error("Client-submitted official records need advisor review.");
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
  const { access } = await requireCustomerAccess(customerId);
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

  if (access.isClient) {
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
  const { access } = await requireCustomerAccess(customerId);
  if (access.isClient) throw new Error("Goals need advisor review before becoming official.");
  const targetDate = requiredText(formData, "target_date");
  const targetDateValue = new Date(`${targetDate}T00:00:00`);
  if (targetDateValue < new Date(new Date().toDateString())) {
    throw new Error("Target date must be today or later.");
  }

  const payload = {
    customer_id: customerId,
    goal_type: requiredText(formData, "goal_type"),
    goal_name: requiredText(formData, "goal_name"),
    target_amount: numberValue(formData, "target_amount"),
    current_amount: numberValue(formData, "current_amount"),
    target_date: targetDate,
    priority: requiredText(formData, "priority"),
    status: "active",
  };
  const on_track_status = calculateOnTrackStatus({
    currentAmount: payload.current_amount,
    targetAmount: payload.target_amount,
    createdAt: new Date(),
    targetDate: payload.target_date,
  });

  const { data, error } = await supabase
    .from("financial_goals")
    .insert({ ...payload, on_track_status })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await writeAudit({
    actor: text(formData, "actor"),
    action: "goal_created",
    entityType: "financial_goals",
    entityId: data.id,
    payload: { ...payload, on_track_status },
  });

  revalidatePath("/");
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}?saved=goal`);
}

export async function logProgress(formData: FormData) {
  const supabase = await requireSupabase();
  const customerId = requiredText(formData, "customer_id");
  const { access } = await requireCustomerAccess(customerId);
  if (access.isClient) throw new Error("Progress updates need advisor review before becoming official.");
  const goalId = requiredText(formData, "goal_id");
  const loggedAmount = numberValue(formData, "logged_amount");
  const loggedBy = requiredText(formData, "logged_by");

  const { data: goal, error: goalError } = await supabase
    .from("financial_goals")
    .select("*")
    .eq("id", goalId)
    .single();
  if (goalError) throw new Error(goalError.message);

  const onTrackStatus = calculateOnTrackStatus({
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
      on_track_status: onTrackStatus,
    })
    .select("id")
    .single();
  if (logError) throw new Error(logError.message);

  const { error: updateError } = await supabase
    .from("financial_goals")
    .update({ current_amount: loggedAmount, on_track_status: onTrackStatus })
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
      on_track_status: onTrackStatus,
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
  const { access } = await requireCustomerAccess(customerId);
  if (access.isClient) throw new Error("Only advisors can create next-step actions.");
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
  const { access } = await requireCustomerAccess(customerId);
  if (access.isClient) throw new Error("Goal priority changes need advisor review.");
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
  const { access } = await requireCustomerAccess(customerId);
  if (access.isClient) throw new Error("Only advisors can complete next-step actions.");
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
