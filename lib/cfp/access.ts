import { redirect } from "next/navigation";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { createCfpClient, type Customer } from "./supabase";

export type UserRole = "admin" | "agent" | "client";
export type UserProfile = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  status: "active" | "pending" | "inactive";
  created_at: string;
};

export type AccessContext = {
  user: { id: string; email: string };
  profile: UserProfile;
  isAdmin: boolean;
  isAgent: boolean;
  isClient: boolean;
};

const firstAdminEmail = "raycole_nkg1990@hotmail.com";

function normalizeEmail(email?: string | null) {
  return String(email || "").trim().toLowerCase();
}

function activeRoleFor(email: string, existing?: UserProfile | null): Pick<UserProfile, "role" | "status"> {
  if (normalizeEmail(email) === firstAdminEmail) return { role: "admin", status: "active" };
  if (existing) return { role: existing.role, status: existing.status };
  return { role: "client", status: "pending" };
}

export async function getCurrentAccess(): Promise<AccessContext | null> {
  const auth = await createAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  const email = normalizeEmail(user?.email);
  if (!user || !email) return null;

  const supabase = createCfpClient();
  if (!supabase) return null;

  const { data: existing } = await supabase.from("user_profiles").select("*").eq("id", user.id).maybeSingle();
  const profileSeed = activeRoleFor(email, existing as UserProfile | null);

  const payload = {
    id: user.id,
    email,
    full_name: existing?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || email,
    role: profileSeed.role,
    status: profileSeed.status,
  };

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const typedProfile = profile as UserProfile;
  return {
    user: { id: user.id, email },
    profile: typedProfile,
    isAdmin: typedProfile.role === "admin" && typedProfile.status === "active",
    isAgent: typedProfile.role === "agent" && typedProfile.status === "active",
    isClient: typedProfile.role === "client" && typedProfile.status === "active",
  };
}

export async function requireCurrentAccess() {
  const access = await getCurrentAccess();
  if (!access) redirect("/login");
  return access;
}

export function canAccessCustomer(access: AccessContext, customer: Pick<Customer, "assigned_agent_user_id" | "client_user_id" | "email">) {
  if (access.isAdmin) return true;
  if (access.isAgent) return customer.assigned_agent_user_id === access.user.id;
  if (access.isClient) {
    return customer.client_user_id === access.user.id || normalizeEmail(customer.email) === access.user.email;
  }
  return false;
}

export function filterCustomersForAccess<T extends Pick<Customer, "assigned_agent_user_id" | "client_user_id" | "email">>(
  access: AccessContext,
  customers: T[],
) {
  return customers.filter((customer) => canAccessCustomer(access, customer));
}
