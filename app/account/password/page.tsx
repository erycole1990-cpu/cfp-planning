import Link from "next/link";
import { PasswordForm } from "./password-form";

export const dynamic = "force-dynamic";

export default function PasswordPage() {
  return (
    <main className="mx-auto grid min-h-screen max-w-xl place-items-center px-4 py-10">
      <section className="panel w-full p-6">
        <p className="mb-1 text-sm font-bold uppercase text-[#68756f]">Account security</p>
        <h1 className="text-3xl font-bold">Set a New Password</h1>
        <p className="mt-2 text-sm text-[#53625b]">Use at least 8 characters and avoid reusing your email password.</p>
        <div className="mt-5"><PasswordForm /></div>
        <Link className="btn btn-secondary mt-4" href="/">Return to Dashboard</Link>
      </section>
    </main>
  );
}
