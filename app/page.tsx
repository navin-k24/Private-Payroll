import PaymentDashboard from "../components/payment-dashboard";
import {
  createInitialFeed,
  createSubmissionTemplate,
  getArchitectureNotes,
} from "../lib/payment-contract";

export default function Home() {
  return (
    <main className="min-h-screen">
      <section className="border-b border-slate-200/70 bg-[linear-gradient(180deg,#f7fafc_0%,#eef6ff_100%)]">
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-600">
            <span className="rounded-full border border-slate-300 bg-white px-3 py-1">
              Stellar payment flow
            </span>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700">
              Stellar Testnet
            </span>
          </div>
          <div className="mt-5 max-w-3xl">
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Simple Payment dApp
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-700 sm:text-lg">
              Send XLM with wallet authorization, payment-contract validation,
              registry recording, and live transaction status.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <aside className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm shadow-sm">
          <h2 className="font-semibold text-slate-950">
            Verify on Stellar Testnet
          </h2>
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
        <PaymentDashboard
          initialFeed={createInitialFeed()}
          submissionTemplate={createSubmissionTemplate()}
          architectureNotes={getArchitectureNotes()}
        />
      </section>
    </main>
  );
}
