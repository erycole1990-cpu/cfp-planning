import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

export type Customer = {
  id: string;
  created_at: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  nric_passport: string | null;
  nationality: string | null;
  marital_status: string | null;
  number_of_dependents: number | null;
  residential_address: string | null;
  employment_status: string | null;
  occupation: string | null;
  employer_name: string | null;
  monthly_income_range: string | null;
  source_of_funds: string | null;
  source_of_wealth: string | null;
  service_status: string | null;
  service_ended_at: string | null;
  service_ended_reason: string | null;
  assigned_agent_user_id: string | null;
  client_user_id: string | null;
  client_stage: string | null;
  risk_profile: string | null;
  assigned_advisor_name: string | null;
  notes: string | null;
};

export type FinancialGoal = {
  id: string;
  created_at: string;
  customer_id: string;
  goal_type: string;
  goal_name: string;
  target_amount: number | string;
  current_amount: number | string;
  target_date: string;
  priority: string;
  status: string;
  on_track_status: string;
};

export type GoalProgressLog = {
  id: string;
  created_at: string;
  goal_id: string;
  logged_amount: number | string;
  logged_by: string | null;
  notes: string | null;
  on_track_status: string;
};

export type NextStepAction = {
  id: string;
  created_at: string;
  customer_id: string;
  goal_id: string | null;
  action_title: string;
  action_description: string | null;
  assigned_to: string | null;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  priority: string;
};

export type FinancialStatementItem = {
  id: string;
  created_at: string;
  customer_id: string;
  statement_type: string;
  item_type: string;
  category: string | null;
  description: string;
  amount: number | string;
  frequency: string | null;
  statement_date: string | null;
};

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey || url.includes("YOUR-PROJECT")) {
    return null;
  }

  return { url, anonKey };
}

export async function createCfpServerClient() {
  const config = getSupabaseConfig();
  if (!config) return null;

  try {
    return await createServerSupabaseClient();
  } catch {
    return null;
  }
}
