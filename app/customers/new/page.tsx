import Link from "next/link";
import { AppShell, PageHeader } from "@/app/ui";
import { AddCustomerForm } from "./add-customer-form";

export const dynamic = "force-dynamic";

export default function NewCustomerPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Customer setup"
        title="Add Customer"
        actions={
          <Link className="btn btn-secondary" href="/customers">
            Back to Customers
          </Link>
        }
      />

      <AddCustomerForm />
    </AppShell>
  );
}
