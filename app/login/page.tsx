import { redirect } from "next/navigation";
import { sendMagicLink } from "./actions";
import { LoginForm } from "./login-form";
import { getCurrentAccess } from "@/lib/cfp/access";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ sent?: string; email?: string; signedOut?: string }>;
}) {
  const access = await getCurrentAccess();
  if (access?.profile.status === "active") redirect("/");
  const query = (await searchParams) ?? {};

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
        {access ? (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            Your account is waiting for admin approval.
          </div>
        ) : null}

        <div className="mt-5 grid gap-4">
          <LoginForm />
          <div className="relative text-center text-sm font-semibold text-[#68756f]">or</div>
          <form action={sendMagicLink} className="grid gap-3">
            <label className="field">
              <span className="label">Email magic link</span>
              <input className="input" name="email" type="email" required placeholder="name@example.com" />
            </label>
            <button className="btn btn-secondary" type="submit">
              Send Magic Link
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
