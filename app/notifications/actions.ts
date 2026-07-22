"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentAccess } from "@/lib/cfp/access";
import { createCfpServerClient } from "@/lib/cfp/supabase";

function safeDestination(value: FormDataEntryValue | null) {
  const href = String(value || "/notifications");
  return href.startsWith("/") && !href.startsWith("//") ? href : "/notifications";
}

export async function openNotification(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = String(formData.get("notification_id") || "");
  let destination = safeDestination(formData.get("href"));
  const supabase = await createCfpServerClient();
  if (supabase && id) {
    const { data: notification } = await supabase
      .from("notifications")
      .select("href,notification_type,submission_id")
      .eq("id", id)
      .eq("recipient_user_id", access.user.id)
      .maybeSingle();
    destination = safeDestination(notification?.href || destination);

    if (notification?.notification_type === "submission_received" && notification.submission_id) {
      const { data: submission, error: submissionError } = await supabase
        .from("pending_client_submissions")
        .select("review_status")
        .eq("id", notification.submission_id)
        .maybeSingle();
      if (!submissionError && (!submission || submission.review_status !== "pending")) {
        const now = new Date().toISOString();
        await supabase
          .from("notifications")
          .update({ workflow_status: "resolved", resolved_at: now, snoozed_until: null, read_at: now })
          .eq("id", id)
          .eq("recipient_user_id", access.user.id);
        revalidatePath("/notifications");
        revalidatePath("/");
        redirect("/notifications?view=resolved&task=completed");
      }
    }

    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("recipient_user_id", access.user.id);
  }
  redirect(destination);
}

export async function markAllNotificationsRead() {
  const access = await requireCurrentAccess();
  const supabase = await createCfpServerClient();
  if (supabase) {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_user_id", access.user.id)
      .is("read_at", null);
  }
  revalidatePath("/notifications");
  revalidatePath("/");
}

export async function updateNotificationWorkflow(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = String(formData.get("notification_id") || "");
  const action = String(formData.get("workflow_action") || "");
  const supabase = await createCfpServerClient();
  if (!supabase || !id) return;

  const now = new Date();
  let update: Record<string, string | null>;
  if (action === "resolve") {
    update = {
      workflow_status: "resolved",
      resolved_at: now.toISOString(),
      snoozed_until: null,
      read_at: now.toISOString(),
    };
  } else if (action === "snooze_day" || action === "snooze_week") {
    const days = action === "snooze_week" ? 7 : 1;
    const snoozedUntil = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    update = {
      workflow_status: "snoozed",
      snoozed_until: snoozedUntil.toISOString(),
      resolved_at: null,
      read_at: now.toISOString(),
    };
  } else {
    update = {
      workflow_status: "open",
      snoozed_until: null,
      resolved_at: null,
    };
  }

  await supabase
    .from("notifications")
    .update(update)
    .eq("id", id)
    .eq("recipient_user_id", access.user.id);

  revalidatePath("/notifications");
  revalidatePath("/");
}

export async function updateNotificationAccountability(formData: FormData) {
  const access = await requireCurrentAccess();
  const id = String(formData.get("notification_id") || "");
  const priority = String(formData.get("priority") || "normal");
  const dueDate = String(formData.get("due_date") || "");
  if (!id || !["low", "normal", "high", "urgent"].includes(priority)) return;
  const supabase = await createCfpServerClient();
  if (!supabase) return;
  const dueAt = dueDate ? new Date(`${dueDate}T17:00:00+08:00`).toISOString() : null;
  await supabase
    .from("notifications")
    .update({ priority, due_at: dueAt, escalated_at: priority === "urgent" ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("recipient_user_id", access.user.id);
  revalidatePath("/notifications");
  revalidatePath("/");
}
