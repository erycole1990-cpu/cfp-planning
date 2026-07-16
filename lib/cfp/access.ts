import { redirect } from "next/navigation";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { createCfpServerClient, type Customer } from "./supabase";

export type UserRole = "admin" | "agent" | "client";
export type UserProfile = {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  status: "active" | "pending" | "inactive";
  phone: string | null;
  job_title: string | null;
  agency_name: string | null;
  agency_registration_no: string | null;
  license_no: string | null;
  branch_name: string | null;
  bio: string | null;
  advisor_code: string | null;
  accepting_new_clients: boolean;
  updated_at: string;
  created_at: string;
};

export type AccessContext = {
  user: { id: string; email: string };
  profile: UserProfile;
  isAdmin: boolean;
  isAgent: boolean;
  isClient: boolean;
};

export function accessDisplayName(access: AccessContext) {
  const profileName = String(access.profile.full_name || "").trim();
  if (profileName && normalizeEmail(profileName) !== access.user.email) return profileName;
  if (access.isAdmin) return "Administrator";
  if (access.isAgent) return "Advisor";
  return "Client";
}

const firstAdminEmail = "raycole_nkg1990@hotmail.com";

function normalizeEmail(email?: string | null) {
  return String(email || "").trim().toLowerCase();
}

function requestedRoleFor(user: { user_metadata?: Record<string, unknown> } | null | undefined): "agent" | "client" {
  return user?.user_metadata?.requested_role === "agent" ? "agent" : "client";
}

function activeRoleFor(
  email: string,
  existing?: UserProfile | null,
  requestedRole: "agent" | "client" = "client",
): Pick<UserProfile, "role" | "status"> {
  if (normalizeEmail(email) === firstAdminEmail) return { role: "admin", status: "active" };
  if (existing) return { role: existing.role, status: existing.status };
  return { role: requestedRole, status: "pending" };
}

function fallbackProfile(user: { id: string; email: string }, fullName?: string | null, requestedRole: "agent" | "client" = "client"): UserProfile {
  const seed = activeRoleFor(user.email, null, requestedRole);
  return {
    id: user.id,
    email: user.email,
    full_name: fullName || user.email,
    role: seed.role,
    status: seed.status,
    phone: null,
    job_title: null,
    agency_name: null,
    agency_registration_no: null,
    license_no: null,
    branch_name: null,
    bio: null,
    advisor_code: null,
    accepting_new_clients: false,
    updated_at: new Date().toISOString(),
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

  const supabase = await createCfpServerClient();
  const userIdentity = { id: user.id, email };
  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || email;
  const requestedRole = requestedRoleFor(user);
  if (!supabase) return accessFromProfile(userIdentity, fallbackProfile(userIdentity, fullName, requestedRole));

  try {
    const { data: requestedProfile, error: requestError } = await supabase
      .rpc("cfp_request_user_profile", {
        requested_role: requestedRole,
        requested_full_name: fullName,
      })
      .single();

    if (!requestError && requestedProfile) {
      return accessFromProfile(userIdentity, requestedProfile as UserProfile);
    }

    const { data: existing } = await supabase.from("user_profiles").select("*").eq("id", user.id).maybeSingle();
    const profileSeed = activeRoleFor(email, existing as UserProfile | null, requestedRole);

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
      return accessFromProfile(userIdentity, fallbackProfile(userIdentity, fullName, requestedRole));
    }

    const typedProfile = profile as UserProfile;
    return accessFromProfile(userIdentity, typedProfile);
  } catch {
    return accessFromProfile(userIdentity, fallbackProfile(userIdentity, fullName, requestedRole));
  }
}

export async function requireCurrentAccess(options?: { skipAdminMfa?: boolean }) {
  const access = await getCurrentAccess();
  if (!access) redirect("/login");

  if (access.isAdmin && !options?.skipAdminMfa) {
    const auth = await createAuthClient();
    const [{ data: factors }, { data: assurance }] = await Promise.all([
      auth.auth.mfa.listFactors(),
      auth.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    const hasVerifiedTotp = (factors?.totp || []).some((factor) => factor.status === "verified");
    if (!hasVerifiedTotp || assurance?.currentLevel !== "aal2") {
      redirect("/account/mfa");
    }
  }

  return access;
}

export function isPersonalCustomer(
  access: AccessContext,
  customer: Pick<Customer, "client_user_id">,
) {
  return customer.client_user_id === access.user.id;
}

export function canAccessCustomer(access: AccessContext, customer: Pick<Customer, "assigned_agent_user_id" | "client_user_id" | "email">) {
  if (isPersonalCustomer(access, customer)) return true;
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

export function filterOperationalCustomersForAccess<
  T extends Pick<Customer, "assigned_agent_user_id" | "client_user_id" | "email">,
>(access: AccessContext, customers: T[]) {
  const accessible = filterCustomersForAccess(access, customers);
  if (!access.isAdmin && !access.isAgent) return accessible;
  return accessible.filter((customer) => !isPersonalCustomer(access, customer));
}
