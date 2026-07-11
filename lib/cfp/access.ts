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

function fallbackProfile(user: { id: string; email: string }, fullName?: string | null): UserProfile {
  const seed = activeRoleFor(user.email);
  return {
    id: user.id,
    email: user.email,
    full_name: fullName || user.email,
    role: seed.role,
    status: seed.status,
    created_at: new Date().toISOString(),
  };
}

function accessFromProfile(user: { id: string; email: string }, profile: UserProfile): AccessContext {
  return {
    user,
    profile,
    isAdmin: profile.role === "admin" && profile.status === "active",
    isAgent: profile.role === "agent" && profile.status === "active",
    isClient: profile.role === "client" && profile.status === "active",
  };
}

export async function getCurrentAccess(): Promise<AccessContext | null> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }

  let user;
  try {
    const auth = await createAuthClient();
    const result = await auth.auth.getUser();
    user = result.data.user;
  } catch {
    return null;
  }

  const email = normalizeEmail(user?.email);
  if (!user || !email) return null;

  const supabase = createCfpClient();
  const userIdentity = { id: user.id, email };
  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || email;
  if (!supabase) return accessFromProfile(userIdentity, fallbackProfile(userIdentity, fullName));

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
  if (error) {
    return accessFromProfile(userIdentity, fallbackProfile(userIdentity, fullName));
  }

  const typedProfile = profile as UserProfile;
  return accessFromProfile(userIdentity, typedProfile);
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
