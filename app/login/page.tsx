import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ sent?: string; email?: string; signedOut?: string; code?: string; next?: string }>;
}) {
  const query = ((await searchParams) ?? {}) as {
    sent?: string;
    email?: string;
    signedOut?: string;
    authConfig?: string;
    authError?: string;
    code?: string;
    next?: string;
  };
  if (query.code) {
    const params = new URLSearchParams({ code: query.code });
    if (query.next) params.set("next", query.next);
    redirect(`/auth/callback?${params.toString()}`);
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-xl place-items-center px-4 py-10">
      <section className="panel w-full p-6">
        <p className="mb-1 text-sm font-bold uppercase text-[#68756f]">Private workspace</p>
        <h1 className="text-3xl font-bold">Sign in to CFP Planning</h1>
        <p className="mt-2 text-sm text-[#53625b]">
          Admins, agents, and clients use the same login. Access is controlled after sign in.
        </p>

        {query.sent ? (
          <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
            Magic link sent to {query.email || "your email"}. Open it in this browser to continue.
          </div>
        ) : null}
        {query.signedOut ? (
          <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
            Signed out.
          </div>
        ) : null}
        {query.authConfig ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            Login is missing Supabase environment variables in this deployment.
          </div>
        ) : null}
        {query.authError ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            Login could not finish: {query.authError}
          </div>
        ) : null}
        <div className="mt-5 grid gap-4">
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
