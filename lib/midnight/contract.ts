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
 * Holds off-chain sensitive data such as the employee's salary amount.
 */
export type PayrollPrivateState = {
  readonly salaryAmount?: bigint;
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
 * Public ledger state tracking on-chain verification count.
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
 * Builds the witness handlers required by the Private Payroll contract.
 *
 * The witness retrieves the private salary from the private state or the provided value,
 * injecting it strictly into the zero-knowledge prover without posting it to the ledger.
 *
 * @param salaryAmount - The private compensation value to feed into the circuit.
 */
export function createPayrollWitnesses(
  salaryAmount: bigint,
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
