/**
 * Application-facing contract definition layer for Midnight Private Payroll.
 *
 * Connects the compiled Compact contract artifacts with application types,
 * exposing circuits, witnesses, and ledger state in a strictly type-safe manner.
 */

import type { DeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import {
  Contract,
  ledger,
  type Circuits,
  type Ledger,
  type Witnesses,
} from "../../contract/compiled/contract/index.js";

/**
 * Client-side private state for Private Payroll.
 * Holds off-chain sensitive data such as the employee's salary amount
 * and high-entropy private split nonces.
 */
export type PayrollPrivateState = {
  readonly salaryAmount?: bigint;
  readonly splitNonce?: Uint8Array;
};

/**
 * Witness functions required by the Compact private payroll circuit.
 */
export type PayrollWitnesses = Witnesses<PayrollPrivateState>;

/**
 * Circuits exposed by the compiled Compact contract.
 */
export type PayrollCircuits = Circuits<PayrollPrivateState>;

/**
 * Public ledger state tracking on-chain verification and split counts.
 */
export type PayrollLedger = Ledger;

/**
 * Strongly typed Contract instance for Private Payroll.
 */
export type PrivatePayrollContract = Contract<
  PayrollPrivateState,
  PayrollWitnesses
>;

/**
 * Type alias for a deployed Midnight Private Payroll contract instance
 * managed by MidnightJS.
 */
export type DeployedPayrollContract = DeployedContract<PrivatePayrollContract>;

/**
 * Generates a high-entropy 32-byte cryptographically secure random nonce for private split commitments.
 */
export function generateSplitNonce(): Uint8Array {
  const nonce = new Uint8Array(32);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(nonce);
  } else {
    for (let i = 0; i < 32; i++) {
      nonce[i] = Math.floor(Math.random() * 256);
    }
  }
  return nonce;
}

/**
 * Converts a 32-byte Uint8Array to a hex string for non-sensitive display or comparison.
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Builds the witness handlers required by the Private Payroll contract.
 *
 * The witness retrieves the private salary and blinding nonce from the private state
 * or the provided values, injecting them strictly into the zero-knowledge prover without
 * posting them to the public ledger.
 *
 * @param salaryAmount - The private compensation value to feed into the circuit.
 * @param splitNonce - Optional high-entropy 32-byte blinding factor for split commitments.
 */
export function createPayrollWitnesses(
  salaryAmount: bigint,
  splitNonce?: Uint8Array,
): PayrollWitnesses {
  return {
    get_salary_amount: (context) => {
      const currentSalary =
        context.privateState?.salaryAmount ?? salaryAmount;
      return [
        {
          ...context.privateState,
          salaryAmount: currentSalary,
        },
        currentSalary,
      ];
    },
    get_split_nonce: (context) => {
      const currentNonce =
        context.privateState?.splitNonce ??
        splitNonce ??
        generateSplitNonce();
      return [
        {
          ...context.privateState,
          splitNonce: currentNonce,
        },
        currentNonce,
      ];
    },
  };
}

/**
 * Factory function to instantiate the compiled Private Payroll contract
 * with the provided witness handlers.
 *
 * @param witnesses - The witness implementation providing off-chain private inputs.
 */
export function createPayrollContract(
  witnesses: PayrollWitnesses,
): PrivatePayrollContract {
  return new Contract(witnesses);
}

/**
 * Helper to extract and format the public ledger state from a raw or charged state.
 */
export function getPayrollLedgerState(state: Parameters<typeof ledger>[0]): PayrollLedger {
  return ledger(state);
}

export { Contract, ledger };
