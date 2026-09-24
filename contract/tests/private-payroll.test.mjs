import test from "node:test";
import assert from "node:assert/strict";
import * as __compactRuntime from "@midnight-ntwrk/compact-runtime";
import { Contract, ledger } from "../compiled/contract/index.js";

function setupContract(mockSalary, mockNonce) {
  const nonce = mockNonce || new Uint8Array(32).fill(1);
  const witnesses = {
    get_salary_amount: (ctx) => [ctx.privateState, mockSalary],
    get_split_nonce: (ctx) => [ctx.privateState, nonce],
  };

  const contract = new Contract(witnesses);
  const initial = contract.initialState({
    initialPrivateState: {},
    initialZswapLocalState: { coinPublicKey: new Uint8Array(32) },
  });

  return { contract, initial, witnesses };
}

function createContext(initial) {
  return __compactRuntime.createCircuitContext(
    __compactRuntime.dummyContractAddress(),
    initial.currentZswapLocalState.coinPublicKey,
    initial.currentContractState.data,
    initial.currentPrivateState,
  );
}

// ----------------------------------------------------------------------------
// Existing verify_salary circuit tests (backward compatibility preserved)
// ----------------------------------------------------------------------------

test("contract initializes with zero public verification count and zero split count", () => {
  const { initial } = setupContract(1000n);
  const currentLedger = ledger(initial.currentContractState.data);

  assert.equal(currentLedger.verification_count, 0n);
  assert.equal(currentLedger.split_count, 0n);
  assert.equal(currentLedger.payroll_cycle, 0n);
  assert.equal(currentLedger.split_commitments.size(), 0n);
});

test("verify_salary: accepts valid private salary within allowed limit and increments public counter", () => {
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

test("verify_salary: rejects zero private salary via circuit assertion", () => {
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

test("verify_salary: rejects private salary exceeding the maximum allowed limit", () => {
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

// ----------------------------------------------------------------------------
// Step 11: record_private_split circuit tests
// ----------------------------------------------------------------------------

test("record_private_split: valid private payroll split succeeds and returns commitment", () => {
  const salary = 6000n;
  const maxLimit = 10000n;
  const nonce = new Uint8Array(32).fill(42);
  const { contract, initial } = setupContract(salary, nonce);
  const context = createContext(initial);

  const { context: updatedContext, result: commitment } =
    contract.circuits.record_private_split(context, maxLimit);

  assert.ok(commitment instanceof Uint8Array);
  assert.equal(commitment.length, 32);

  const currentLedger = ledger(updatedContext.currentQueryContext.state);
  assert.equal(currentLedger.split_count, 1n);
  assert.equal(currentLedger.split_commitments.member(commitment), true);
  assert.equal(currentLedger.split_commitments.size(), 1n);
});

test("record_private_split: zero salary fails circuit assertion", () => {
  const zeroSalary = 0n;
  const maxLimit = 10000n;
  const { contract, initial } = setupContract(zeroSalary);
  const context = createContext(initial);

  assert.throws(
    () => {
      contract.circuits.record_private_split(context, maxLimit);
    },
    {
      message: /Salary amount must be strictly greater than zero/,
    },
  );
});

test("record_private_split: salary above policy ceiling fails circuit assertion", () => {
  const overLimitSalary = 12000n;
  const maxLimit = 10000n;
  const { contract, initial } = setupContract(overLimitSalary);
  const context = createContext(initial);

  assert.throws(
    () => {
      contract.circuits.record_private_split(context, maxLimit);
    },
    {
      message: /Salary amount exceeds maximum payroll limit/,
    },
  );
});

test("record_private_split: duplicate commitment fails with duplicate error", () => {
  const salary = 7500n;
  const maxLimit = 10000n;
  const nonce = new Uint8Array(32).fill(99);
  const { contract, initial } = setupContract(salary, nonce);
  const context1 = createContext(initial);

  // First split recording succeeds
  const { context: contextAfterFirst } =
    contract.circuits.record_private_split(context1, maxLimit);

  // Prepare second context chaining off the state of the first
  const context2 = createContext({
    currentContractState: { data: contextAfterFirst.currentQueryContext.state },
    currentPrivateState: contextAfterFirst.currentPrivateState,
    currentZswapLocalState: contextAfterFirst.currentZswapLocalState,
  });

  // Attempting to record identical split (same salary + same nonce => identical commitment) must fail
  assert.throws(
    () => {
      contract.circuits.record_private_split(context2, maxLimit);
    },
    {
      message: /Duplicate payroll split: commitment already recorded/,
    },
  );
});

test("record_private_split: raw salary and private nonce are absent from public ledger representation", () => {
  const privateSalary = 8888n;
  const nonce = new Uint8Array(32).fill(123);
  const maxLimit = 10000n;
  const { contract, initial } = setupContract(privateSalary, nonce);
  const context = createContext(initial);

  const { context: updatedContext } =
    contract.circuits.record_private_split(context, maxLimit);
  const updatedLedger = ledger(updatedContext.currentQueryContext.state);

  // The public ledger contains only structural counters and commitments
  assert.equal("salary" in updatedLedger, false);
  assert.equal("salaryAmount" in updatedLedger, false);
  assert.equal("nonce" in updatedLedger, false);
  assert.equal("splitNonce" in updatedLedger, false);
  assert.equal(updatedLedger.split_count, 1n);
});

test("record_private_split: split counter increments after each distinct successful split", () => {
  const maxLimit = 20000n;
  const nonce1 = new Uint8Array(32).fill(1);
  const nonce2 = new Uint8Array(32).fill(2);

  let currentNonce = nonce1;
  let currentSalary = 5000n;

  const witnesses = {
    get_salary_amount: (ctx) => [ctx.privateState, currentSalary],
    get_split_nonce: (ctx) => [ctx.privateState, currentNonce],
  };

  const contract = new Contract(witnesses);
  const initial = contract.initialState({
    initialPrivateState: {},
    initialZswapLocalState: { coinPublicKey: new Uint8Array(32) },
  });

  // Split 1
  const ctx1 = createContext(initial);
  const { context: ctxAfter1, result: comm1 } =
    contract.circuits.record_private_split(ctx1, maxLimit);
  const ledger1 = ledger(ctxAfter1.currentQueryContext.state);
  assert.equal(ledger1.split_count, 1n);

  // Split 2 with different nonce & salary
  currentSalary = 9000n;
  currentNonce = nonce2;
  const ctx2 = createContext({
    currentContractState: { data: ctxAfter1.currentQueryContext.state },
    currentPrivateState: ctxAfter1.currentPrivateState,
    currentZswapLocalState: ctxAfter1.currentZswapLocalState,
  });

  const { context: ctxAfter2, result: comm2 } =
    contract.circuits.record_private_split(ctx2, maxLimit);
  const ledger2 = ledger(ctxAfter2.currentQueryContext.state);

  assert.equal(ledger2.split_count, 2n);
  assert.notDeepEqual(comm1, comm2);
  assert.equal(ledger2.split_commitments.size(), 2n);
  assert.equal(ledger2.split_commitments.member(comm1), true);
  assert.equal(ledger2.split_commitments.member(comm2), true);
});
