/**
 * Application-facing contract session management for Midnight Private Payroll.
 *
 * Implements:
 * 1. Contract deployment (`deployPrivatePayrollContract`)
 * 2. Contract joining (`joinPrivatePayrollContract`)
 * 3. Public ledger state queries (`queryPayrollLedgerState`)
 * 4. Circuit call preparation & execution (`submitVerifySalaryCall`)
 * 5. Session encapsulation and cleanup management (`PayrollContractSession`)
 *
 * NOTE: Importing this module does NOT initiate any network connections or deploy contracts.
 * Operations execute strictly upon explicit invocation.
 */

import type { ConnectedAPI } from "@midnight-ntwrk/dapp-connector-api";
import {
  deployContract,
  findDeployedContract,
  submitCallTx,
  type DeployedContract,
  type FoundContract,
  type FinalizedCallTxData,
} from "@midnight-ntwrk/midnight-js-contracts";
import { CompiledContract } from "@midnight-ntwrk/midnight-js-protocol/compact-js";
import type { ContractAddress } from "@midnight-ntwrk/midnight-js-protocol/compact-runtime";
import type { PublicDataProvider } from "@midnight-ntwrk/midnight-js-types";
import {
  Contract,
  createPayrollWitnesses,
  generateSplitNonce,
  bytesToHex,
  getPayrollLedgerState,
  type PrivatePayrollContract,
  type PayrollLedger,
} from "./contract.ts";
import {
  createPayrollProviders,
  type PayrollProviders,
  type CreatePayrollProvidersOptions,
} from "./providers.ts";
import { DEFAULT_PRIVATE_STATE_ID } from "./session.ts";

/**
 * Optional default deployed contract address configured via environment for development/testing.
 */
export const CONFIGURED_PAYROLL_CONTRACT_ADDRESS: string =
  process.env.NEXT_PUBLIC_MIDNIGHT_PAYROLL_CONTRACT_ADDRESS?.trim() || "";

import { isValidContractAddress } from "./dashboard-model.ts";
export { isValidContractAddress, bytesToHex };

/**
 * Unified application contract session for an active Midnight Private Payroll deployment.
 */
export type PayrollContractSession = {
  /**
   * The on-chain address of the deployed Private Payroll contract.
   */
  readonly contractAddress: string;

  /**
   * The underlying MidnightJS contract handle (either DeployedContract or FoundContract).
   */
  readonly deployedContract:
    | FoundContract<PrivatePayrollContract>
    | DeployedContract<PrivatePayrollContract>;

  /**
   * The active MidnightJS provider bundle powering this contract session.
   */
  readonly providers: PayrollProviders;

  /**
   * Client-side private state storage identifier.
   */
  readonly privateStateId: string;

  /**
   * Queries the latest public ledger state for this contract.
   */
  readonly queryLedger: () => Promise<PayrollLedger>;

  /**
   * Prepares and submits a private salary verification circuit call.
   *
   * @param maxAllowedSalary - Maximum salary ceiling (public on-chain parameter).
   * @param privateSalary - Optional employee private salary (injected into private state/witness).
   */
  readonly verifySalary: (
    maxAllowedSalary: bigint,
    privateSalary?: bigint,
  ) => Promise<FinalizedCallTxData<PrivatePayrollContract, "verify_salary">>;

  /**
   * Prepares and submits a private payroll split circuit call.
   * Proves salary constraints in ZK and commits a cryptographic split record on-chain.
   *
   * @param maxAllowedSalary - Maximum salary ceiling (public on-chain parameter).
   * @param privateSalary - Optional employee private salary (injected into private state/witness).
   * @param splitNonce - Optional 32-byte blinding factor / secret salt.
   */
  readonly recordPrivatePayrollSplit: (
    maxAllowedSalary: bigint,
    privateSalary?: bigint,
    splitNonce?: Uint8Array,
  ) => Promise<FinalizedCallTxData<PrivatePayrollContract, "record_private_split">>;

  /**
   * Prepares and submits an advance_payroll_cycle circuit call.
   * Increments the on-chain public payroll accounting cycle counter.
   */
  readonly advancePayrollCycle: () => Promise<
    FinalizedCallTxData<PrivatePayrollContract, "advance_payroll_cycle">
  >;

  /**
   * Releases network connections, indexer subscriptions, and session resources.
   */
  readonly dispose: () => Promise<void>;
};

/**
 * Options for deploying a new Midnight Private Payroll contract.
 */
export type DeployPayrollContractOptions = {
  /**
   * ConnectedAPI from an active Midnight Lace connection, or pre-constructed providers.
   */
  readonly connectedAPI?: ConnectedAPI;

  /**
   * Optional pre-constructed MidnightJS provider bundle.
   */
  readonly providers?: PayrollProviders;

  /**
   * Initial private salary amount to seed local private state and witness handlers.
   */
  readonly initialSalary?: bigint;

  /**
   * Custom private state storage identifier.
   */
  readonly privateStateId?: string;

  /**
   * Additional provider options if providers are constructed from connectedAPI.
   */
  readonly providerOptions?: Omit<CreatePayrollProvidersOptions, "connectedAPI">;

  /**
   * Optional override for testing/mocking contract deployment.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly deployContractFn?: (...args: any[]) => Promise<any>;
};

/**
 * Options for joining an existing deployed Private Payroll contract.
 */
export type JoinPayrollContractOptions = {
  /**
   * On-chain contract address to locate.
   */
  readonly contractAddress: string;

  /**
   * ConnectedAPI from an active Midnight Lace connection, or pre-constructed providers.
   */
  readonly connectedAPI?: ConnectedAPI;

  /**
   * Optional pre-constructed MidnightJS provider bundle.
   */
  readonly providers?: PayrollProviders;

  /**
   * Optional salary amount to configure in local private state.
   */
  readonly initialSalary?: bigint;

  /**
   * Custom private state storage identifier.
   */
  readonly privateStateId?: string;

  /**
   * Additional provider options if providers are constructed from connectedAPI.
   */
  readonly providerOptions?: Omit<CreatePayrollProvidersOptions, "connectedAPI">;

  /**
   * Optional override for testing/mocking contract discovery.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly findDeployedContractFn?: (...args: any[]) => Promise<any>;
};

/**
 * Maps contract deployment, join, and circuit execution errors to user-friendly messages.
 */
export function mapPayrollSessionError(error: unknown): string {
  if (!error) return "An unknown contract session error occurred.";

  const errObj =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : {};

  // Check DApp Connector / Wallet specific error codes
  const code = String(errObj.code || errObj.type || "").trim();
  if (
    code === "Rejected" ||
    code === "PermissionRejected" ||
    code.includes("Rejected")
  ) {
    return "Transaction was rejected or cancelled in Midnight Lace wallet.";
  }
  if (code === "Disconnected") {
    return "Midnight Lace wallet was disconnected. Please reconnect your wallet.";
  }

  let rawMsg = "";
  if (typeof error === "string") {
    rawMsg = error;
  } else if (error instanceof Error) {
    rawMsg = error.message || error.name || "";
    if (error.cause && !rawMsg) {
      rawMsg = String((error.cause as { message?: string }).message || error.cause);
    }
  } else if (typeof error === "object" && error !== null) {
    rawMsg = String(
      errObj.message ||
      errObj.reason ||
      errObj.error ||
      errObj.details ||
      errObj.description ||
      errObj.info ||
      errObj.statusText ||
      ""
    );
    if (!rawMsg) {
      try {
        const json = JSON.stringify(error);
        if (json && json !== "{}") {
          rawMsg = json;
        }
      } catch {
        rawMsg = String(error);
      }
    }
  }

  const msg = rawMsg.toLowerCase();

  if (rawMsg.includes("Invalid contract address")) {
    return rawMsg;
  }
  if (
    msg.includes("salary must be positive") ||
    msg.includes("strictly greater than zero")
  ) {
    return "Private salary must be strictly greater than 0.";
  }
  if (
    msg.includes("salary exceeds maximum allowed") ||
    msg.includes("salary exceeds")
  ) {
    return "Private salary exceeds maximum allowed limit. Circuit assertion rejected.";
  }
  if (
    msg.includes("user rejected") ||
    msg.includes("user declined") ||
    msg.includes("transaction rejected") ||
    msg.includes("cancelled") ||
    msg.includes("canceled") ||
    msg.includes("rejected by user") ||
    msg.includes("request rejected")
  ) {
    return "Transaction was rejected or cancelled in Midnight Lace wallet.";
  }
  if (
    msg.includes("connectedapi is required") ||
    msg.includes("wallet not connected") ||
    msg.includes("midnight lace wallet extension is not detected")
  ) {
    return "Wallet is not connected. Please connect Midnight Lace to proceed with contract operations.";
  }
  if (
    msg.includes("missing proof-server") ||
    msg.includes("prover") ||
    msg.includes("proof server")
  ) {
    return "Midnight proof-server configuration is unavailable or unreachable. Ensure your prover service is running.";
  }
  if (msg.includes("missing indexer") || msg.includes("indexer")) {
    return "Midnight indexer configuration is unavailable or unreachable. Check your network configuration.";
  }
  if (
    msg.includes("contract not found") ||
    msg.includes("no matching data") ||
    msg.includes("contracttypeerror")
  ) {
    return `Contract was not found on the Midnight network or contract verification keys do not match: ${rawMsg}`;
  }
  if (
    msg.includes("deploytxfailederror") ||
    msg.includes("deploy") ||
    msg.includes("deployment failed")
  ) {
    return `Private Payroll deployment failed: ${rawMsg}`;
  }
  if (
    msg.includes("duplicate payroll split") ||
    msg.includes("duplicate split") ||
    msg.includes("already recorded")
  ) {
    return "Duplicate payroll split detected: a record with this private commitment has already been registered on-chain.";
  }
  if (
    msg.includes("calltxfailederror") ||
    msg.includes("verify_salary")
  ) {
    return `Salary verification circuit execution failed: ${rawMsg}`;
  }
  if (
    msg.includes("record_private_split")
  ) {
    return `Private payroll split circuit execution failed: ${rawMsg}`;
  }

  // Extract first clean line if message contains stack traces
  const cleanLine = rawMsg.split("\n")[0].split(" at ")[0].trim();
  if (cleanLine && cleanLine.length <= 250) {
    return cleanLine;
  }

  return rawMsg.slice(0, 250) || "Failed to process contract session operation.";
}

/**
 * Safely extracts the public ledger state from contract state data.
 */
export function safeGetPayrollLedger(data: unknown): PayrollLedger {
  const defaultCommitments = {
    isEmpty: () => true,
    size: () => BigInt(0),
    member: () => false,
    [Symbol.iterator]: function* () {},
  };

  if (!data) {
    return {
      verification_count: BigInt(0),
      split_count: BigInt(0),
      payroll_cycle: BigInt(0),
      split_commitments: defaultCommitments,
    };
  }

  try {
    const parsed = getPayrollLedgerState(data as Parameters<typeof getPayrollLedgerState>[0]);
    return {
      verification_count: parsed.verification_count ?? BigInt(0),
      split_count: parsed.split_count ?? BigInt(0),
      payroll_cycle: parsed.payroll_cycle ?? BigInt(0),
      split_commitments: parsed.split_commitments ?? defaultCommitments,
    };
  } catch {
    const raw = data as Partial<PayrollLedger>;
    return {
      verification_count: typeof raw.verification_count === "bigint" ? raw.verification_count : BigInt(0),
      split_count: typeof raw.split_count === "bigint" ? raw.split_count : BigInt(0),
      payroll_cycle: typeof raw.payroll_cycle === "bigint" ? raw.payroll_cycle : BigInt(0),
      split_commitments: raw.split_commitments ?? defaultCommitments,
    };
  }
}

/**
 * Queries the public on-chain ledger state for a deployed Private Payroll contract.
 * Returns the public verification count without exposing any private salary information.
 *
 * @param publicDataProvider - Provider for querying blockchain and indexer data.
 * @param contractAddress - The on-chain address of the contract.
 */
export async function queryPayrollLedgerState(
  publicDataProvider: PublicDataProvider,
  contractAddress: string | ContractAddress,
): Promise<PayrollLedger> {
  const address = String(contractAddress || "").trim();
  if (!isValidContractAddress(address)) {
    throw new Error(
      `Invalid contract address: "${address}". Expected a valid 64-character hexadecimal or Bech32m Midnight contract address.`,
    );
  }

  const contractState = await publicDataProvider.queryContractState(
    address as ContractAddress,
  );

  if (!contractState || !contractState.data) {
    return safeGetPayrollLedger(null);
  }

  return safeGetPayrollLedger(contractState.data);
}

/**
 * Deploys a new Private Payroll contract to the Midnight network.
 *
 * Guarantees:
 * - Does not deploy automatically; executed strictly on explicit call.
 * - Seeds local private state with the initial salary amount without exposing it publicly.
 * - Automatically disposes created resources if deployment fails.
 */
export async function deployPrivatePayrollContract(
  options: DeployPayrollContractOptions,
): Promise<PayrollContractSession> {
  let providers = options.providers;
  let ownsProviders = false;

  if (!providers) {
    if (!options.connectedAPI) {
      throw new Error(
        "Cannot deploy Private Payroll contract: either connectedAPI or providers must be supplied.",
      );
    }
    providers = await createPayrollProviders({
      ...options.providerOptions,
      connectedAPI: options.connectedAPI,
    });
    ownsProviders = true;
  }

  const privateStateId = options.privateStateId || DEFAULT_PRIVATE_STATE_ID;
  const initialSalary = options.initialSalary ?? BigInt(0);

  try {
    const witnesses = createPayrollWitnesses(initialSalary);
    const withWitnesses = CompiledContract.withWitnesses(
      CompiledContract.make("private-payroll", Contract),
      witnesses,
    );
    const compiledContract = CompiledContract.withCompiledFileAssets(
      withWitnesses,
      "contract/compiled",
    );

    const deployFn = options.deployContractFn || deployContract;
    const deployed = await deployFn(providers, {
      compiledContract,
      privateStateId,
      initialPrivateState: { salaryAmount: initialSalary },
    });

    const deployedAddress = String(
      deployed.deployTxData?.public?.contractAddress ||
        (deployed as unknown as { contractAddress?: string }).contractAddress ||
        "",
    );

    const session: PayrollContractSession = {
      contractAddress: deployedAddress,
      deployedContract: deployed,
      providers,
      privateStateId,
      queryLedger: async () => queryPayrollLedgerState(providers.publicDataProvider, deployedAddress),
      verifySalary: async (maxAllowedSalary: bigint, privateSalary?: bigint) =>
        submitVerifySalaryCall(providers, {
          contractAddress: deployedAddress,
          maxAllowedSalary,
          privateSalary: privateSalary !== undefined ? privateSalary : initialSalary,
          privateStateId,
          deployedContract: deployed,
        }),
      recordPrivatePayrollSplit: async (
        maxAllowedSalary: bigint,
        privateSalary?: bigint,
        splitNonce?: Uint8Array,
      ) =>
        submitRecordPrivateSplitCall(providers, {
          contractAddress: deployedAddress,
          maxAllowedSalary,
          privateSalary: privateSalary !== undefined ? privateSalary : initialSalary,
          splitNonce,
          privateStateId,
          deployedContract: deployed,
        }),
      advancePayrollCycle: async () =>
        submitAdvancePayrollCycleCall(providers, {
          contractAddress: deployedAddress,
          privateStateId,
          deployedContract: deployed,
        }),
      dispose: async () => {
        await providers.dispose();
      },
    };

    return session;
  } catch (error) {
    if (ownsProviders) {
      await providers.dispose();
    }
    throw new Error(mapPayrollSessionError(error));
  }
}

/**
 * Connects to an existing deployed Private Payroll contract on the Midnight network.
 *
 * Guarantees:
 * - Validates contract address and rejects placeholders.
 * - Resolves deployed contract verifier keys from the indexer.
 * - Binds local private state and witness handlers.
 * - Automatically disposes created resources if joining fails.
 */
export async function joinPrivatePayrollContract(
  options: JoinPayrollContractOptions,
): Promise<PayrollContractSession> {
  const contractAddress = options.contractAddress?.trim();
  if (!isValidContractAddress(contractAddress)) {
    throw new Error(
      `Invalid contract address: "${contractAddress}". Expected a valid 64-character hexadecimal or Bech32m Midnight contract address.`,
    );
  }

  let providers = options.providers;
  let ownsProviders = false;

  if (!providers) {
    if (!options.connectedAPI) {
      throw new Error(
        "Cannot join Private Payroll contract: either connectedAPI or providers must be supplied.",
      );
    }
    providers = await createPayrollProviders({
      ...options.providerOptions,
      connectedAPI: options.connectedAPI,
    });
    ownsProviders = true;
  }

  const privateStateId = options.privateStateId || DEFAULT_PRIVATE_STATE_ID;

  try {
    const baseCompiled = options.initialSalary !== undefined
      ? CompiledContract.withWitnesses(
          CompiledContract.make("private-payroll", Contract),
          createPayrollWitnesses(options.initialSalary),
        )
      : CompiledContract.withVacantWitnesses(
          CompiledContract.make("private-payroll", Contract),
        );
    const compiledContract = CompiledContract.withCompiledFileAssets(
      baseCompiled,
      "contract/compiled",
    );

    const findFn = options.findDeployedContractFn || findDeployedContract;
    const found = await findFn(providers, {
      compiledContract,
      contractAddress: contractAddress as ContractAddress,
      privateStateId,
      ...(options.initialSalary !== undefined
        ? { initialPrivateState: { salaryAmount: options.initialSalary } }
        : {}),
    });

    const session: PayrollContractSession = {
      contractAddress,
      deployedContract: found,
      providers,
      privateStateId,
      queryLedger: async () => queryPayrollLedgerState(providers.publicDataProvider, contractAddress),
      verifySalary: async (maxAllowedSalary: bigint, privateSalary?: bigint) =>
        submitVerifySalaryCall(providers, {
          contractAddress,
          maxAllowedSalary,
          privateSalary: privateSalary !== undefined ? privateSalary : options.initialSalary,
          privateStateId,
          deployedContract: found,
        }),
      recordPrivatePayrollSplit: async (
        maxAllowedSalary: bigint,
        privateSalary?: bigint,
        splitNonce?: Uint8Array,
      ) =>
        submitRecordPrivateSplitCall(providers, {
          contractAddress,
          maxAllowedSalary,
          privateSalary: privateSalary !== undefined ? privateSalary : options.initialSalary,
          splitNonce,
          privateStateId,
          deployedContract: found,
        }),
      advancePayrollCycle: async () =>
        submitAdvancePayrollCycleCall(providers, {
          contractAddress,
          privateStateId,
          deployedContract: found,
        }),
      dispose: async () => {
        await providers.dispose();
      },
    };

    return session;
  } catch (error) {
    if (ownsProviders) {
      await providers.dispose();
    }
    throw new Error(mapPayrollSessionError(error));
  }
}

/**
 * Options for submitting a verify_salary circuit call.
 */
export type SubmitVerifySalaryCallOptions = {
  contractAddress: string;
  maxAllowedSalary: bigint;
  privateSalary?: bigint;
  privateStateId?: string;
  deployedContract?:
    | FoundContract<PrivatePayrollContract>
    | DeployedContract<PrivatePayrollContract>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  submitCallTxFn?: (...args: any[]) => Promise<any>;
};

/**
 * Prepares and submits a call to the `verify_salary` circuit.
 *
 * Privacy enforcement:
 * - `maxAllowedSalary` is the SOLE public argument submitted on-chain.
 * - Private salary is ingested off-chain strictly via the witness handler.
 * - The raw salary is never posted to the public ledger or logged.
 */
export async function submitVerifySalaryCall(
  providers: PayrollProviders,
  options: SubmitVerifySalaryCallOptions,
): Promise<FinalizedCallTxData<PrivatePayrollContract, "verify_salary">> {
  const address = options.contractAddress?.trim();
  if (!isValidContractAddress(address)) {
    throw new Error(
      `Invalid contract address: "${options.contractAddress}". Cannot execute verify_salary.`,
    );
  }

  if (options.maxAllowedSalary <= BigInt(0)) {
    throw new Error("Maximum allowed salary must be strictly greater than zero.");
  }

  if (options.privateSalary !== undefined) {
    if (options.privateSalary <= BigInt(0)) {
      throw new Error("salary must be positive");
    }
    if (options.privateSalary > options.maxAllowedSalary) {
      throw new Error("salary exceeds maximum allowed");
    }
  }

  const privateStateId = options.privateStateId || DEFAULT_PRIVATE_STATE_ID;

  // 1. If a private salary is supplied, update the local private state container
  if (options.privateSalary !== undefined) {
    providers.privateStateProvider.setContractAddress(address as ContractAddress);
    await providers.privateStateProvider.set(privateStateId, {
      salaryAmount: options.privateSalary,
    });
  }

  // 2. If a deployedContract handle with callTx is already available, invoke it directly
  if (options.deployedContract?.callTx?.verify_salary) {
    return await options.deployedContract.callTx.verify_salary(
      options.maxAllowedSalary,
    );
  }

  // 3. Otherwise construct the circuit call options and submit via submitCallTx
  const witnesses = options.privateSalary !== undefined
    ? createPayrollWitnesses(options.privateSalary)
    : undefined;

  const baseCompiled = witnesses
    ? CompiledContract.withWitnesses(
        CompiledContract.make("private-payroll", Contract),
        witnesses,
      )
    : CompiledContract.withVacantWitnesses(
        CompiledContract.make("private-payroll", Contract),
      );
  const compiledContract = CompiledContract.withCompiledFileAssets(
    baseCompiled,
    "contract/compiled",
  );

  const submitFn = options.submitCallTxFn || submitCallTx;
  return await submitFn(providers, {
    compiledContract,
    circuitId: "verify_salary",
    contractAddress: address as ContractAddress,
    privateStateId,
    args: [options.maxAllowedSalary],
  });
}

/**
 * Options for submitting a record_private_split circuit call.
 */
export type SubmitRecordPrivateSplitCallOptions = {
  contractAddress: string;
  maxAllowedSalary: bigint;
  privateSalary?: bigint;
  splitNonce?: Uint8Array;
  privateStateId?: string;
  deployedContract?:
    | FoundContract<PrivatePayrollContract>
    | DeployedContract<PrivatePayrollContract>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  submitCallTxFn?: (...args: any[]) => Promise<any>;
};

/**
 * Prepares and submits a call to the `record_private_split` circuit.
 *
 * Privacy enforcement:
 * - `maxAllowedSalary` is the SOLE public argument submitted on-chain.
 * - Private salary and blinding nonce are ingested off-chain strictly via witness handlers.
 * - The raw salary is never posted to the public ledger or logged.
 * - Only the resulting 256-bit commitment is committed to `split_commitments`.
 */
export async function submitRecordPrivateSplitCall(
  providers: PayrollProviders,
  options: SubmitRecordPrivateSplitCallOptions,
): Promise<FinalizedCallTxData<PrivatePayrollContract, "record_private_split">> {
  const address = options.contractAddress?.trim();
  if (!isValidContractAddress(address)) {
    throw new Error(
      `Invalid contract address: "${options.contractAddress}". Cannot execute record_private_split.`,
    );
  }

  if (options.maxAllowedSalary <= BigInt(0)) {
    throw new Error("Maximum allowed salary must be strictly greater than zero.");
  }

  if (options.privateSalary !== undefined) {
    if (options.privateSalary <= BigInt(0)) {
      throw new Error("salary must be positive");
    }
    if (options.privateSalary > options.maxAllowedSalary) {
      throw new Error("salary exceeds maximum allowed");
    }
  }

  const nonce = options.splitNonce || generateSplitNonce();
  const privateStateId = options.privateStateId || DEFAULT_PRIVATE_STATE_ID;

  // 1. Update the local private state container
  providers.privateStateProvider.setContractAddress(address as ContractAddress);
  const currentPrivateState =
    (await providers.privateStateProvider.get(privateStateId)) || {};
  await providers.privateStateProvider.set(privateStateId, {
    ...currentPrivateState,
    ...(options.privateSalary !== undefined
      ? { salaryAmount: options.privateSalary }
      : {}),
    splitNonce: nonce,
  });

  // 2. If a deployedContract handle with callTx is already available, invoke it directly
  if (options.deployedContract?.callTx?.record_private_split) {
    return await options.deployedContract.callTx.record_private_split(
      options.maxAllowedSalary,
    );
  }

  // 3. Otherwise construct the circuit call options and submit via submitCallTx
  const salaryToUse =
    options.privateSalary ??
    (currentPrivateState as { salaryAmount?: bigint }).salaryAmount ??
    BigInt(0);
  const witnesses = createPayrollWitnesses(salaryToUse, nonce);

  const baseCompiled = CompiledContract.withWitnesses(
    CompiledContract.make("private-payroll", Contract),
    witnesses,
  );
  const compiledContract = CompiledContract.withCompiledFileAssets(
    baseCompiled,
    "contract/compiled",
  );

  const submitFn = options.submitCallTxFn || submitCallTx;
  return await submitFn(providers, {
    compiledContract,
    circuitId: "record_private_split",
    contractAddress: address as ContractAddress,
    privateStateId,
    args: [options.maxAllowedSalary],
  });
}

/**
 * Options for submitting an advance_payroll_cycle circuit call.
 */
export type SubmitAdvancePayrollCycleCallOptions = {
  contractAddress: string;
  privateStateId?: string;
  deployedContract?:
    | FoundContract<PrivatePayrollContract>
    | DeployedContract<PrivatePayrollContract>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  submitCallTxFn?: (...args: any[]) => Promise<any>;
};

/**
 * Prepares and submits a call to the `advance_payroll_cycle` circuit.
 * Increments the on-chain public payroll accounting cycle counter.
 */
export async function submitAdvancePayrollCycleCall(
  providers: PayrollProviders,
  options: SubmitAdvancePayrollCycleCallOptions,
): Promise<FinalizedCallTxData<PrivatePayrollContract, "advance_payroll_cycle">> {
  const address = options.contractAddress?.trim();
  if (!isValidContractAddress(address)) {
    throw new Error(
      `Invalid contract address: "${options.contractAddress}". Cannot execute advance_payroll_cycle.`,
    );
  }

  const privateStateId = options.privateStateId || DEFAULT_PRIVATE_STATE_ID;

  // 1. If a deployedContract handle with callTx is already available, invoke it directly
  if (options.deployedContract?.callTx?.advance_payroll_cycle) {
    return await options.deployedContract.callTx.advance_payroll_cycle();
  }

  // 2. Otherwise construct the circuit call options and submit via submitCallTx
  const baseCompiled = CompiledContract.withVacantWitnesses(
    CompiledContract.make("private-payroll", Contract),
  );
  const compiledContract = CompiledContract.withCompiledFileAssets(
    baseCompiled,
    "contract/compiled",
  );

  const submitFn = options.submitCallTxFn || submitCallTx;
  return await submitFn(providers, {
    compiledContract,
    circuitId: "advance_payroll_cycle",
    contractAddress: address as ContractAddress,
    privateStateId,
    args: [],
  });
}

