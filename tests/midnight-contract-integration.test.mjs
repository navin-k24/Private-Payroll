import test from "node:test";
import assert from "node:assert/strict";
import * as __compactRuntime from "@midnight-ntwrk/compact-runtime";
import {
  createPayrollContract,
  createPayrollWitnesses,
  getPayrollLedgerState,
  ledger,
} from "../lib/midnight/contract.ts";
import {
  createPayrollSessionConfig,
  DEFAULT_PRIVATE_STATE_ID,
  initializePayrollSession,
} from "../lib/midnight/session.ts";

test("Midnight contract integration: imports compiled contract and verifies circuit existence", () => {
  const salary = 8500n;
  const witnesses = createPayrollWitnesses(salary);
  const contract = createPayrollContract(witnesses);

  // 1. Verify contract instance exists
  assert.ok(contract);
  assert.equal(typeof contract, "object");

  // 2. Verify circuits property exists and exposes verify_salary
  assert.ok(contract.circuits);
  assert.equal(typeof contract.circuits.verify_salary, "function");

  // 3. Verify impureCircuits and provableCircuits reflect the circuit
  assert.equal(typeof contract.impureCircuits.verify_salary, "function");
  assert.equal(typeof contract.provableCircuits.verify_salary, "function");

  // 4. Verify witness binding
  assert.equal(typeof contract.witnesses.get_salary_amount, "function");
});

test("Midnight contract integration: ledger definition is available and tracks public state", () => {
  const salary = 12000n;
  const witnesses = createPayrollWitnesses(salary);
  const contract = createPayrollContract(witnesses);

  // Initialize state
  const initial = contract.initialState({
    initialPrivateState: { salaryAmount: salary },
    initialZswapLocalState: { coinPublicKey: new Uint8Array(32) },
  });

  // Verify ledger definition
  const initialLedger = getPayrollLedgerState(initial.currentContractState.data);
  assert.equal(typeof initialLedger.verification_count, "bigint");
  assert.equal(initialLedger.verification_count, 0n);

  // Execute circuit
  const circuitContext = __compactRuntime.createCircuitContext(
    __compactRuntime.dummyContractAddress(),
    initial.currentZswapLocalState.coinPublicKey,
    initial.currentContractState.data,
    initial.currentPrivateState,
  );

  const { context } = contract.circuits.verify_salary(circuitContext, 20000n);
  const updatedLedger = ledger(context.currentQueryContext.state);

  // Verify public ledger incremented
  assert.equal(updatedLedger.verification_count, 1n);
});

test("Midnight contract session: configures session and wires contract without fake network calls", () => {
  const config = createPayrollSessionConfig();
  assert.equal(config.privateStateId, DEFAULT_PRIVATE_STATE_ID);
  assert.equal(config.contractAddress, undefined);

  // Initializing with salary sets state to ready and wires the contract
  const session = initializePayrollSession(config, 7500n);
  assert.equal(session.status, "ready");
  assert.equal(session.privateState.salaryAmount, 7500n);
  assert.ok(session.contract);
  assert.equal(typeof session.contract.circuits.verify_salary, "function");
});
