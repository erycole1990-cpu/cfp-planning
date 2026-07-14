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
  const destination = safeDestination(formData.get("href"));
  const supabase = await createCfpServerClient();
  if (supabase && id) {
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
