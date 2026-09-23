import test from "node:test";
import assert from "node:assert/strict";
import * as __compactRuntime from "@midnight-ntwrk/compact-runtime";
import { Contract, ledger } from "../compiled/contract/index.js";

function setupContract(mockSalary) {
  const witnesses = {
    get_salary_amount: (ctx) => [ctx.privateState, mockSalary],
  };

  const contract = new Contract(witnesses);
  const initial = contract.initialState({
    initialPrivateState: {},
    initialZswapLocalState: { coinPublicKey: new Uint8Array(32) },
  });

  return { contract, initial };
}

function createContext(initial) {
  return __compactRuntime.createCircuitContext(
    __compactRuntime.dummyContractAddress(),
    initial.currentZswapLocalState.coinPublicKey,
    initial.currentContractState.data,
    initial.currentPrivateState,
  );
}

test("contract initializes with zero public verification count", () => {
  const { initial } = setupContract(1000n);
  const currentLedger = ledger(initial.currentContractState.data);

  assert.equal(currentLedger.verification_count, 0n);
});

test("accepts valid private salary within allowed limit and increments public counter", () => {
  const validSalary = 5000n;
  const maxLimit = 10000n;
  const { contract, initial } = setupContract(validSalary);
  const context = createContext(initial);

  const { context: updatedContext } = contract.circuits.verify_salary(
    context,
    maxLimit,
  );
  const updatedLedger = ledger(updatedContext.currentQueryContext.state);

  // Verification counter incremented to 1
  assert.equal(updatedLedger.verification_count, 1n);

  // Run a second verification
  const context2 = createContext({
    currentContractState: { data: updatedContext.currentQueryContext.state },
    currentPrivateState: updatedContext.currentPrivateState,
    currentZswapLocalState: updatedContext.currentZswapLocalState,
  });
  const { context: updatedContext2 } = contract.circuits.verify_salary(
    context2,
    maxLimit,
  );
  const updatedLedger2 = ledger(updatedContext2.currentQueryContext.state);

  assert.equal(updatedLedger2.verification_count, 2n);
});

test("rejects zero private salary via circuit assertion", () => {
  const zeroSalary = 0n;
  const maxLimit = 10000n;
  const { contract, initial } = setupContract(zeroSalary);
  const context = createContext(initial);

  assert.throws(
    () => {
      contract.circuits.verify_salary(context, maxLimit);
    },
    {
      message: /Salary amount must be strictly greater than zero/,
    },
  );
});

test("rejects private salary exceeding the maximum allowed limit", () => {
  const excessiveSalary = 25000n;
  const maxLimit = 10000n;
  const { contract, initial } = setupContract(excessiveSalary);
  const context = createContext(initial);

  assert.throws(
    () => {
      contract.circuits.verify_salary(context, maxLimit);
    },
    {
      message: /Salary amount exceeds maximum payroll limit/,
    },
  );
});

test("verifies privacy boundary: raw salary is never recorded on public ledger", () => {
  const privateSalary = 7777n;
  const maxLimit = 10000n;
  const { contract, initial } = setupContract(privateSalary);
  const context = createContext(initial);

  const { context: updatedContext } = contract.circuits.verify_salary(
    context,
    maxLimit,
  );
  const updatedLedger = ledger(updatedContext.currentQueryContext.state);

  // The public ledger contains ONLY verification_count
  const publicKeys = Object.keys(updatedLedger);
  assert.deepEqual(publicKeys, ["verification_count"]);
  assert.equal("salary" in updatedLedger, false);
  assert.equal(String(updatedLedger.verification_count), "1");
});
