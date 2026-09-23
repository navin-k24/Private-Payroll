"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createPaymentIntent,
  executePaymentPipeline,
  getConnectedFreighterAddress,
  getTransactionExplorerUrl,
  mapPaymentError,
  requestFreighterAccess,
} from "../lib/payment-contract-client";
import {
  formatXlmAmount,
  normalizeStellarAddress,
  parseXlmAmount,
} from "../lib/payment-contract";
import {
  buildPaymentFeed,
  getConsoleStatusLabel,
  mergeFeedEntries,
} from "../lib/payment-dashboard-model";

type FeedItem = {
  id: string;
  kind: string;
  message: string;
  detail: string;
  time: string;
};

type Template = {
  destination: string;
  amount: string;
  memo: string;
};

type ArchitectureNote = {
  title: string;
  detail: string;
};

export default function PaymentDashboard({
  initialFeed,
  submissionTemplate,
  architectureNotes,
}: {
  initialFeed: FeedItem[];
  submissionTemplate: Template;
  architectureNotes: ArchitectureNote[];
}) {
  const [destination, setDestination] = useState(submissionTemplate.destination);
  const [amount, setAmount] = useState(submissionTemplate.amount);
  const [memo, setMemo] = useState(submissionTemplate.memo);
  const [feed, setFeed] = useState<FeedItem[]>(initialFeed);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [streamState, setStreamState] = useState("Connecting...");
  const [bridgeAddress, setBridgeAddress] = useState(
    process.env.NEXT_PUBLIC_PAYMENT_CONTRACT_ID ?? "Loading contract ID...",
  );
  const [transactionHash, setTransactionHash] = useState("Not submitted yet");
  const [transactionExplorerUrl, setTransactionExplorerUrl] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletMessage, setWalletMessage] = useState("Wallet not connected.");

  useEffect(() => {
    let source: EventSource | null = null;
    let statusTimer: ReturnType<typeof setTimeout> | null = null;

    if (typeof EventSource === "undefined") {
      statusTimer = globalThis.setTimeout(() => {
        setStreamState("Live stream unavailable in this browser");
      }, 0);
    } else {
      statusTimer = globalThis.setTimeout(() => {
        setStreamState("Connected to stream");
      }, 0);

      source = new EventSource("/api/stream");
      source.onmessage = (event) => {
        if (!event.data) return;
        const payload = JSON.parse(event.data) as FeedItem;
        setFeed((current) => mergeFeedEntries(current, [payload], 8));
      };
      source.onerror = () => {
        setStreamState("Streaming, reconnecting");
      };
    }

    return () => {
      source?.close();
      if (statusTimer !== null) {
        globalThis.clearTimeout(statusTimer);
      }
    };
  }, []);

  useEffect(() => {
    if (!walletAddress) return;
    const timer = globalThis.setInterval(async () => {
      try {
        const selected = await getConnectedFreighterAddress();
        if (selected !== walletAddress) {
          setWalletAddress(selected);
          setWalletMessage("Freighter account changed. Review the payment before submitting.");
          setStatus("idle");
          setMessage("");
        }
      } catch {
        setWalletAddress("");
        setWalletMessage("Wallet disconnected. Connect again to continue.");
      }
    }, 1500);
    return () => globalThis.clearInterval(timer);
  }, [walletAddress]);

  async function connectWallet() {
    setWalletLoading(true);
    setWalletMessage("Waiting for Freighter approval...");
    try {
      const address = await requestFreighterAccess();
      setWalletAddress(normalizeStellarAddress(address));
      setWalletMessage("Connected to Stellar Testnet.");
    } catch (error) {
      setWalletMessage(mapPaymentError(error));
    } finally {
      setWalletLoading(false);
    }
  }

  const preview = useMemo(() => {
    try {
      const normalizedDestination = normalizeStellarAddress(destination);
      const stroops = parseXlmAmount(amount);
      return {
        destination: normalizedDestination,
        amount: formatXlmAmount(stroops),
      };
    } catch {
      return null;
    }
  }, [amount, destination]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      if (!walletAddress) {
        throw new Error("Connect Freighter before submitting a payment.");
      }
      setPending(true);
      setStatus("sending");
      setMessage("Freighter approved. Validating payment intent and preparing on-chain payment...");

      const intent = createPaymentIntent({
        destination,
        amount,
        memo,
        source: walletAddress,
      });
      const result = await executePaymentPipeline(intent);

      setFeed((current) => buildPaymentFeed(current, result, 8));

      setBridgeAddress(result.bridgeAddress);
      setTransactionHash(result.transactionHash);
      setTransactionExplorerUrl(
        result.confirmationStatus === "success" ? result.explorerUrl : null,
      );
      setStatus("success");
      setMessage(result.statusSummary);
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[Payment diagnostics] payment pipeline error", error);
      }
      setStatus("error");
      setMessage(mapPaymentError(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
      <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              Payment console
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Validate the address, amount, and memo before the payment contract
              transfers XLM and records the result with the registry contract.
            </p>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
            {getConsoleStatusLabel(status)}
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
                Wallet Testnet
              </div>
              <div className="mt-1 break-all font-mono text-sm text-slate-950">
                {walletAddress || "Not connected"}
              </div>
              <div className="mt-1 text-sm text-slate-600" aria-live="polite">
                {walletMessage}
              </div>
            </div>
            <button
              type="button"
              onClick={connectWallet}
              disabled={walletLoading || pending}
              className="rounded-full border border-sky-300 bg-white px-4 py-2 text-sm font-medium text-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {walletLoading
                ? "Connecting..."
                : walletAddress
                  ? "Reconnect / Switch Account"
                  : "Connect Wallet"}
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Destination address
              <input
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-950 outline-none transition focus:border-sky-400 focus:bg-white"
                placeholder="G..."
                spellCheck={false}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Amount in XLM
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-sky-400 focus:bg-white"
                placeholder="1.25"
              />
            </label>
          </div>

          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Memo
            <input
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-sky-400 focus:bg-white"
              placeholder="Invoice 2048"
            />
          </label>

          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Payment contract
              </div>
              <div className="mt-1 break-all font-mono text-sm text-slate-900">
                {bridgeAddress}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Stream
              </div>
              <div className="mt-1 text-sm text-slate-900">
                {streamState}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Preview
              </div>
              <div className="mt-1 text-sm text-slate-900">
                {preview
                  ? `${preview.amount} XLM -> ${preview.destination.slice(0, 8)}...`
                : "Enter a valid destination and amount"}
              </div>
            </div>
            <div className="md:col-span-2 lg:col-span-1">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Transaction hash
              </div>
              <div className="mt-1 break-all font-mono text-sm text-slate-900">
                {transactionHash}
              </div>
              {transactionExplorerUrl && getTransactionExplorerUrl(transactionHash) ? (
                <a
                  href={transactionExplorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex text-sm font-medium text-sky-700 underline-offset-4 hover:underline"
                >
                  View transaction on Stellar Expert
                </a>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={pending || walletLoading || !walletAddress}
              className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {pending ? "Sending..." : "Send XLM"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDestination(submissionTemplate.destination);
                setAmount(submissionTemplate.amount);
                setMemo(submissionTemplate.memo);
                setMessage("Template restored.");
              }}
              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Reset template
            </button>
          </div>

          <div
            aria-live="polite"
            className={`rounded-2xl border px-4 py-3 text-sm ${
              status === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : status === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            {message || "The console is ready for a transfer."}
          </div>
        </form>
      </section>

      <section className="grid gap-6">
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">
                Event stream
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Real-time feed from the app route and the payment pipeline.
              </p>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              {feed.length} events
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {feed.length ? (
              feed.map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-950">
                      {item.message}
                    </div>
                    <div className="text-xs text-slate-500">{item.time}</div>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {item.detail}
                  </p>
                </article>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
                No streamed events yet. The feed will populate on connection or
                after the first transfer.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-slate-50 shadow-sm sm:p-6">
          <h2 className="text-xl font-semibold">Architecture notes</h2>
          <div className="mt-4 grid gap-3">
            {architectureNotes.map((note) => (
              <div
                key={note.title}
                className="rounded-xl border border-white/10 bg-white/5 p-4"
              >
                <div className="text-sm font-semibold">{note.title}</div>
                <div className="mt-1 text-sm leading-6 text-slate-300">
                  {note.detail}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
