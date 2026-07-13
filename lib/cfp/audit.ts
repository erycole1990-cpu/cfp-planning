type AuditPayload = Record<string, unknown> | null | undefined;

export type AuditDetail = {
  label: string;
  value: string;
  tone?: "success" | "warning" | "danger";
};

const actionLabels: Record<string, string> = {
  action_completed: "Next step completed",
  action_created: "Next step added",
  client_submission_approved: "Client update approved",
  client_submission_rejected: "Client update rejected",
  customer_assignment_notification_resent: "Assignment email resent",
  customer_created: "Customer added",
  customer_reassigned: "Customer reassigned",
  customer_service_ended: "Customer service ended",
  customer_service_reactivated: "Customer service reactivated",
  customer_updated: "Customer profile updated",
  empty_goal_deleted: "Empty goal deleted",
  financial_statement_item_created: "Financial record added",
  financial_statement_item_deleted: "Financial record removed",
  financial_statement_items_imported: "Financial records imported",
  goal_archived: "Goal archived",
  goal_completed: "Goal completed",
  goal_created: "Goal added",
  goal_priority_updated: "Goal priority changed",
  goal_restored: "Goal restored",
  goal_target_calculated: "Goal target recalculated",
  progress_logged: "Goal progress updated",
  staff_profile_updated: "Staff profile updated",
  user_access_updated: "User access changed",
  user_profile_synced: "Login profile recovered",
};

const entityLabels: Record<string, string> = {
  audit_logs: "Audit record",
  customers: "Customer",
  financial_goals: "Goal",
  financial_statement_items: "Financial record",
  goal_progress_logs: "Progress update",
  next_step_actions: "Next step",
  pending_client_submissions: "Client submission",
  user_profiles: "User",
};

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined || value === "") return "Not recorded";
  return JSON.stringify(value);
}

function read(payload: AuditPayload, key: string) {
  return payload?.[key];
}

export function auditActionLabel(action: string) {
  return actionLabels[action] || titleCase(action);
}

export function auditEntityLabel(entity: string) {
  return entityLabels[entity] || titleCase(entity);
}

export function assignmentEmailDetail(value: unknown): AuditDetail {
  const notification = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const status = String(notification.status || "not_sent");
  const message = String(notification.message || "");
  const lowerMessage = message.toLowerCase();

  if (status === "sent") return { label: "Email", value: "Sent to the assigned agent", tone: "success" };
  if (status === "not_configured") return { label: "Email", value: "Not sent because email delivery is not configured", tone: "warning" };
  if (status === "skipped") return { label: "Email", value: "Not sent because the agent has no email address", tone: "warning" };
  if (lowerMessage.includes("only send testing emails") || lowerMessage.includes("verify a domain")) {
    return { label: "Email", value: "Blocked by Resend test mode. Verify a sending domain to email other agents.", tone: "danger" };
  }
  if (status === "failed") return { label: "Email", value: "Delivery failed. Use Resend Notice after fixing the email setup.", tone: "danger" };
  return { label: "Email", value: "No email delivery was recorded", tone: "warning" };
}

export function auditDetails(action: string, payload: AuditPayload): AuditDetail[] {
  const details: AuditDetail[] = [];
  const add = (label: string, key: string) => {
    const value = read(payload, key);
    if (value !== null && value !== undefined && value !== "") details.push({ label, value: displayValue(value) });
  };

  if (action === "customer_reassigned" || action === "customer_assignment_notification_resent") {
    add("Customer", "customer_name");
    if (action === "customer_reassigned") {
      add("Previous advisor", "previous_advisor_name");
      add("New advisor", "assigned_advisor_name");
    } else {
      add("Assigned advisor", "assigned_advisor_name");
    }
    add("Reason", "reason");
    add("Agent email", "agent_email");
    details.push(assignmentEmailDetail(read(payload, "email_notification")));
    return details;
  }

  const preferredFields: Array<[string, string]> = [
    ["Customer", "customer_name"],
    ["Goal", "goal_name"],
    ["Name", "full_name"],
    ["Email", "email"],
    ["Role", "role"],
    ["Status", "status"],
    ["Decision", "decision"],
    ["Reason", "reason"],
    ["Notes", "notes"],
    ["Amount", "amount"],
    ["Target amount", "target_amount"],
    ["Previous value", "previous_value"],
    ["New value", "new_value"],
  ];
  for (const [label, key] of preferredFields) add(label, key);

  if (!details.length && payload) {
    for (const [key, value] of Object.entries(payload)) {
      if (key.endsWith("_id") || key === "email_notification" || typeof value === "object") continue;
      if (value === null || value === undefined || value === "") continue;
      details.push({ label: titleCase(key), value: displayValue(value) });
      if (details.length === 4) break;
    }
  }

  return details.length ? details : [{ label: "Summary", value: "Change recorded successfully" }];
}
