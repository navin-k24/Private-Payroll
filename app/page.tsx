import PrivatePayrollDashboard from "../components/private-payroll-dashboard";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50/50 pb-16">
      {/* Top Application Header */}
      <header className="border-b border-indigo-100 bg-white shadow-xs">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold text-lg shadow-sm">
              M
            </div>
            <div>
              <div className="text-base font-bold text-slate-900 leading-tight">
                Midnight Private Payroll
              </div>
              <div className="text-xs text-slate-500">
                Zero-Knowledge Confidential Payroll Compliance
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Midnight Preview Network
            </span>
          </div>
        </div>
      </header>

      {/* Primary Section: Midnight Private Payroll Dashboard */}
      <section className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        <PrivatePayrollDashboard />
      </section>
    </main>
  );
}
