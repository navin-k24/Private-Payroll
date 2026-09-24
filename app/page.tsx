import PrivatePayrollDashboard from "../components/private-payroll-dashboard";
import PaymentDashboard from "../components/payment-dashboard";
import {
  createInitialFeed,
  createSubmissionTemplate,
  getArchitectureNotes,
} from "../lib/payment-contract";

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
                Private Payroll
              </div>
              <div className="text-xs text-slate-500">
                Midnight Network • Zero-Knowledge Compliance
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              <span className="h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
              Testnet-02
            </span>
          </div>
        </div>
      </header>

      {/* Primary Section: Midnight Private Payroll Dashboard */}
      <section className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        <PrivatePayrollDashboard />
      </section>

      {/* Delimited Secondary Section: Legacy Stellar Demo */}
      <section className="mx-auto mt-16 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-slate-200 bg-white/70 p-6 shadow-sm backdrop-blur-xs sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1">
                  Legacy Stellar Demo
                </span>
                <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700">
                  Soroban Testnet
                </span>
              </div>
              <h2 className="mt-2 text-xl font-bold text-slate-900 sm:text-2xl">
                Legacy Stellar Payment Prototype
              </h2>
              <p className="mt-1 max-w-3xl text-xs text-slate-600 sm:text-sm">
                Preserved baseline payment workflow utilizing Freighter wallet and
                the Soroban payment registry contract. Maintained temporarily for
                comparative verification while Midnight zero-knowledge features are
                staged.
              </p>
            </div>

            <aside className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs shadow-xs">
              <span className="font-semibold text-slate-900">
                Verify on Stellar Testnet:
              </span>
              <a
                href="https://stellar.expert/explorer/testnet/contract/CCAPQHTL5EYUYDWUV7BNZCXL6RPZWXLWQ35YUUQFCXDRIOUAFS4TJEY7"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-sky-700 underline-offset-4 hover:underline"
              >
                Payment contract
              </a>
              <a
                href="https://stellar.expert/explorer/testnet/contract/CABBVUWIV2VXIRH7Y7OIKJDQHULOV2HOSCETOAZBKJWCL7QJYIUN5X77"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-sky-700 underline-offset-4 hover:underline"
              >
                Registry contract
              </a>
            </aside>
          </div>

          <div className="mt-6">
            <PaymentDashboard
              initialFeed={createInitialFeed()}
              submissionTemplate={createSubmissionTemplate()}
              architectureNotes={getArchitectureNotes()}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
