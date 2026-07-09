import Link from "next/link";
import { AppShell, PageHeader } from "../ui";
import { FinancialCalculator } from "./financial-calculator";

export default function CalculatorPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Client planning"
        title="Financial Calculator"
        actions={
          <Link className="btn btn-secondary" href="/customers">
            Choose Customer
          </Link>
        }
      />
      <FinancialCalculator />
    </AppShell>
  );
}
