"use server";

import { redirect } from "next/navigation";
import { requireCurrentAccess } from "@/lib/cfp/access";
import { createCfpServerClient } from "@/lib/cfp/supabase";

export type PersonalPlanState = {
  error: string | null;
};

function value(formData: FormData, key: string) {
  const result = String(formData.get(key) ?? "").trim();
  return result || null;
}

function isRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function createPersonalPlan(
  _previousState: PersonalPlanState,
  formData: FormData,
): Promise<PersonalPlanState> {
  try {
    const access = await requireCurrentAccess();
    if (access.profile.status !== "active") {
      return { error: "Your account must be active before creating a personal plan." };
    }

    const fullName = value(formData, "full_name");
    if (!fullName) return { error: "Full name is required." };

    const supabase = await createCfpServerClient();
    if (!supabase) return { error: "The database is not configured for this deployment." };

    const { data, error } = await supabase.rpc("cfp_create_personal_portfolio", {
      customer_payload: {
        full_name: fullName,
        email: access.user.email,
        phone: value(formData, "phone"),
        date_of_birth: value(formData, "date_of_birth"),
        risk_profile: value(formData, "risk_profile") || "moderate",
        advisor_code: value(formData, "advisor_code"),
        notes: value(formData, "notes"),
      },
    });

    if (error) return { error: error.message };
    const customerId = String(data || "");
    if (!customerId) return { error: "The personal plan was not created." };

    redirect(`/customers/${customerId}?saved=personal-plan`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { error: error instanceof Error ? error.message : "The personal plan could not be created." };
  }
}
