"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto grid min-h-screen max-w-2xl place-items-center px-4 py-10">
      <section className="rounded-md border border-red-200 bg-red-50 p-6">
        <p className="mb-1 text-sm font-bold uppercase text-red-800">Page could not load</p>
        <h1 className="text-2xl font-bold text-red-950">Something in this page failed while loading.</h1>
        <p className="mt-2 text-sm text-red-900">
          Try again once. If it keeps happening, send this digest to support: {error.digest || "not available"}.
        </p>
        <button className="mt-4 rounded-md border border-red-300 bg-white px-4 py-2 font-bold text-red-950" onClick={reset} type="button">
          Try Again
        </button>
      </section>
    </main>
  );
}
