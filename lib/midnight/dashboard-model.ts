/**
 * Pure models, validation, and presentation helpers for the Midnight Private Payroll dashboard.
 *
 * Keeps business rules and display transformations cleanly decoupled from React UI components.
 */

import type {
  WalletConnectionStatus,
} from "./wallet.ts";
import { asContractAddress } from "@midnight-ntwrk/midnight-js-types";
import type { ContractAddress } from "@midnight-ntwrk/midnight-js-protocol/compact-runtime";

/**
 * Validates whether a candidate string represents a valid Midnight contract address.
 * Rejects empty strings, placeholders, and malformed inputs.
 */
export function isValidContractAddress(
  address: unknown,
): address is ContractAddress {
  if (typeof address !== "string") return false;
  const trimmed = address.trim();
  if (
    !trimmed ||
    trimmed === "placeholder" ||
    trimmed.includes("...") ||
    trimmed.length < 32
  ) {
    return false;
  }
  try {
    const parsed = asContractAddress(trimmed);
    return Boolean(parsed);
  } catch {
    // Also accept valid 64-character hexadecimal or standard Midnight Bech32m prefixes
    return (
      /^[0-9a-fA-F]{64}$/.test(trimmed) ||
      /^(contract_|mn1)[0-9a-z]{30,}$/i.test(trimmed)
    );
  }
}

export type ContractInteractionMode = "join" | "deploy";

export type DashboardStatusTone = "neutral" | "working" | "success" | "error";

export type VerificationExecutionPhase =
  | "idle"
  | "preparing"
  | "proving"
  | "approving"
  | "submitting"
  | "confirming"
  | "success"
  | "failed";

export type SplitExecutionPhase =
  | "idle"
  | "preparing"
  | "proving"
  | "approving"
  | "submitting"
  | "confirming"
  | "success"
  | "failed";

export type DashboardStatusInfo = {
  readonly label: string;
  readonly message: string;
  readonly tone: DashboardStatusTone;
};

export type PrivacyModelDetails = {
  readonly title: string;
  readonly publicItems: readonly string[];
  readonly privateItems: readonly string[];
  readonly explanation: string;
};

export const PRIVACY_MODEL_DETAILS: PrivacyModelDetails = {
  title: "Zero-Knowledge Privacy Model",
  publicItems: [
    "Payroll cycle counter & split counter (active cycle and total splits registered)",
    "Public split commitments (32-byte collision-resistant cryptographic hashes)",
    "Verification count (total compliance checks completed)",
    "Maximum allowed salary ceiling (public policy threshold)",
    "Deployed contract address & Compact circuit verifier keys",
  ],
  privateItems: [
    "Employee raw salary figures and split distributions",
    "Blinding nonces (32-byte secret salts protecting commitment privacy)",
    "Client witness values and intermediate zk-SNARK wire assignments",
    "Encrypted local private state (persisted securely in local storage)",
  ],
  explanation:
    "In the Midnight Private Payroll / Splits architecture, employee salary numbers and blinding salts are evaluated strictly within local zero-knowledge circuits via client witness providers. The contract registers only an anonymized cryptographic commitment hash in an on-chain set while incrementing split counters. No salary amounts, employee identities, or split distributions are ever revealed on the public ledger.",
};

/**
 * Validates a contract address entered by a user.
 */
export function validateContractAddressInput(input: string): {
  readonly isValid: boolean;
  readonly error?: string;
} {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      isValid: false,
      error: "Contract address is required.",
    };
  }

  if (trimmed === "placeholder" || trimmed.includes("...")) {
    return {
      isValid: false,
      error: "Please enter a real deployed contract address, not a placeholder.",
    };
  }

  if (trimmed.length < 32) {
    return {
      isValid: false,
      error: "Contract address is too short. Expected 64 hexadecimal characters or Bech32m address.",
    };
  }

  if (!isValidContractAddress(trimmed)) {
    return {
      isValid: false,
      error:
        "Invalid contract address format. Expected a 64-character hexadecimal or Bech32m Midnight contract address.",
    };
  }

  return { isValid: true };
}

/**
 * Formats a public verification count for display.
 */
export function formatVerificationCount(
  count: bigint | null | undefined,
): string {
  if (count === null || count === undefined) {
    return "—";
  }
  return count.toString();
}

/**
 * User-facing short label for the current verification phase.
 */
export function getVerificationPhaseLabel(
  phase: VerificationExecutionPhase,
): string {
  switch (phase) {
    case "preparing":
      return "Preparing private verification";
    case "proving":
      return "Generating proof";
    case "approving":
      return "Waiting for wallet approval";
    case "submitting":
      return "Submitting transaction";
    case "confirming":
      return "Waiting for confirmation";
    case "success":
      return "Verification successful";
    case "failed":
      return "Verification failed";
    default:
      return "Verify Privately";
  }
}

/**
 * Detailed description for the verification phase.
 */
export function getVerificationPhaseDescription(
  phase: VerificationExecutionPhase,
): string {
  switch (phase) {
    case "preparing":
      return "Preparing zero-knowledge verification context and local witness inputs...";
    case "proving":
      return "Computing zk-SNARK proof locally with proof-server...";
    case "approving":
      return "Awaiting transaction signature and approval in Midnight Lace...";
    case "submitting":
      return "Broadcasting verified transaction to Midnight network consensus nodes...";
    case "confirming":
      return "Waiting for block finalization and indexer transaction inclusion...";
    case "success":
      return "Salary verification successfully committed to the Midnight public ledger.";
    case "failed":
      return "Salary verification failed or was rejected.";
    default:
      return "";
  }
}

/**
 * Pure helper determining whether the user can trigger salary verification.
 */
export function canSubmitVerification(params: {
  readonly walletStatus: WalletConnectionStatus;
  readonly hasSession: boolean;
  readonly maxSalaryInput: string;
  readonly privateSalaryInput: string;
  readonly verificationPhase: VerificationExecutionPhase;
}): boolean {
  if (params.walletStatus !== "connected") return false;
  if (!params.hasSession) return false;
  if (
    params.verificationPhase !== "idle" &&
    params.verificationPhase !== "success" &&
    params.verificationPhase !== "failed"
  ) {
    return false;
  }
  const maxValid = parseSalaryAmount(params.maxSalaryInput).isValid;
  const privValid = parseSalaryAmount(params.privateSalaryInput).isValid;
  return maxValid && privValid;
}

/**
 * Formats a public split count for display.
 */
export function formatSplitCount(
  count: bigint | null | undefined,
): string {
  if (count === null || count === undefined) {
    return "—";
  }
  return count.toString();
}

/**
 * Formats a public payroll cycle for display.
 */
export function formatPayrollCycle(
  cycle: bigint | null | undefined,
): string {
  if (cycle === null || cycle === undefined) {
    return "—";
  }
  return `#${cycle.toString()}`;
}

/**
 * User-facing short label for the current private split execution phase.
 */
export function getSplitPhaseLabel(
  phase: SplitExecutionPhase,
): string {
  switch (phase) {
    case "preparing":
      return "Preparing private split";
    case "proving":
      return "Generating proof";
    case "approving":
      return "Waiting for wallet approval";
    case "submitting":
      return "Broadcasting split transaction";
    case "confirming":
      return "Waiting for confirmation";
    case "success":
      return "Split recorded on-chain";
    case "failed":
      return "Split failed";
    default:
      return "Record Private Split";
  }
}

/**
 * Detailed description for the private split execution phase.
 */
export function getSplitPhaseDescription(
  phase: SplitExecutionPhase,
): string {
  switch (phase) {
    case "preparing":
      return "Generating unique blinding nonce and preparing off-chain witness inputs...";
    case "proving":
      return "Computing zk-SNARK proof locally for salary split constraints...";
    case "approving":
      return "Awaiting split transaction authorization in Midnight Lace...";
    case "submitting":
      return "Broadcasting split commitment to Midnight network validators...";
    case "confirming":
      return "Waiting for block inclusion and public split counter increment...";
    case "success":
      return "Private payroll split commitment successfully recorded on Midnight ledger.";
    case "failed":
      return "Private payroll split failed or duplicate commitment detected.";
    default:
      return "";
  }
}

/**
 * Pure helper determining whether the user can trigger recording a private payroll split.
 */
export function canSubmitSplit(params: {
  readonly walletStatus: WalletConnectionStatus;
  readonly hasSession: boolean;
  readonly maxSalaryInput: string;
  readonly privateSalaryInput: string;
  readonly splitPhase: SplitExecutionPhase;
}): boolean {
  if (params.walletStatus !== "connected") return false;
  if (!params.hasSession) return false;
  if (
    params.splitPhase !== "idle" &&
    params.splitPhase !== "success" &&
    params.splitPhase !== "failed"
  ) {
    return false;
  }
  const maxValid = parseSalaryAmount(params.maxSalaryInput).isValid;
  const privValid = parseSalaryAmount(params.privateSalaryInput).isValid;
  return maxValid && privValid;
}

/**
 * Derives the active dashboard status and user-friendly explanation based on wallet, contract, and ledger state.
 */
export function getDashboardStatusInfo(options: {
  readonly walletStatus: WalletConnectionStatus;
  readonly contractLoading: boolean;
  readonly contractError: string;
  readonly hasSession: boolean;
  readonly ledgerLoading: boolean;
  readonly ledgerError: string;
  readonly contractMode: ContractInteractionMode;
  readonly verificationPhase?: VerificationExecutionPhase;
  readonly verificationError?: string;
  readonly splitPhase?: SplitExecutionPhase;
  readonly splitError?: string;
}): DashboardStatusInfo {
  if (options.splitError) {
    return {
      label: "Split Failed",
      message: options.splitError,
      tone: "error",
    };
  }

  if (
    options.splitPhase &&
    options.splitPhase !== "idle" &&
    options.splitPhase !== "success" &&
    options.splitPhase !== "failed"
  ) {
    return {
      label: getSplitPhaseLabel(options.splitPhase),
      message: getSplitPhaseDescription(options.splitPhase),
      tone: "working",
    };
  }

  if (options.splitPhase === "success") {
    return {
      label: "Split Recorded",
      message:
        "Private payroll split commitment confirmed on Midnight ledger.",
      tone: "success",
    };
  }

  if (options.verificationError) {
    return {
      label: "Verification Failed",
      message: options.verificationError,
      tone: "error",
    };
  }

  if (
    options.verificationPhase &&
    options.verificationPhase !== "idle" &&
    options.verificationPhase !== "success" &&
    options.verificationPhase !== "failed"
  ) {
    return {
      label: getVerificationPhaseLabel(options.verificationPhase),
      message: getVerificationPhaseDescription(options.verificationPhase),
      tone: "working",
    };
  }

  if (options.verificationPhase === "success") {
    return {
      label: "Verification Successful",
      message:
        "Zero-knowledge salary verification confirmed on Midnight ledger.",
      tone: "success",
    };
  }

  if (options.contractError) {
    return {
      label: "Contract Error",
      message: options.contractError,
      tone: "error",
    };
  }

  if (options.contractLoading) {
    return {
      label:
        options.contractMode === "deploy"
          ? "Deploying Contract"
          : "Joining Contract",
      message:
        options.contractMode === "deploy"
          ? "Deploying Private Payroll contract to Midnight network and binding private state..."
          : "Locating contract on Midnight indexer and verifying circuit keys...",
      tone: "working",
    };
  }

  if (options.ledgerError) {
    return {
      label: "Indexer Unavailable",
      message: options.ledgerError,
      tone: "error",
    };
  }

  if (options.ledgerLoading) {
    return {
      label: "Loading Public Payroll State",
      message: "Querying Midnight GraphQL indexer for latest verification counter...",
      tone: "working",
    };
  }

  if (options.hasSession) {
    return {
      label: "Contract Ready",
      message:
        "Private Payroll contract session is active. Public ledger state synchronized.",
      tone: "success",
    };
  }

  if (options.walletStatus === "connected") {
    return {
      label: "Wallet Connected",
      message:
        "Midnight Lace is connected. Deploy a new contract or join an existing deployment to begin.",
      tone: "neutral",
    };
  }

  if (options.walletStatus === "connecting") {
    return {
      label: "Connecting Wallet",
      message: "Awaiting authorization in Midnight Lace browser extension...",
      tone: "working",
    };
  }

  if (options.walletStatus === "error") {
    return {
      label: "Wallet Error",
      message: "Wallet connection was rejected or encountered an error.",
      tone: "error",
    };
  }

  return {
    label: "Wallet Not Connected",
    message: "Connect your Midnight Lace wallet to interact with Private Payroll.",
    tone: "neutral",
  };
}

/**
 * Validates maximum salary input.
 */
export function parseSalaryAmount(input: string): {
  readonly isValid: boolean;
  readonly amount?: bigint;
  readonly error?: string;
} {
  const trimmed = input.trim();
  if (!trimmed) {
    return { isValid: false, error: "Amount is required." };
  }

  if (!/^\d+$/.test(trimmed)) {
    return {
      isValid: false,
      error: "Amount must be a whole positive integer.",
    };
  }

  try {
    const value = BigInt(trimmed);
    if (value <= BigInt(0)) {
      return {
        isValid: false,
        error: "Amount must be strictly greater than zero.",
      };
    }
    return { isValid: true, amount: value };
  } catch {
    return { isValid: false, error: "Invalid number format." };
  }
}
