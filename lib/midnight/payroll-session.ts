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
export { isValidContractAddress };

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
   */
  readonly verifySalary: (
    maxAllowedSalary: bigint,
  ) => Promise<FinalizedCallTxData<PrivatePayrollContract, "verify_salary">>;

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

  const err =
    typeof error === "string"
      ? { message: error }
      : (error as { message?: string; reason?: string; name?: string });
  const msg = err.message || err.reason || "";

  if (msg.includes("Invalid contract address")) {
    return msg;
  }
  if (
    msg.includes("connectedAPI is required") ||
    msg.includes("wallet not connected") ||
    msg.includes("Midnight Lace wallet extension is not detected")
  ) {
    return "Wallet is not connected. Please connect Midnight Lace to proceed with contract operations.";
  }
  if (
    msg.includes("Missing proof-server") ||
    msg.includes("prover") ||
    msg.includes("Proof server")
  ) {
    return "Midnight proof-server configuration is unavailable or unreachable. Ensure your prover service is running.";
  }
  if (msg.includes("Missing indexer") || msg.includes("indexer")) {
    return "Midnight indexer configuration is unavailable or unreachable. Check your network configuration.";
  }
  if (
    msg.includes("Contract not found") ||
    msg.includes("no matching data") ||
    msg.includes("ContractTypeError")
  ) {
    return `Contract was not found on the Midnight network or contract verification keys do not match: ${msg}`;
  }
  if (
    msg.includes("DeployTxFailedError") ||
    msg.includes("deploy") ||
    msg.includes("Deployment failed")
  ) {
    return `Private Payroll deployment failed: ${msg}`;
  }
  if (
    msg.includes("CallTxFailedError") ||
    msg.includes("verify_salary")
  ) {
    return `Salary verification circuit execution failed: ${msg}`;
  }

  return msg || "Failed to process contract session operation.";
}

/**
 * Safely extracts the public ledger state from contract state data.
 */
export function safeGetPayrollLedger(data: unknown): PayrollLedger {
  if (!data) return { verification_count: BigInt(0) };
  if (typeof (data as { verification_count?: bigint }).verification_count === "bigint") {
    return { verification_count: (data as { verification_count: bigint }).verification_count };
  }
  try {
    return getPayrollLedgerState(data as Parameters<typeof getPayrollLedgerState>[0]);
  } catch {
    return { verification_count: BigInt(0) };
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
    return {
      verification_count: BigInt(0),
    };
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
      verifySalary: async (maxAllowedSalary: bigint) =>
        submitVerifySalaryCall(providers, {
          contractAddress: deployedAddress,
          maxAllowedSalary,
          privateSalary: initialSalary,
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
      verifySalary: async (maxAllowedSalary: bigint) =>
        submitVerifySalaryCall(providers, {
          contractAddress,
          maxAllowedSalary,
          privateSalary: options.initialSalary,
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
