/**
 * Contract session binding architecture for Midnight Private Payroll.
 *
 * Prepares the session configuration, private state containers, and
 * contract-binding types for future integration with Midnight Lace wallet
 * and the Midnight network indexer/prover pipeline.
 *
 * NOTE: Network synchronization, Lace wallet connectors, and transaction submission
 * are deferred to subsequent migration phases.
 */

import type {
  PayrollPrivateState,
  PayrollWitnesses,
  PrivatePayrollContract,
} from "./contract.ts";
import { createPayrollContract, createPayrollWitnesses } from "./contract.ts";

/**
 * Configuration options required to locate and bind a deployed Private Payroll contract.
 */
export type PayrollSessionConfig = {
  /**
   * On-chain contract address on the Midnight network (optional during local testing).
   */
  readonly contractAddress?: string;

  /**
   * Identifier for client-side private state storage.
   */
  readonly privateStateId: string;
};

/**
 * Status of the local Midnight session binding.
 */
export type PayrollSessionStatus = "uninitialized" | "configured" | "ready";

/**
 * In-memory session state model tracking contract bindings and local private state.
 */
export type PayrollSessionState = {
  readonly status: PayrollSessionStatus;
  readonly config: PayrollSessionConfig;
  readonly privateState: PayrollPrivateState;
  readonly contract?: PrivatePayrollContract;
};

/**
 * Default identifier used for Private Payroll isolated storage.
 */
export const DEFAULT_PRIVATE_STATE_ID = "midnight.private-payroll.state";

/**
 * Creates a validated session configuration for the Private Payroll contract.
 */
export function createPayrollSessionConfig(options?: {
  contractAddress?: string;
  privateStateId?: string;
}): PayrollSessionConfig {
  return {
    contractAddress: options?.contractAddress?.trim() || undefined,
    privateStateId: options?.privateStateId?.trim() || DEFAULT_PRIVATE_STATE_ID,
  };
}

/**
 * Initializes local session state with a configured private salary and witness binding.
 *
 * @param config - The session configuration.
 * @param initialSalary - Optional initial salary amount to initialize private state with.
 */
export function initializePayrollSession(
  config: PayrollSessionConfig,
  initialSalary?: bigint,
): PayrollSessionState {
  const privateState: PayrollPrivateState = {
    salaryAmount: initialSalary,
  };

  let contract: PrivatePayrollContract | undefined;
  if (initialSalary !== undefined) {
    const witnesses: PayrollWitnesses = createPayrollWitnesses(initialSalary);
    contract = createPayrollContract(witnesses);
  }

  return {
    status: initialSalary !== undefined ? "ready" : "configured",
    config,
    privateState,
    contract,
  };
}
