import Link from "next/link";
import { AppShell, PageHeader } from "../ui";
import { FinancialCalculator } from "./financial-calculator";

export default async function CalculatorPage({
  searchParams,
}: {
  searchParams?: Promise<{
    customerId?: string;
    goalId?: string;
    goalName?: string;
    todayCost?: string;
    currentSavings?: string;
    returnTo?: string;
    years?: string;
  }>;
}) {
  const params = (await searchParams) ?? {};
  const backHref = params.returnTo || (params.customerId ? `/customers/${params.customerId}` : "/customers");
  return (
    <AppShell>
      <PageHeader
        eyebrow="Client planning"
        title={params.goalName ? `Financial Calculator: ${params.goalName}` : "Financial Calculator"}
        actions={
          <Link className="btn btn-secondary" href={backHref}>
            {params.customerId ? "Back to Portfolio" : "Choose Customer"}
          </Link>
        }
      />
      <FinancialCalculator
        initialGoal={{
          customerId: params.customerId,
          goalId: params.goalId,
          goalName: params.goalName,
          todayCost: params.todayCost,
          currentSavings: params.currentSavings,
          returnTo: params.returnTo,
          years: params.years,
        }}
      />
    </AppShell>
  );
}
