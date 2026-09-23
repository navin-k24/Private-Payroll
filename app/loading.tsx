export default function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f8fafc_0%,#eef6ff_100%)] px-6">
      <div className="w-full max-w-xl rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="h-3 w-28 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-5 space-y-3">
          <div className="h-4 w-4/5 animate-pulse rounded-full bg-slate-200" />
          <div className="h-4 w-2/3 animate-pulse rounded-full bg-slate-200" />
          <div className="h-4 w-3/5 animate-pulse rounded-full bg-slate-200" />
        </div>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Loading payment workspace and streaming contract state...
        </div>
      </div>
    </main>
  );
}
