"use client";

import { useEffect, useState } from "react";
import {
  abbreviateMidnightAddress,
  connectMidnightWallet,
  DEFAULT_MIDNIGHT_NETWORK_ID,
  isMidnightWalletAvailable,
  mapWalletError,
  type ConnectWalletResult,
  type WalletConnectionStatus,
} from "../lib/midnight/wallet.ts";

export type MidnightWalletCardProps = {
  readonly onWalletConnected?: (session: ConnectWalletResult) => void;
  readonly onWalletDisconnected?: () => void;
};

export default function MidnightWalletCard({
  onWalletConnected,
  onWalletDisconnected,
}: MidnightWalletCardProps) {
  const [status, setStatus] = useState<WalletConnectionStatus>("idle");
  const [walletAvailable, setWalletAvailable] = useState<boolean | null>(null);
  const [session, setSession] = useState<ConnectWalletResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    // Detect wallet availability in client browser environment asynchronously
    const timer = globalThis.setTimeout(() => {
      setWalletAvailable(isMidnightWalletAvailable());
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, []);

  async function handleConnect() {
    setStatus("connecting");
    setErrorMessage("");

    try {
      const result = await connectMidnightWallet();
      setSession(result);
      setStatus("connected");
      onWalletConnected?.(result);
    } catch (err) {
      const msg = mapWalletError(err);
      setErrorMessage(msg);
      setStatus("error");
      setSession(null);
    }
  }

  function handleDisconnect() {
    setSession(null);
    setStatus("idle");
    setErrorMessage("");
    onWalletDisconnected?.();
  }

  return (
    <div className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
            Midnight Network
          </span>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">
            Lace Wallet Connection
          </h3>
        </div>

        {/* Status Badge */}
        <div
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            status === "connected"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : status === "connecting"
                ? "bg-indigo-50 text-indigo-700 border border-indigo-200 animate-pulse"
                : status === "error"
                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                  : "bg-slate-100 text-slate-600 border border-slate-200"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              status === "connected"
                ? "bg-emerald-500"
                : status === "connecting"
                  ? "bg-indigo-500"
                  : status === "error"
                    ? "bg-rose-500"
                    : "bg-slate-400"
            }`}
          />
          {status === "connected"
            ? "Connected"
            : status === "connecting"
              ? "Connecting..."
              : status === "error"
                ? "Connection Error"
                : "Not Connected"}
        </div>
      </div>

      <div className="mt-4">
        {status === "connected" && session ? (
          <div className="grid gap-3">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                Shielded Address (Private Account)
              </div>
              <div
                className="mt-1 font-mono text-sm font-medium text-slate-900 break-all"
                title={session.addresses.shieldedAddress}
              >
                {abbreviateMidnightAddress(session.addresses.shieldedAddress, 14, 8)}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-emerald-700">
                <span className="rounded bg-emerald-100/80 px-2 py-0.5">
                  Network: {session.networkId}
                </span>
                <span className="rounded bg-emerald-100/80 px-2 py-0.5">
                  Wallet: {session.initialAPI.name || "Midnight Lace"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={handleConnect}
                className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                Reconnect / Switch Account
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            <p className="text-sm leading-6 text-slate-600">
              Connect your <strong>Midnight Lace</strong> browser wallet to authorize
              zero-knowledge payroll proofs and interact securely with the Private Payroll
              contract on <code>{DEFAULT_MIDNIGHT_NETWORK_ID}</code>.
            </p>

            {walletAvailable === false ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
                <strong>Midnight Lace Extension Not Detected:</strong> Please install
                the Midnight Lace wallet extension in your Chromium-based browser to connect.
              </div>
            ) : null}

            {status === "error" && errorMessage ? (
              <div
                aria-live="polite"
                className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700"
              >
                {errorMessage}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleConnect}
                disabled={status === "connecting"}
                className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300 transition"
              >
                {status === "connecting" ? "Connecting to Lace..." : "Connect Lace"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
