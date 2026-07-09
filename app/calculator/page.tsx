import Link from "next/link";
import { AppShell, PageHeader } from "../ui";
import { FinancialCalculator } from "./financial-calculator";

export default async function CalculatorPage({
  searchParams,
}: {
  searchParams?: Promise<{
    goalName?: string;
    todayCost?: string;
    currentSavings?: string;
    years?: string;
  }>;
}) {
  const params = (await searchParams) ?? {};
  return (
    <AppShell>
      <PageHeader
        eyebrow="Client planning"
        title={params.goalName ? `Financial Calculator: ${params.goalName}` : "Financial Calculator"}
        actions={
          <Link className="btn btn-secondary" href="/customers">
            Choose Customer
          </Link>
        }
      />
      <FinancialCalculator
        initialGoal={{
          goalName: params.goalName,
          todayCost: params.todayCost,
          currentSavings: params.currentSavings,
          years: params.years,
        }}
      />
    </AppShell>
  );
}
