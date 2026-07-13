"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { accessDisplayName, requireCurrentAccess } from "@/lib/cfp/access";
import { createCfpServerClient } from "@/lib/cfp/supabase";
import { createClient as createAuthClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim() || null;
}

export async function updateOwnProfile(formData: FormData) {
  const access = await requireCurrentAccess();
  const fullName = value(formData, "full_name");
  if (!fullName) throw new Error("Full name is required.");

  const supabase = await createCfpServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const { error } = await supabase.rpc("cfp_update_own_profile", {
    profile_full_name: fullName,
    profile_phone: value(formData, "phone"),
    profile_job_title: value(formData, "job_title"),
    profile_agency_name: value(formData, "agency_name"),
    profile_agency_registration_no: value(formData, "agency_registration_no"),
    profile_license_no: value(formData, "license_no"),
    profile_branch_name: value(formData, "branch_name"),
    profile_bio: value(formData, "bio"),
  });
  if (error) throw new Error(error.message);

  const auth = await createAuthClient();
  await auth.auth.updateUser({ data: { full_name: fullName } });

  await supabase.from("audit_logs").insert({
    user_id: access.user.id,
    actor: fullName || accessDisplayName(access),
    action: "staff_profile_updated",
    entity_type: "user_profiles",
    entity_id: access.user.id,
    payload: { full_name: fullName },
  });

  revalidatePath("/profile");
  revalidatePath("/admin/access");
  redirect("/profile?saved=1");
}
