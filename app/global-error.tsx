"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef6ff_100%)] text-slate-950">
        <main className="flex min-h-screen items-center justify-center px-6">
          <div
            role="alert"
            className="max-w-xl rounded-[1.5rem] border border-rose-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.12)]"
          >
            <div className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">
              Global error
            </div>
            <h1 className="mt-4 text-2xl font-semibold">
              The app hit an unexpected root-level error.
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              The global error boundary is rendering because the root layout or
              a shared dependency failed. Retry after the page settles.
            </p>
            <p className="mt-3 break-all rounded-xl bg-slate-50 px-4 py-3 font-mono text-xs text-slate-500">
              {error.message}
            </p>
            <button
              type="button"
              onClick={() => unstable_retry()}
              className="mt-5 inline-flex items-center rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              Retry app
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
