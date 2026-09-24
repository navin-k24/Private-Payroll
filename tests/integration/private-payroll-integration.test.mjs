/**
 * Real Midnight Integration Tests for Private Payroll / Splits.
 *
 * Verifies that the Private Payroll Compact contract executes correctly through
 * the Midnight runtime/witness/provider/ledger state-machine pipeline.
 *
 * Scenarios Tested:
 * 1. Real deployment + initial ledger read.
 * 2. Real private salary verification (verify_salary).
 * 3. Real private payroll split (record_private_split with 32-byte commitment).
 * 4. Duplicate commitment rejection (duplicate split rejected, state unchanged).
 * 5. Zero salary rejection (salary = 0 rejected by circuit assertion).
 * 6. Salary-above-ceiling rejection (salary > ceiling rejected by circuit assertion).
 * 7. Payroll cycle advancement (advance_payroll_cycle increments cycle, retains splits).
 * 8. Strict privacy assertions (public parameters only reveal ceiling; ledger has no raw salary).
 * 9. Resource lifecycle cleanup (LevelDB temporary storage teardown).
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  createPayrollIntegrationHarness,
  checkDevnetAvailability,
} from "./helpers/local-devnet-env.mjs";
import { generateSplitNonce } from "../../lib/midnight/contract.ts";

test("Midnight Private Payroll - Local Integration Test Suite", async (t) => {
  // Check DevNet reachability status
  const devnetStatus = await checkDevnetAvailability();
  t.diagnostic(
    `[DevNet Status] Proof Server: ${devnetStatus.proofServer ? "ONLINE" : "OFFLINE"}, ` +
    `Indexer: ${devnetStatus.indexer ? "ONLINE" : "OFFLINE"} ` +
    `(${devnetStatus.isAvailable ? "Live devnet detected" : "Standalone contract runtime engine"})`,
  );

  let harness;
  const initialSalary = 7500n;
  const initialNonce = new Uint8Array(32).fill(77);

  t.before(async () => {
    harness = await createPayrollIntegrationHarness({
      initialSalary,
      initialNonce,
    });
  });

  t.after(async () => {
    if (harness) {
      await harness.dispose();
    }
  });

  // --------------------------------------------------------------------------
  // Scenario 1: Real Deployment & Initial Ledger State
  // --------------------------------------------------------------------------
  await t.test("Scenario 1: Contract initializes with zero counters and empty split commitment set", async () => {
    const initialLedger = harness.queryLedger();

    assert.equal(typeof initialLedger.verification_count, "bigint");
    assert.equal(initialLedger.verification_count, 0n, "Initial verification_count must be 0");
    assert.equal(initialLedger.split_count, 0n, "Initial split_count must be 0");
    assert.equal(initialLedger.payroll_cycle, 0n, "Initial payroll_cycle must be 0");
    assert.equal(initialLedger.split_commitments.isEmpty(), true, "Commitment set must start empty");
    assert.equal(initialLedger.split_commitments.size(), 0n, "Commitment set size must be 0");
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Real Private Salary Verification & Privacy Boundary
  // --------------------------------------------------------------------------
  await t.test("Scenario 2: Real private salary verification succeeds and enforces privacy boundary", async () => {
    const ceiling = 10000n;
    const privateSalary = 7500n;

    const result = await harness.executeVerifySalary(ceiling, privateSalary);

    // Assert on-chain state update
    assert.equal(result.ledger.verification_count, 1n, "verification_count must increment to 1");
    assert.equal(result.ledger.split_count, 0n, "split_count must remain 0");

    // Privacy assertion 1: Public transaction arguments contain ONLY the ceiling
    assert.deepEqual(result.publicArgs, [ceiling]);
    assert.equal(result.publicArgs.includes(privateSalary), false, "Private salary must NOT be in public arguments");

    // Privacy assertion 2: Public ledger contains no private salary fields
    assert.equal("salary" in result.ledger, false, "Raw salary must not exist on public ledger");
    assert.equal("salaryAmount" in result.ledger, false, "salaryAmount must not exist on public ledger");
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Real Private Payroll Split with Cryptographic Commitment
  // --------------------------------------------------------------------------
  let firstSplitCommitment;
  const splitNonce = new Uint8Array(32).fill(99);

  await t.test("Scenario 3: Real private payroll split commits 32-byte hash and increments split_count", async () => {
    const ceiling = 10000n;
    const privateSalary = 7500n;

    const result = await harness.executeRecordPrivateSplit(ceiling, privateSalary, splitNonce);
    firstSplitCommitment = result.commitment;

    // Assert commitment properties
    assert.ok(result.commitment instanceof Uint8Array, "Commitment must be a Uint8Array");
    assert.equal(result.commitment.length, 32, "Commitment must be exactly 32 bytes");
    assert.equal(result.commitmentHex.length, 64, "Commitment hex must be 64 characters");

    // Assert on-chain ledger state
    assert.equal(result.ledger.split_count, 1n, "split_count must increment to 1");
    assert.equal(result.ledger.split_commitments.size(), 1n, "Commitment set size must be 1");
    assert.equal(result.ledger.split_commitments.member(result.commitment), true, "Commitment must be member of set");

    // Privacy assertions: Public arguments contain only ceiling; nonce & salary absent from ledger
    assert.deepEqual(result.publicArgs, [ceiling]);
    assert.equal("nonce" in result.ledger, false, "Blinding nonce must not exist on public ledger");
    assert.equal("splitNonce" in result.ledger, false, "splitNonce must not exist on public ledger");
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Duplicate Commitment Rejection & State Invariance
  // --------------------------------------------------------------------------
  await t.test("Scenario 4: Re-submitting identical split commitment is rejected and preserves state", async () => {
    const ceiling = 10000n;
    const privateSalary = 7500n;

    // Attempting to record identical split (same salary + same nonce) must throw
    await assert.rejects(
      async () => {
        await harness.executeRecordPrivateSplit(ceiling, privateSalary, splitNonce);
      },
      {
        message: /Duplicate payroll split: commitment already recorded/,
      },
      "Duplicate commitment must trigger contract circuit assertion error",
    );

    // Verify state was not modified by the failed transaction
    const currentLedger = harness.queryLedger();
    assert.equal(currentLedger.split_count, 1n, "split_count must remain 1 after duplicate rejection");
    assert.equal(currentLedger.split_commitments.size(), 1n, "Commitment set size must remain 1");
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Zero Salary Circuit Rejection
  // --------------------------------------------------------------------------
  await t.test("Scenario 5: Zero salary is rejected by circuit assertion with counters untouched", async () => {
    const ceiling = 10000n;
    const zeroSalary = 0n;
    const newNonce = generateSplitNonce();

    // In verify_salary
    await assert.rejects(
      async () => {
        await harness.executeVerifySalary(ceiling, zeroSalary);
      },
      {
        message: /Salary amount must be strictly greater than zero/,
      },
    );

    // In record_private_split
    await assert.rejects(
      async () => {
        await harness.executeRecordPrivateSplit(ceiling, zeroSalary, newNonce);
      },
      {
        message: /Salary amount must be strictly greater than zero/,
      },
    );

    // Verify counters remain unchanged
    const ledgerAfter = harness.queryLedger();
    assert.equal(ledgerAfter.verification_count, 1n, "verification_count must not increment on failure");
    assert.equal(ledgerAfter.split_count, 1n, "split_count must not increment on failure");
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Salary Exceeding Policy Ceiling Rejection
  // --------------------------------------------------------------------------
  await t.test("Scenario 6: Salary exceeding ceiling is rejected by circuit assertion", async () => {
    const ceiling = 10000n;
    const excessiveSalary = 25000n;
    const newNonce = generateSplitNonce();

    await assert.rejects(
      async () => {
        await harness.executeVerifySalary(ceiling, excessiveSalary);
      },
      {
        message: /Salary amount exceeds maximum payroll limit/,
      },
    );

    await assert.rejects(
      async () => {
        await harness.executeRecordPrivateSplit(ceiling, excessiveSalary, newNonce);
      },
      {
        message: /Salary amount exceeds maximum payroll limit/,
      },
    );

    const ledgerAfter = harness.queryLedger();
    assert.equal(ledgerAfter.verification_count, 1n);
    assert.equal(ledgerAfter.split_count, 1n);
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Payroll Cycle Advancement
  // --------------------------------------------------------------------------
  await t.test("Scenario 7: Payroll cycle advancement increments cycle counter and retains split history", async () => {
    const result = await harness.executeAdvancePayrollCycle();

    assert.equal(result.ledger.payroll_cycle, 1n, "payroll_cycle must increment from 0 to 1");
    assert.equal(result.ledger.split_count, 1n, "Existing split_count must be preserved");
    assert.equal(result.ledger.verification_count, 1n, "Existing verification_count must be preserved");
    assert.equal(result.ledger.split_commitments.size(), 1n, "Prior split commitments must remain in set");
    assert.equal(result.ledger.split_commitments.member(firstSplitCommitment), true, "First split commitment remains present");
    assert.deepEqual(result.publicArgs, [], "advance_payroll_cycle takes no arguments");

    // Advance cycle a second time
    const result2 = await harness.executeAdvancePayrollCycle();
    assert.equal(result2.ledger.payroll_cycle, 2n, "payroll_cycle must increment to 2");
  });
});
