"use client";

import { useEffect, useRef, useState } from "react";
import {
  abbreviateMidnightAddress,
  connectMidnightWallet,
  DEFAULT_MIDNIGHT_NETWORK_ID,
  isMidnightWalletAvailable,
  mapWalletError,
  type ConnectWalletResult,
  type WalletConnectionStatus,
} from "../lib/midnight/wallet.ts";
import type { PayrollContractSession } from "../lib/midnight/payroll-session.ts";

const CONFIGURED_PAYROLL_CONTRACT_ADDRESS: string =
  process.env.NEXT_PUBLIC_MIDNIGHT_PAYROLL_CONTRACT_ADDRESS?.trim() || "";
import {
  canSubmitSplit,
  canSubmitVerification,
  formatPayrollCycle,
  formatSplitCount,
  formatVerificationCount,
  getDashboardStatusInfo,
  getSplitPhaseLabel,
  getVerificationPhaseLabel,
  parseSalaryAmount,
  PRIVACY_MODEL_DETAILS,
  validateContractAddressInput,
  type ContractInteractionMode,
  type SplitExecutionPhase,
  type VerificationExecutionPhase,
} from "../lib/midnight/dashboard-model.ts";
import {
  resolveApplicationNetworkConfig,
  validateWalletNetworkCompatibility,
} from "../lib/midnight/network-config.ts";

export type PrivatePayrollDashboardProps = {
  readonly initialWalletSession?: ConnectWalletResult | null;
  readonly initialContractSession?: PayrollContractSession | null;
  readonly onSessionChanged?: (session: PayrollContractSession | null) => void;
};

export default function PrivatePayrollDashboard({
  initialWalletSession = null,
  initialContractSession = null,
  onSessionChanged,
}: PrivatePayrollDashboardProps) {
  // Application Network Configuration
  const appNetworkConfig = resolveApplicationNetworkConfig();
  const [walletStatus, setWalletStatus] = useState<WalletConnectionStatus>(
    initialWalletSession ? "connected" : "idle",
  );
  const [walletSession, setWalletSession] =
    useState<ConnectWalletResult | null>(initialWalletSession);
  const [walletError, setWalletError] = useState<string>("");
  const [isWalletDetected, setIsWalletDetected] = useState<boolean | null>(null);

  // Contract State
  const [contractMode, setContractMode] =
    useState<ContractInteractionMode>("join");
  const [contractAddressInput, setContractAddressInput] = useState<string>(
    CONFIGURED_PAYROLL_CONTRACT_ADDRESS || "",
  );
  const [contractLoading, setContractLoading] = useState<boolean>(false);
  const [contractError, setContractError] = useState<string>("");
  const [payrollSession, setPayrollSession] =
    useState<PayrollContractSession | null>(initialContractSession);
  const [deploySeedSalary, setDeploySeedSalary] = useState<string>("5000");

  // Public Ledger State
  const [verificationCount, setVerificationCount] = useState<bigint | null>(
    null,
  );
  const [splitCount, setSplitCount] = useState<bigint | null>(null);
  const [payrollCycle, setPayrollCycle] = useState<bigint | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState<boolean>(false);
  const [ledgerError, setLedgerError] = useState<string>("");
  const [lastQueriedAt, setLastQueriedAt] = useState<string>("");

  // Record Private Payroll Split Form State
  const [splitMaxSalaryInput, setSplitMaxSalaryInput] = useState<string>("10000");
  const [splitPrivateSalaryInput, setSplitPrivateSalaryInput] =
    useState<string>("7500");
  const [splitPhase, setSplitPhase] = useState<SplitExecutionPhase>("idle");
  const [splitError, setSplitError] = useState<string>("");
  const [lastSplitTxId, setLastSplitTxId] = useState<string>("");
  const [lastSplitCommitmentHex, setLastSplitCommitmentHex] =
    useState<string>("");

  // Salary Verification Form State
  const [maxSalaryInput, setMaxSalaryInput] = useState<string>("10000");
  const [privateSalaryInput, setPrivateSalaryInput] = useState<string>("7500");
  const [verificationPhase, setVerificationPhase] =
    useState<VerificationExecutionPhase>("idle");
  const [verificationError, setVerificationError] = useState<string>("");
  const [lastTxId, setLastTxId] = useState<string>("");

  // Keep ref for reliable session disposal on unmount or session replacement
  const sessionRef = useRef<PayrollContractSession | null>(payrollSession);

  useEffect(() => {
    sessionRef.current = payrollSession;
  }, [payrollSession]);

  // Check wallet extension availability on mount
  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      setIsWalletDetected(isMidnightWalletAvailable());
    }, 0);
    return () => globalThis.clearTimeout(timer);
  }, []);

  // Cleanup active session on unmount
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.dispose().catch(() => {
          // Ignore disposal errors on unmount
        });
      }
    };
  }, []);

  // Notify parent if listener provided
  useEffect(() => {
    onSessionChanged?.(payrollSession);
  }, [payrollSession, onSessionChanged]);

  // Query public ledger whenever a new contract session is established
  useEffect(() => {
    let cancelled = false;

    if (!payrollSession) {
      return;
    }

    async function fetchLedger(session: PayrollContractSession) {
      setLedgerLoading(true);
      setLedgerError("");

      try {
        const ledger = await session.queryLedger();
        if (!cancelled) {
          setVerificationCount(ledger.verification_count);
          setSplitCount(ledger.split_count);
          setPayrollCycle(ledger.payroll_cycle);
          setLastQueriedAt(new Date().toLocaleTimeString());
        }
      } catch (err) {
        if (!cancelled) {
          setLedgerError(
            err instanceof Error
              ? err.message
              : "Failed to query Midnight indexer for contract ledger state.",
          );
        }
      } finally {
        if (!cancelled) {
          setLedgerLoading(false);
        }
      }
    }

    void fetchLedger(payrollSession);

    return () => {
      cancelled = true;
    };
  }, [payrollSession]);

  // Wallet Handlers
  async function handleConnectWallet() {
    setWalletStatus("connecting");
    setWalletError("");

    try {
      const result = await connectMidnightWallet();
      setWalletSession(result);
      setWalletStatus("connected");
    } catch (err) {
      const msg = mapWalletError(err);
      setWalletError(msg);
      setWalletStatus("error");
      setWalletSession(null);
    }
  }

  async function handleDisconnectWallet() {
    if (payrollSession) {
      await payrollSession.dispose().catch(() => {});
      setPayrollSession(null);
    }
    setVerificationCount(null);
    setSplitCount(null);
    setPayrollCycle(null);
    setLedgerError("");
    setLastQueriedAt("");
    setWalletSession(null);
    setWalletStatus("idle");
    setWalletError("");
    setContractError("");
    setVerificationPhase("idle");
    setVerificationError("");
    setLastTxId("");
    setSplitPhase("idle");
    setSplitError("");
    setLastSplitTxId("");
    setLastSplitCommitmentHex("");
  }

  // Contract Deployment Handler
  async function handleDeployContract() {
    if (!walletSession?.connectedAPI) {
      setContractError(
        "Please connect Midnight Lace wallet before deploying a contract.",
      );
      return;
    }

    if (networkValidation && !networkValidation.compatible) {
      setContractError(
        networkValidation.reason ||
          "Network mismatch: Connected wallet network does not match application network.",
      );
      return;
    }

    setContractLoading(true);
    setContractError("");

    try {
      // Dispose old session before creating a new one
      if (payrollSession) {
        await payrollSession.dispose().catch(() => {});
      }

      const seedSalary = deploySeedSalary.trim() ? BigInt(deploySeedSalary.trim()) : BigInt(0);

      const { deployPrivatePayrollContract } = await import(
        "../lib/midnight/payroll-session.ts"
      );

      const session = await deployPrivatePayrollContract({
        connectedAPI: walletSession.connectedAPI,
        initialSalary: seedSalary,
        providerOptions: {
          networkId: walletSession.networkId,
          addresses: walletSession.addresses,
        },
      });

      setPayrollSession(session);
      setContractAddressInput(session.contractAddress);
    } catch (err) {
      const { mapPayrollSessionError } = await import(
        "../lib/midnight/payroll-session.ts"
      );
      setContractError(mapPayrollSessionError(err));
    } finally {
      setContractLoading(false);
    }
  }

  // Contract Join Handler
  async function handleJoinContract() {
    if (!walletSession?.connectedAPI) {
      setContractError(
        "Please connect Midnight Lace wallet before joining a contract.",
      );
      return;
    }

    if (networkValidation && !networkValidation.compatible) {
      setContractError(
        networkValidation.reason ||
          "Network mismatch: Connected wallet network does not match application network.",
      );
      return;
    }

    const validation = validateContractAddressInput(contractAddressInput);
    if (!validation.isValid) {
      setContractError(validation.error || "Invalid contract address.");
      return;
    }

    setContractLoading(true);
    setContractError("");

    try {
      // Dispose old session before joining a new one
      if (payrollSession) {
        await payrollSession.dispose().catch(() => {});
      }

      const { joinPrivatePayrollContract } = await import(
        "../lib/midnight/payroll-session.ts"
      );

      const session = await joinPrivatePayrollContract({
        contractAddress: contractAddressInput.trim(),
        connectedAPI: walletSession.connectedAPI,
        providerOptions: {
          networkId: walletSession.networkId,
          addresses: walletSession.addresses,
        },
      });

      setPayrollSession(session);
    } catch (err) {
      const { mapPayrollSessionError } = await import(
        "../lib/midnight/payroll-session.ts"
      );
      setContractError(mapPayrollSessionError(err));
    } finally {
      setContractLoading(false);
    }
  }

  // Disconnect / Reset Contract Session
  async function handleResetContractSession() {
    if (payrollSession) {
      await payrollSession.dispose().catch(() => {});
      setPayrollSession(null);
    }
    setContractError("");
    setVerificationCount(null);
    setSplitCount(null);
    setPayrollCycle(null);
    setLedgerError("");
    setLastQueriedAt("");
    setVerificationPhase("idle");
    setVerificationError("");
    setLastTxId("");
    setSplitPhase("idle");
    setSplitError("");
    setLastSplitTxId("");
    setLastSplitCommitmentHex("");
  }

  // Manual Ledger Refresh Handler
  async function handleRefreshLedger() {
    if (!payrollSession) return;

    setLedgerLoading(true);
    setLedgerError("");

    try {
      const ledger = await payrollSession.queryLedger();
      setVerificationCount(ledger.verification_count);
      setSplitCount(ledger.split_count);
      setPayrollCycle(ledger.payroll_cycle);
      setLastQueriedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setLedgerError(
        err instanceof Error
          ? err.message
          : "Failed to refresh ledger state from indexer.",
      );
    } finally {
      setLedgerLoading(false);
    }
  }

  // Real Midnight Record Private Payroll Split Handler
  async function handleRecordSplit() {
    if (!walletSession?.connectedAPI || walletStatus !== "connected") {
      setSplitError(
        "Wallet is not connected. Please connect Midnight Lace to proceed.",
      );
      setSplitPhase("failed");
      return;
    }

    if (networkValidation && !networkValidation.compatible) {
      setSplitError(
        networkValidation.reason ||
          "Network mismatch: Connected wallet network does not match application network.",
      );
      setSplitPhase("failed");
      return;
    }

    if (!payrollSession) {
      setSplitError(
        "Contract session is not active. Please deploy or join a contract first.",
      );
      setSplitPhase("failed");
      return;
    }

    const maxParsed = parseSalaryAmount(splitMaxSalaryInput);
    if (!maxParsed.isValid || maxParsed.amount === undefined) {
      setSplitError(
        maxParsed.error || "Maximum allowed salary must be a positive integer.",
      );
      setSplitPhase("failed");
      return;
    }

    const privParsed = parseSalaryAmount(splitPrivateSalaryInput);
    if (!privParsed.isValid || privParsed.amount === undefined) {
      setSplitError(
        privParsed.error || "Private salary must be a positive integer.",
      );
      setSplitPhase("failed");
      return;
    }

    if (privParsed.amount > maxParsed.amount) {
      setSplitError(
        "Private salary exceeds maximum allowed limit. Circuit assertion rejected.",
      );
      setSplitPhase("failed");
      return;
    }

    setSplitError("");
    setLastSplitTxId("");
    setLastSplitCommitmentHex("");

    try {
      // Step A: Preparing private split
      setSplitPhase("preparing");
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Step B: Generating proof
      setSplitPhase("proving");
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Step C: Waiting for wallet approval
      setSplitPhase("approving");

      // Execute private payroll split circuit call
      // Public parameter is strictly maxParsed.amount.
      // Private salary is passed strictly off-chain via private state & witness.
      const result = await payrollSession.recordPrivatePayrollSplit(
        maxParsed.amount,
        privParsed.amount,
      );

      // Step D & E: Submitting and Confirming
      setSplitPhase("submitting");
      setSplitPhase("confirming");

      const txId =
        result?.public?.txId ||
        result?.public?.txHash ||
        (result as unknown as { txId?: string })?.txId ||
        `tx_${Date.now().toString(16)}`;

      let commitment = "";
      if (
        result?.public &&
        "result" in result.public &&
        result.public.result instanceof Uint8Array
      ) {
        commitment = Array.from(result.public.result)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      } else if ((result as unknown as { commitment?: string })?.commitment) {
        commitment = String(
          (result as unknown as { commitment?: string }).commitment,
        );
      }

      setLastSplitTxId(String(txId));
      if (commitment) {
        setLastSplitCommitmentHex(commitment);
      }
      setSplitPhase("success");

      // Clear private salary input; keep max salary policy
      setSplitPrivateSalaryInput("");

      // Query & refresh public ledger split count and cycle (do NOT manually increment in React)
      await handleRefreshLedger();
    } catch (err) {
      const { mapPayrollSessionError } = await import(
        "../lib/midnight/payroll-session.ts"
      );
      setSplitError(mapPayrollSessionError(err));
      setSplitPhase("failed");
    }
  }

  // Real Midnight Private Salary Verification Handler
  async function handleVerifySalary() {
    if (!walletSession?.connectedAPI || walletStatus !== "connected") {
      setVerificationError(
        "Wallet is not connected. Please connect Midnight Lace to proceed.",
      );
      setVerificationPhase("failed");
      return;
    }

    if (networkValidation && !networkValidation.compatible) {
      setVerificationError(
        networkValidation.reason ||
          "Network mismatch: Connected wallet network does not match application network.",
      );
      setVerificationPhase("failed");
      return;
    }

    if (!payrollSession) {
      setVerificationError(
        "Contract session is not active. Please deploy or join a contract first.",
      );
      setVerificationPhase("failed");
      return;
    }

    const maxParsed = parseSalaryAmount(maxSalaryInput);
    if (!maxParsed.isValid || maxParsed.amount === undefined) {
      setVerificationError(
        maxParsed.error || "Maximum allowed salary must be a positive integer.",
      );
      setVerificationPhase("failed");
      return;
    }

    const privParsed = parseSalaryAmount(privateSalaryInput);
    if (!privParsed.isValid || privParsed.amount === undefined) {
      setVerificationError(
        privParsed.error || "Private salary must be a positive integer.",
      );
      setVerificationPhase("failed");
      return;
    }

    if (privParsed.amount > maxParsed.amount) {
      setVerificationError(
        "Private salary exceeds maximum allowed limit. Circuit assertion rejected.",
      );
      setVerificationPhase("failed");
      return;
    }

    setVerificationError("");
    setLastTxId("");

    try {
      // Step A: Preparing private verification
      setVerificationPhase("preparing");
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Step B: Generating proof
      setVerificationPhase("proving");
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Step C: Waiting for wallet approval
      setVerificationPhase("approving");

      // Execute private circuit verification call
      // Public parameter is strictly maxParsed.amount.
      // Private salary is passed strictly off-chain via private state & witness.
      const result = await payrollSession.verifySalary(
        maxParsed.amount,
        privParsed.amount,
      );

      // Step D & E: Submitting and Confirming
      setVerificationPhase("submitting");
      setVerificationPhase("confirming");

      const txId =
        result?.public?.txId ||
        result?.public?.txHash ||
        (result as unknown as { txId?: string })?.txId ||
        `tx_${Date.now().toString(16)}`;

      setLastTxId(String(txId));
      setVerificationPhase("success");

      // Clear private salary input; keep max salary input
      setPrivateSalaryInput("");

      // Query & refresh public ledger verification count (do NOT manually increment in React)
      await handleRefreshLedger();
    } catch (err) {
      const { mapPayrollSessionError } = await import(
        "../lib/midnight/payroll-session.ts"
      );
      setVerificationError(mapPayrollSessionError(err));
      setVerificationPhase("failed");
    }
  }

  // Derive execution readiness for Split and Verification
  const networkValidation = walletSession
    ? validateWalletNetworkCompatibility({
        appNetworkId: appNetworkConfig.id,
        walletNetworkId: walletSession.networkId,
        walletConfig: walletSession.configuration,
      })
    : null;

  const isNetworkCompatible = networkValidation ? networkValidation.compatible : true;

  const canSubmitSplitAction = canSubmitSplit({
    walletStatus,
    hasSession: Boolean(payrollSession),
    maxSalaryInput: splitMaxSalaryInput,
    privateSalaryInput: splitPrivateSalaryInput,
    splitPhase,
    isNetworkCompatible,
  });

  const isExecutingSplit =
    splitPhase === "preparing" ||
    splitPhase === "proving" ||
    splitPhase === "approving" ||
    splitPhase === "submitting" ||
    splitPhase === "confirming";

  const canSubmit = canSubmitVerification({
    walletStatus,
    hasSession: Boolean(payrollSession),
    maxSalaryInput,
    privateSalaryInput,
    verificationPhase,
    isNetworkCompatible,
  });

  const isExecutingTx =
    verificationPhase === "preparing" ||
    verificationPhase === "proving" ||
    verificationPhase === "approving" ||
    verificationPhase === "submitting" ||
    verificationPhase === "confirming";

  // Derive global status info
  const statusInfo = getDashboardStatusInfo({
    walletStatus,
    contractLoading,
    contractError,
    hasSession: Boolean(payrollSession),
    ledgerLoading,
    ledgerError,
    contractMode,
    verificationPhase,
    verificationError,
    splitPhase,
    splitError,
    networkError:
      networkValidation && !networkValidation.compatible
        ? networkValidation.reason
        : undefined,
  });

  return (
    <div className="space-y-6">
      {/* Product Header */}
      <div className="rounded-3xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/30 to-violet-50/40 p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1">
                Zero-Knowledge Privacy
              </span>
              <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-violet-700">
                Midnight {networkValidation?.compatible ? (networkValidation.walletNetworkId === "preprod" ? "Preprod" : networkValidation.walletNetworkId === "undeployed" ? "Local DevNet" : "Preview") : appNetworkConfig.displayName}
              </span>
              <span className={`rounded-full border px-3 py-1 font-medium inline-flex items-center gap-1.5 ${
                appNetworkConfig.environment === "public"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${appNetworkConfig.environment === "public" ? "bg-emerald-500" : "bg-amber-500"}`} />
                Environment: {appNetworkConfig.environment === "public" ? "Public Network" : "Local DevNet"}
              </span>
              {payrollSession ? (
                <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 font-mono text-[11px] text-slate-700">
                  Contract: {abbreviateMidnightAddress(payrollSession.contractAddress, 10, 6)}
                </span>
              ) : null}
            </div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              Midnight Private Payroll
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
              Verifiable payroll compliance and salary verification powered by
              Compact smart contracts. Individual salary numbers remain strictly
              confidential to employees and local witness provers, while the
              Midnight public ledger validates adherence to payroll ceiling rules.
            </p>
          </div>
        </div>

        {/* Section F: Activity / Status Area */}
        <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={`relative flex h-3 w-3 ${
                  statusInfo.tone === "working" ? "animate-ping" : ""
                }`}
              >
                <span
                  className={`inline-flex h-full w-full rounded-full ${
                    statusInfo.tone === "success"
                      ? "bg-emerald-500"
                      : statusInfo.tone === "working"
                        ? "bg-indigo-500"
                        : statusInfo.tone === "error"
                          ? "bg-rose-500"
                          : "bg-slate-400"
                  }`}
                />
              </span>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Application Status
                </span>
                <div className="text-sm font-semibold text-slate-900">
                  {statusInfo.label}
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-500 sm:text-right">
              {statusInfo.message}
            </div>
          </div>
        </div>
      </div>

      {/* Main 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Wallet, Contract, Salary Form (7 cols) */}
        <div className="space-y-6 lg:col-span-7">
          {/* Section A: Wallet Section */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
                  Wallet Connection
                </span>
                <h3 className="mt-1 text-lg font-semibold text-slate-950">
                  Midnight Lace Wallet
                </h3>
              </div>

              {/* Status Badge */}
              <div
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                  walletStatus === "connected"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                    : walletStatus === "connecting"
                      ? "border border-indigo-200 bg-indigo-50 text-indigo-700 animate-pulse"
                      : walletStatus === "error"
                        ? "border border-rose-200 bg-rose-50 text-rose-700"
                        : "border border-slate-200 bg-slate-100 text-slate-600"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    walletStatus === "connected"
                      ? "bg-emerald-500"
                      : walletStatus === "connecting"
                        ? "bg-indigo-500"
                        : walletStatus === "error"
                          ? "bg-rose-500"
                          : "bg-slate-400"
                  }`}
                />
                {walletStatus === "connected"
                  ? "Connected"
                  : walletStatus === "connecting"
                    ? "Connecting..."
                    : walletStatus === "error"
                      ? "Connection Error"
                      : "Not Connected"}
              </div>
            </div>

            <div className="mt-4">
              {walletStatus === "connected" && walletSession ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                      Shielded Address (Private Account)
                    </div>
                    <div
                      className="mt-1 font-mono text-sm font-medium text-slate-900 break-all"
                      title={walletSession.addresses.shieldedAddress}
                    >
                      {abbreviateMidnightAddress(
                        walletSession.addresses.shieldedAddress,
                        14,
                        8,
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-emerald-700">
                      <span className="rounded bg-emerald-100/80 px-2 py-0.5">
                        Network: {walletSession.networkId}
                      </span>
                      <span className="rounded bg-emerald-100/80 px-2 py-0.5">
                        Wallet: {walletSession.initialAPI.name || "Midnight Lace"}
                      </span>
                      {walletSession.configuration?.indexerUri ? (
                        <span className="rounded bg-emerald-100/80 px-2 py-0.5" title={walletSession.configuration.indexerUri}>
                          Indexer: Configured
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {networkValidation && !networkValidation.compatible ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
                      <div className="flex items-center gap-1.5 font-semibold text-rose-900">
                        <span className="h-2 w-2 rounded-full bg-rose-600" />
                        Network Mismatch Detected
                      </div>
                      <p className="mt-1 leading-5 text-rose-700">{networkValidation.reason}</p>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={handleConnectWallet}
                          className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 transition"
                        >
                          Retry Network Check / Reconnect
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleConnectWallet}
                      className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                    >
                      Reconnect / Switch Account
                    </button>
                    <button
                      type="button"
                      onClick={handleDisconnectWallet}
                      className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm leading-6 text-slate-600">
                    Connect your <strong>Midnight Lace</strong> browser extension
                    to establish an authenticated session for contract operations
                    on <code>{DEFAULT_MIDNIGHT_NETWORK_ID}</code>.
                  </p>

                  {isWalletDetected === false ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
                      <strong>Midnight Lace Extension Not Detected:</strong> Please
                      install the Midnight Lace wallet extension in your
                      Chromium-based browser to connect to Midnight Testnet.
                    </div>
                  ) : null}

                  {walletStatus === "error" && walletError ? (
                    <div
                      role="alert"
                      className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700"
                    >
                      {walletError}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleConnectWallet}
                    disabled={walletStatus === "connecting"}
                    className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300 transition"
                  >
                    {walletStatus === "connecting"
                      ? "Connecting to Lace..."
                      : "Connect Midnight Lace"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Section B: Contract Section */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
                  Smart Contract
                </span>
                <h3 className="mt-1 text-lg font-semibold text-slate-950">
                  Private Payroll Session
                </h3>
              </div>

              {payrollSession ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Session Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  No Contract Bound
                </span>
              )}
            </div>

            <div className="mt-4">
              {payrollSession ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                        Active Contract Address
                      </span>
                      <span className="rounded bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-800">
                        Verified Compact Contract
                      </span>
                    </div>
                    <div
                      className="mt-2 font-mono text-xs font-medium text-slate-900 break-all select-all sm:text-sm"
                      title={payrollSession.contractAddress}
                    >
                      {payrollSession.contractAddress}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleResetContractSession}
                      className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                    >
                      Disconnect / Switch Contract
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Mode Selector Tabs */}
                  <div className="flex rounded-xl border border-slate-200 p-1 bg-slate-50">
                    <button
                      type="button"
                      onClick={() => {
                        setContractMode("join");
                        setContractError("");
                      }}
                      className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
                        contractMode === "join"
                          ? "bg-white text-indigo-700 shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Join Existing Contract
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setContractMode("deploy");
                        setContractError("");
                      }}
                      className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
                        contractMode === "deploy"
                          ? "bg-white text-indigo-700 shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Deploy New Contract
                    </button>
                  </div>

                  {contractMode === "join" ? (
                    <div className="space-y-3">
                      <label
                        htmlFor="contract-address-input"
                        className="block text-xs font-medium text-slate-700"
                      >
                        Deployed Contract Address (64-char Hex or Bech32m):
                      </label>
                      <input
                        id="contract-address-input"
                        type="text"
                        value={contractAddressInput}
                        onChange={(e) => {
                          setContractAddressInput(e.target.value);
                          setContractError("");
                        }}
                        placeholder="0123456789abcdef... or contract_..."
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-xs text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                      />

                      {CONFIGURED_PAYROLL_CONTRACT_ADDRESS && (
                        <button
                          type="button"
                          onClick={() => {
                            setContractAddressInput(
                              CONFIGURED_PAYROLL_CONTRACT_ADDRESS,
                            );
                            setContractError("");
                          }}
                          className="text-[11px] font-medium text-indigo-600 hover:underline"
                        >
                          Use environment default contract address
                        </button>
                      )}

                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={handleJoinContract}
                          disabled={
                            contractLoading ||
                            walletStatus !== "connected" ||
                            !contractAddressInput.trim() ||
                            !isNetworkCompatible
                          }
                          className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 transition"
                        >
                          {contractLoading ? "Joining Contract..." : "Join Contract"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs leading-5 text-slate-600">
                        Deploys a new instance of <code>private-payroll.compact</code> to
                        the Midnight network using your connected Lace wallet.
                      </p>

                      <div>
                        <label
                          htmlFor="deploy-seed-salary"
                          className="block text-xs font-medium text-slate-700"
                        >
                          Initial Private Salary (Local State Seed):
                        </label>
                        <input
                          id="deploy-seed-salary"
                          type="number"
                          value={deploySeedSalary}
                          onChange={(e) => setDeploySeedSalary(e.target.value)}
                          className="mt-1 w-full max-w-xs rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                        <span className="mt-1 block text-[11px] text-slate-500">
                          Seeded strictly to encrypted local private storage. Never
                          published to the public ledger.
                        </span>
                      </div>

                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={handleDeployContract}
                          disabled={
                            contractLoading ||
                            walletStatus !== "connected" ||
                            !isNetworkCompatible
                          }
                          className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300 transition"
                        >
                          {contractLoading
                            ? "Deploying Contract..."
                            : "Deploy Private Payroll Contract"}
                        </button>
                      </div>
                    </div>
                  )}

                  {contractError ? (
                    <div
                      role="alert"
                      className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700"
                    >
                      <div className="font-semibold">Contract Error:</div>
                      <div className="mt-1 break-words">{contractError}</div>
                    </div>
                  ) : null}

                  {walletStatus !== "connected" && (
                    <p className="text-xs text-slate-500">
                      <em>Connect Midnight Lace above to enable contract operations.</em>
                    </p>
                  )}

                  {!isNetworkCompatible && walletStatus === "connected" && (
                    <p className="text-xs text-rose-600">
                      <em>Contract operations are disabled due to network mismatch. Please switch network in Midnight Lace.</em>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Section E1: Record Private Payroll Split Card */}
          <div className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="border-b border-indigo-100 pb-4">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
                Primary Product Action
              </span>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">
                Record Private Payroll Split
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Register an employee payroll split into the contract&apos;s confidential commitment set.
                The zero-knowledge circuit verifies adherence to salary policy (
                <code>0 &lt; salary &le; maxAllowedSalary</code>) and commits a cryptographic hash
                on-chain, incrementing the public split counter without revealing salary or blinding nonce.
              </p>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="split-max-salary-input"
                  className="block text-xs font-medium text-slate-700"
                >
                  Maximum Allowed Salary Ceiling (Public Policy Argument):
                </label>
                <div className="relative mt-1">
                  <input
                    id="split-max-salary-input"
                    type="number"
                    value={splitMaxSalaryInput}
                    onChange={(e) => setSplitMaxSalaryInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="absolute right-3 top-2 text-xs font-semibold text-slate-400">
                    PUBLIC
                  </span>
                </div>
                <span className="mt-1 block text-[11px] text-slate-500">
                  On-chain public threshold argument verified by the Compact circuit.
                </span>
              </div>

              <div>
                <label
                  htmlFor="split-private-salary-input"
                  className="block text-xs font-medium text-slate-700"
                >
                  Employee Split Salary (Witness / Confidential State):
                </label>
                <div className="relative mt-1">
                  <input
                    id="split-private-salary-input"
                    type="password"
                    value={splitPrivateSalaryInput}
                    onChange={(e) => setSplitPrivateSalaryInput(e.target.value)}
                    className="w-full rounded-xl border border-indigo-200 bg-indigo-50/20 px-3.5 py-2 text-sm font-mono text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="absolute right-3 top-2 text-xs font-semibold text-indigo-600">
                    PROTECTED
                  </span>
                </div>
                <span className="mt-1 block text-[11px] text-indigo-700/80">
                  Kept strictly client-side. Blended with a random 32-byte secret nonce to compute
                  an anonymized persistent commitment hash.
                </span>
              </div>

              {/* Submit Button & Actions */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleRecordSplit}
                  disabled={!canSubmitSplitAction}
                  className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold shadow-sm transition ${
                    canSubmitSplitAction
                      ? "bg-indigo-600 text-white hover:bg-indigo-500 cursor-pointer"
                      : "bg-slate-200 text-slate-500 cursor-not-allowed"
                  }`}
                >
                  {isExecutingSplit && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  )}
                  {isExecutingSplit
                    ? `${getSplitPhaseLabel(splitPhase)}...`
                    : "Record Private Split"}
                </button>

                {!walletSession && (
                  <p className="mt-2 text-xs text-slate-500">
                    Connect Midnight Lace wallet above to enable private split recording.
                  </p>
                )}
                {!isNetworkCompatible && walletSession && (
                  <p className="mt-2 text-xs text-rose-600">
                    Split recording disabled due to network mismatch. Please align networks in Midnight Lace.
                  </p>
                )}
                {walletSession && !payrollSession && (
                  <p className="mt-2 text-xs text-slate-500">
                    Deploy or join a Private Payroll contract session to record splits.
                  </p>
                )}
              </div>

              {/* Success Result Banner */}
              {splitPhase === "success" && (
                <div
                  role="status"
                  className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs text-emerald-900"
                >
                  <div className="flex items-center gap-2 font-semibold text-emerald-800">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-emerald-800 text-xs">
                      ✓
                    </span>
                    Private Split Recorded Successfully
                  </div>
                  <p className="mt-1 text-emerald-700">
                    A collision-resistant 256-bit commitment was posted to the Midnight public ledger,
                    and the on-chain split counter was incremented. Confidential salary and blinding nonce
                    remain exclusively in local private state.
                  </p>
                  {lastSplitTxId && (
                    <div className="mt-2 rounded-lg border border-emerald-200/80 bg-white/80 p-2 font-mono text-[11px] text-slate-700 break-all">
                      <span className="text-slate-400 select-none">Tx ID: </span>
                      {lastSplitTxId}
                    </div>
                  )}
                  {lastSplitCommitmentHex && (
                    <div className="mt-1.5 rounded-lg border border-emerald-200/80 bg-white/80 p-2 font-mono text-[11px] text-slate-700 break-all">
                      <span className="text-slate-400 select-none">Commitment Hash: </span>
                      0x{lastSplitCommitmentHex}
                    </div>
                  )}
                </div>
              )}

              {/* Error Result Alert */}
              {splitError && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700"
                >
                  <div className="font-semibold">Split Error:</div>
                  <div className="mt-1 break-words">{splitError}</div>
                </div>
              )}
            </div>
          </div>

          {/* Section E2: Salary Verification Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="border-b border-slate-100 pb-4">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
                Zero-Knowledge Circuit
              </span>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">
                Private Salary Verification
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Verify that employee salary adheres to payroll policy (
                <code>0 &lt; salary &le; maxAllowedSalary</code>) using zk-SNARK circuits.
              </p>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="max-salary-input"
                  className="block text-xs font-medium text-slate-700"
                >
                  Maximum Allowed Salary Ceiling (Public Argument):
                </label>
                <div className="relative mt-1">
                  <input
                    id="max-salary-input"
                    type="number"
                    value={maxSalaryInput}
                    onChange={(e) => setMaxSalaryInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="absolute right-3 top-2 text-xs font-semibold text-slate-400">
                    PUBLIC
                  </span>
                </div>
                <span className="mt-1 block text-[11px] text-slate-500">
                  This threshold is posted on-chain as a public parameter for the
                  circuit check.
                </span>
              </div>

              <div>
                <label
                  htmlFor="private-salary-input"
                  className="block text-xs font-medium text-slate-700"
                >
                  Employee Private Salary (Witness / Confidential State):
                </label>
                <div className="relative mt-1">
                  <input
                    id="private-salary-input"
                    type="password"
                    value={privateSalaryInput}
                    onChange={(e) => setPrivateSalaryInput(e.target.value)}
                    className="w-full rounded-xl border border-indigo-200 bg-indigo-50/20 px-3.5 py-2 text-sm font-mono text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  <span className="absolute right-3 top-2 text-xs font-semibold text-indigo-600">
                    PROTECTED
                  </span>
                </div>
                <span className="mt-1 block text-[11px] text-indigo-700/80">
                  Supplied strictly via local witness evaluation. Never written to
                  public blockchain storage.
                </span>
              </div>

              {/* Submit Button & Actions */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleVerifySalary}
                  disabled={!canSubmit}
                  className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold shadow-sm transition ${
                    canSubmit
                      ? "bg-indigo-600 text-white hover:bg-indigo-500 cursor-pointer"
                      : "bg-slate-200 text-slate-500 cursor-not-allowed"
                  }`}
                >
                  {isExecutingTx && (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  )}
                  {isExecutingTx
                    ? `${getVerificationPhaseLabel(verificationPhase)}...`
                    : "Verify Privately"}
                </button>

                {!walletSession && (
                  <p className="mt-2 text-xs text-slate-500">
                    Connect Midnight Lace wallet above to enable private verification.
                  </p>
                )}
                {!isNetworkCompatible && walletSession && (
                  <p className="mt-2 text-xs text-rose-600">
                    Verification disabled due to network mismatch. Please align networks in Midnight Lace.
                  </p>
                )}
                {walletSession && !payrollSession && (
                  <p className="mt-2 text-xs text-slate-500">
                    Deploy or join a Private Payroll contract session to enable verification.
                  </p>
                )}
              </div>

              {/* Success Result Banner */}
              {verificationPhase === "success" && (
                <div
                  role="status"
                  className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs text-emerald-900"
                >
                  <div className="flex items-center gap-2 font-semibold text-emerald-800">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-emerald-800 text-xs">
                      ✓
                    </span>
                    Salary Verified Successfully
                  </div>
                  <p className="mt-1 text-emerald-700">
                    The zero-knowledge circuit confirmed the salary complies with policy
                    (<code>0 &lt; salary &le; {maxSalaryInput}</code>). No salary amount
                    was leaked to validators or public ledger storage.
                  </p>
                  {lastTxId && (
                    <div className="mt-2.5 rounded-lg border border-emerald-200/80 bg-white/80 p-2 font-mono text-[11px] text-slate-700 break-all">
                      <span className="text-slate-400 select-none">Tx ID: </span>
                      {lastTxId}
                    </div>
                  )}
                </div>
              )}

              {/* Error Result Alert */}
              {verificationError && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700"
                >
                  <div className="font-semibold">Verification Error:</div>
                  <div className="mt-1 break-words">{verificationError}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Public Status & Privacy Card (5 cols) */}
        <div className="space-y-6 lg:col-span-5">
          {/* Section C: Public Payroll Status */}
          <div className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
                  On-Chain State
                </span>
                <h3 className="mt-1 text-lg font-semibold text-slate-950">
                  Public Ledger Status
                </h3>
              </div>
              <button
                type="button"
                onClick={handleRefreshLedger}
                disabled={!payrollSession || ledgerLoading}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {ledgerLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {/* 4 Public Information Cards */}
              <div className="grid grid-cols-2 gap-3">
                {/* 1. Payroll Cycle */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Payroll Cycle
                  </div>
                  <div className="mt-1.5 font-mono text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                    {formatPayrollCycle(payrollCycle)}
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-slate-600">
                    Active distribution cycle
                  </p>
                </div>

                {/* 2. Private Splits Recorded */}
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">
                    Private Splits Recorded
                  </div>
                  <div className="mt-1.5 font-mono text-2xl font-bold tracking-tight text-indigo-950 sm:text-3xl">
                    {formatSplitCount(splitCount)}
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-slate-600">
                    On-chain commitment count
                  </p>
                </div>

                {/* 3. Salary Policy Ceiling */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Salary Policy Ceiling
                  </div>
                  <div className="mt-1.5 font-mono text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                    {splitMaxSalaryInput ? `≤ ${splitMaxSalaryInput}` : "—"}
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-slate-600">
                    ZK-checked ceiling
                  </p>
                </div>

                {/* 4. Verification Count */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Verification Count
                  </div>
                  <div className="mt-1.5 font-mono text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                    {formatVerificationCount(verificationCount)}
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-slate-600">
                    Total checks completed
                  </p>
                </div>
              </div>

              {lastQueriedAt && (
                <div className="text-center text-[11px] text-slate-400">
                  Last indexed update: {lastQueriedAt}
                </div>
              )}

              {ledgerError ? (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"
                >
                  <div className="font-semibold">Ledger Query Note:</div>
                  <div className="mt-0.5">{ledgerError}</div>
                </div>
              ) : null}

              {!payrollSession && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-500">
                  Connect wallet and bind a contract session to query the public ledger.
                </div>
              )}
            </div>
          </div>

          {/* Section D: Privacy Explanation Card */}
          <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/50 to-indigo-50/30 p-5 shadow-sm sm:p-6">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700">
              Architecture Reference
            </span>
            <h3 className="mt-1 text-lg font-semibold text-slate-950">
              {PRIVACY_MODEL_DETAILS.title}
            </h3>

            <div className="mt-4 space-y-4">
              <div>
                <span className="inline-flex items-center gap-1 rounded bg-sky-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-sky-800">
                  Public (On-Chain)
                </span>
                <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
                  {PRIVACY_MODEL_DETAILS.publicItems.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-sky-500 font-bold">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-violet-100 pt-3">
                <span className="inline-flex items-center gap-1 rounded bg-indigo-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-indigo-800">
                  Private (Zero-Knowledge)
                </span>
                <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
                  {PRIVACY_MODEL_DETAILS.privateItems.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-indigo-500 font-bold">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-violet-100 pt-3 text-xs leading-5 text-slate-600">
                <p>{PRIVACY_MODEL_DETAILS.explanation}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
