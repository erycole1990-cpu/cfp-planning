import {
  createCfpClient,
  type Customer,
  type FinancialGoal,
  type FinancialStatementItem,
  type GoalProgressLog,
  type NextStepAction,
} from "./supabase";
import { statusRank } from "./status";

export type DashboardData = {
  configured: boolean;
  customers: Customer[];
  goals: Array<FinancialGoal & { customer?: Pick<Customer, "id" | "full_name" | "assigned_advisor_name"> }>;
  actions: Array<NextStepAction & { customer?: Pick<Customer, "id" | "full_name"> }>;
  latestLogsByGoal: Record<string, GoalProgressLog>;
  error?: string;
};

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = createCfpClient();
  if (!supabase) {
    return { configured: false, customers: [], goals: [], actions: [], latestLogsByGoal: {} };
  }

  const [customersResult, goalsResult, actionsResult, logsResult] = await Promise.all([
    supabase.from("customers").select("*").or("service_status.is.null,service_status.eq.active").order("created_at", { ascending: true }),
    supabase
      .from("financial_goals")
      .select("*, customer:customers(id, full_name, assigned_advisor_name)")
      .order("target_date", { ascending: true }),
    supabase
      .from("next_step_actions")
      .select("*, customer:customers(id, full_name)")
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("goal_progress_logs")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  const error = customersResult.error || goalsResult.error || actionsResult.error || logsResult.error;
  if (error) {
    return { configured: true, customers: [], goals: [], actions: [], latestLogsByGoal: {}, error: error.message };
  }

  const latestLogsByGoal: Record<string, GoalProgressLog> = {};
  for (const log of (logsResult.data ?? []) as GoalProgressLog[]) {
    latestLogsByGoal[log.goal_id] ||= log;
  }

  const activeCustomerIds = new Set(((customersResult.data ?? []) as Customer[]).map((customer) => customer.id));
  const goals = ((goalsResult.data ?? []) as DashboardData["goals"]).filter((goal) => activeCustomerIds.has(goal.customer_id)).sort((a, b) => {
    const statusDelta = statusRank(a.on_track_status) - statusRank(b.on_track_status);
    if (statusDelta) return statusDelta;
    return new Date(a.target_date).getTime() - new Date(b.target_date).getTime();
  });

  return {
    configured: true,
    customers: (customersResult.data ?? []) as Customer[],
    goals,
    actions: ((actionsResult.data ?? []) as DashboardData["actions"]).filter((action) => activeCustomerIds.has(action.customer_id)),
    latestLogsByGoal,
  };
}

export type CustomerServiceFilter = "active" | "inactive" | "all";

export async function getCustomersData(filter: CustomerServiceFilter = "active") {
  const supabase = createCfpClient();
  if (!supabase) return { configured: false, customers: [], goals: [] as FinancialGoal[] };

  let customersQuery = supabase.from("customers").select("*").order("full_name");
  if (filter === "active") {
    customersQuery = customersQuery.or("service_status.is.null,service_status.eq.active");
  }
  if (filter === "inactive") {
    customersQuery = customersQuery.eq("service_status", "inactive");
  }

  const [customersResult, goalsResult] = await Promise.all([
    customersQuery,
    supabase.from("financial_goals").select("*"),
  ]);
  const activeCustomerIds = new Set(((customersResult.data ?? []) as Customer[]).map((customer) => customer.id));

  return {
    configured: true,
    customers: (customersResult.data ?? []) as Customer[],
    goals: ((goalsResult.data ?? []) as FinancialGoal[]).filter((goal) => activeCustomerIds.has(goal.customer_id)),
    error: customersResult.error?.message || goalsResult.error?.message,
  };
}

export async function getCustomerDetail(id: string) {
  const supabase = createCfpClient();
  if (!supabase) return { configured: false };

  const [customerResult, goalsResult, logsResult, actionsResult, statementsResult] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).single(),
    supabase.from("financial_goals").select("*").eq("customer_id", id).order("target_date"),
    supabase
      .from("goal_progress_logs")
      .select("*")
      .in("goal_id", await goalIdsForCustomer(id))
      .order("created_at", { ascending: false }),
    supabase.from("next_step_actions").select("*").eq("customer_id", id).order("due_date", { ascending: true }),
    supabase.from("financial_statement_items").select("*").eq("customer_id", id).order("created_at", { ascending: true }),
  ]);

  const goals = (goalsResult.data ?? []) as FinancialGoal[];
  const logs = (logsResult.data ?? []) as GoalProgressLog[];
  const latestLogsByGoal: Record<string, GoalProgressLog> = {};
  for (const log of logs) latestLogsByGoal[log.goal_id] ||= log;

  return {
    configured: true,
    customer: customerResult.data as Customer | null,
    goals,
    logs,
    actions: (actionsResult.data ?? []) as NextStepAction[],
    statementItems: (statementsResult.data ?? []) as FinancialStatementItem[],
    latestLogsByGoal,
    error:
      customerResult.error?.message ||
      goalsResult.error?.message ||
      logsResult.error?.message ||
      actionsResult.error?.message ||
      statementsResult.error?.message,
  };
}

async function goalIdsForCustomer(customerId: string) {
  const supabase = createCfpClient();
  if (!supabase) return [];
  const { data } = await supabase.from("financial_goals").select("id").eq("customer_id", customerId);
  const ids = (data ?? []).map((goal) => goal.id);
  return ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
}

export async function getGoalDetail(customerId: string, goalId: string) {
  const supabase = createCfpClient();
  if (!supabase) return { configured: false };

  const [customerResult, goalResult, logsResult, actionsResult] = await Promise.all([
    supabase.from("customers").select("*").eq("id", customerId).single(),
    supabase.from("financial_goals").select("*").eq("id", goalId).eq("customer_id", customerId).single(),
    supabase.from("goal_progress_logs").select("*").eq("goal_id", goalId).order("created_at", { ascending: true }),
    supabase.from("next_step_actions").select("*").eq("goal_id", goalId).order("due_date", { ascending: true }),
  ]);

  return {
    configured: true,
    customer: customerResult.data as Customer | null,
    goal: goalResult.data as FinancialGoal | null,
    logs: (logsResult.data ?? []) as GoalProgressLog[],
    actions: (actionsResult.data ?? []) as NextStepAction[],
    error: customerResult.error?.message || goalResult.error?.message || logsResult.error?.message || actionsResult.error?.message,
  };
}
