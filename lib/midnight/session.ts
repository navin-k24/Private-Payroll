/**
 * Contract session binding architecture for Midnight Private Payroll.
 *
 * Prepares the session configuration, private state containers, and
 * contract-binding types for integration with Midnight Lace wallet
 * and the Midnight network indexer/prover provider pipeline.
 *
 * NOTE: Importing this module does NOT initiate any network connections or side-effects.
 * Providers and network synchronization are only initialized when explicit session functions are called.
 */

import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import type {
  PayrollPrivateState,
  PayrollWitnesses,
  PrivatePayrollContract,
} from "./contract.ts";
import { createPayrollContract, createPayrollWitnesses } from "./contract.ts";
import type {
  CreatePayrollProvidersOptions,
  PayrollProviders,
} from "./providers.ts";
import { createPayrollProviders } from "./providers.ts";

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
 * In-memory session state model tracking contract bindings, wallet connection,
 * MidnightJS providers, and local private state.
 */
export type PayrollSessionState = {
  readonly status: PayrollSessionStatus;
  readonly config: PayrollSessionConfig;
  readonly privateState: PayrollPrivateState;
  readonly contract?: PrivatePayrollContract;
  readonly connectedAPI?: ConnectedAPI;
  readonly providers?: PayrollProviders;
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

/**
 * Attaches an active ConnectedAPI session from Midnight Lace to the session state.
 */
export function attachConnectedWallet(
  session: PayrollSessionState,
  connectedAPI: ConnectedAPI,
): PayrollSessionState {
  return {
    ...session,
    connectedAPI,
  };
}

/**
 * Attaches an active MidnightJS provider bundle to the session state.
 */
export function attachPayrollProviders(
  session: PayrollSessionState,
  providers: PayrollProviders,
): PayrollSessionState {
  return {
    ...session,
    providers,
    status: "ready",
  };
}

/**
 * Initializes a provider-backed session from a connected wallet.
 * Connects the wallet connector to MidnightJS providers without deploying or executing contracts.
 *
 * @param session - The active session state.
 * @param connectedAPI - Connected wallet connector API from Midnight Lace.
 * @param options - Additional provider options (endpoints, custom providers, etc.).
 */
export async function initializeProviderSession(
  session: PayrollSessionState,
  connectedAPI: ConnectedAPI,
  options?: Omit<CreatePayrollProvidersOptions, "connectedAPI">,
): Promise<PayrollSessionState> {
  const providers = await createPayrollProviders({
    ...options,
    connectedAPI,
  });

  return {
    ...session,
    connectedAPI,
    providers,
    status: "ready",
  };
}

export * from "./payroll-session.ts";
