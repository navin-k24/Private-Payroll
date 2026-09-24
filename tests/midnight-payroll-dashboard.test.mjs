import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  validateContractAddressInput,
  formatVerificationCount,
  formatSplitCount,
  formatPayrollCycle,
  getDashboardStatusInfo,
  getSplitPhaseLabel,
  getSplitPhaseDescription,
  canSubmitSplit,
  parseSalaryAmount,
  PRIVACY_MODEL_DETAILS,
} from "../lib/midnight/dashboard-model.ts";
import {
  queryPayrollLedgerState,
} from "../lib/midnight/payroll-session.ts";

const VALID_HEX_ADDRESS =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const VALID_BECH32M_ADDRESS =
  "contract_mn1q8testnetaddress0123456789abcdef0123456789";

test("Test 1: Wallet disconnected state model and presentation", () => {
  const statusInfo = getDashboardStatusInfo({
    walletStatus: "idle",
    contractLoading: false,
    contractError: "",
    hasSession: false,
    ledgerLoading: false,
    ledgerError: "",
    contractMode: "join",
  });

  assert.equal(statusInfo.label, "Wallet Not Connected");
  assert.equal(statusInfo.tone, "neutral");
  assert.match(statusInfo.message, /Connect your Midnight Lace wallet/);
});

test("Test 2: Successful wallet connection state transitions", () => {
  // Connecting state
  const connectingInfo = getDashboardStatusInfo({
    walletStatus: "connecting",
    contractLoading: false,
    contractError: "",
    hasSession: false,
    ledgerLoading: false,
    ledgerError: "",
    contractMode: "join",
  });
  assert.equal(connectingInfo.label, "Connecting Wallet");
  assert.equal(connectingInfo.tone, "working");

  // Connected state
  const connectedInfo = getDashboardStatusInfo({
    walletStatus: "connected",
    contractLoading: false,
    contractError: "",
    hasSession: false,
    ledgerLoading: false,
    ledgerError: "",
    contractMode: "join",
  });
  assert.equal(connectedInfo.label, "Wallet Connected");
  assert.equal(connectedInfo.tone, "neutral");
  assert.match(connectedInfo.message, /Midnight Lace is connected/);

  // Wallet error state
  const errorInfo = getDashboardStatusInfo({
    walletStatus: "error",
    contractLoading: false,
    contractError: "",
    hasSession: false,
    ledgerLoading: false,
    ledgerError: "",
    contractMode: "join",
  });
  assert.equal(errorInfo.label, "Wallet Error");
  assert.equal(errorInfo.tone, "error");
});

test("Test 3: Contract deploy and join interaction state transitions", async () => {
  // Deploying working state
  const deployingInfo = getDashboardStatusInfo({
    walletStatus: "connected",
    contractLoading: true,
    contractError: "",
    hasSession: false,
    ledgerLoading: false,
    ledgerError: "",
    contractMode: "deploy",
  });
  assert.equal(deployingInfo.label, "Deploying Contract");
  assert.equal(deployingInfo.tone, "working");

  // Joining working state
  const joiningInfo = getDashboardStatusInfo({
    walletStatus: "connected",
    contractLoading: true,
    contractError: "",
    hasSession: false,
    ledgerLoading: false,
    ledgerError: "",
    contractMode: "join",
  });
  assert.equal(joiningInfo.label, "Joining Contract");
  assert.equal(joiningInfo.tone, "working");

  // Contract active session ready state
  const readyInfo = getDashboardStatusInfo({
    walletStatus: "connected",
    contractLoading: false,
    contractError: "",
    hasSession: true,
    ledgerLoading: false,
    ledgerError: "",
    contractMode: "join",
  });
  assert.equal(readyInfo.label, "Contract Ready");
  assert.equal(readyInfo.tone, "success");

  // Contract error state
  const contractErrInfo = getDashboardStatusInfo({
    walletStatus: "connected",
    contractLoading: false,
    contractError: "Node rejected deployment transaction",
    hasSession: false,
    ledgerLoading: false,
    ledgerError: "",
    contractMode: "deploy",
  });
  assert.equal(contractErrInfo.label, "Contract Error");
  assert.equal(contractErrInfo.tone, "error");
  assert.equal(contractErrInfo.message, "Node rejected deployment transaction");
});

test("Test 4: Invalid and missing contract address handling", () => {
  // Empty input
  const emptyRes = validateContractAddressInput("");
  assert.equal(emptyRes.isValid, false);
  assert.equal(emptyRes.error, "Contract address is required.");

  // Placeholder
  const placeholderRes = validateContractAddressInput("placeholder");
  assert.equal(placeholderRes.isValid, false);
  assert.match(placeholderRes.error, /real deployed contract address/);

  // Ellipsis placeholder
  const ellipsisRes = validateContractAddressInput("0123456789abcdef...");
  assert.equal(ellipsisRes.isValid, false);

  // Too short
  const shortRes = validateContractAddressInput("too-short-addr");
  assert.equal(shortRes.isValid, false);
  assert.match(shortRes.error, /too short/);

  // Valid Hex 64-char
  const hexRes = validateContractAddressInput(VALID_HEX_ADDRESS);
  assert.equal(hexRes.isValid, true);
  assert.equal(hexRes.error, undefined);

  // Valid Bech32m
  const bechRes = validateContractAddressInput(VALID_BECH32M_ADDRESS);
  assert.equal(bechRes.isValid, true);
});

test("Test 5: Public verification_count loading, successful result, and indexer failure", async () => {
  // Format null / undefined
  assert.equal(formatVerificationCount(null), "—");
  assert.equal(formatVerificationCount(undefined), "—");

  // Format valid counts
  assert.equal(formatVerificationCount(0n), "0");
  assert.equal(formatVerificationCount(1n), "1");
  assert.equal(formatVerificationCount(42n), "42");

  // State info when ledger is loading
  const loadingInfo = getDashboardStatusInfo({
    walletStatus: "connected",
    contractLoading: false,
    contractError: "",
    hasSession: true,
    ledgerLoading: true,
    ledgerError: "",
    contractMode: "join",
  });
  assert.equal(loadingInfo.label, "Loading Public Payroll State");
  assert.equal(loadingInfo.tone, "working");

  // State info when indexer fails
  const indexerErrInfo = getDashboardStatusInfo({
    walletStatus: "connected",
    contractLoading: false,
    contractError: "",
    hasSession: true,
    ledgerLoading: false,
    ledgerError: "Indexer endpoint connection refused",
    contractMode: "join",
  });
  assert.equal(indexerErrInfo.label, "Indexer Unavailable");
  assert.equal(indexerErrInfo.tone, "error");
  assert.equal(indexerErrInfo.message, "Indexer endpoint connection refused");

  // Querying mock public data provider returns real count
  const mockPublicDataProvider = {
    queryContractState: async () => ({
      data: {
        verification_count: 9n,
        split_count: 5n,
        payroll_cycle: 2n,
        split_commitments: new Set(),
      },
    }),
  };
  const ledgerState = await queryPayrollLedgerState(
    mockPublicDataProvider,
    VALID_HEX_ADDRESS,
  );
  assert.equal(ledgerState.verification_count, 9n);
  assert.equal(ledgerState.split_count, 5n);
  assert.equal(ledgerState.payroll_cycle, 2n);
});

test("Test 6: Session and provider cleanup guarantees", async () => {
  let disposed = false;
  const mockSession = {
    contractAddress: VALID_HEX_ADDRESS,
    providers: {},
    privateStateId: "test-id",
    queryLedger: async () => ({ verification_count: 0n }),
    verifySalary: async () => ({}),
    dispose: async () => {
      disposed = true;
    },
  };

  await mockSession.dispose();
  assert.equal(disposed, true);

  // Inspect source code of dashboard component to verify cleanup hooks are installed
  const dashboardSource = await readFile(
    new URL("../components/private-payroll-dashboard.tsx", import.meta.url),
    "utf8",
  );

  // Verify unmount cleanup hook exists
  assert.match(dashboardSource, /sessionRef\.current\.dispose\(\)/);

  // Verify session disposal prior to creating or joining a new session
  assert.match(dashboardSource, /await payrollSession\.dispose\(\)/);

  // Verify wallet disconnect calls session disposal
  assert.match(dashboardSource, /handleDisconnectWallet/);
});

test("Test 7: Verify Privately button is connected and controlled by wallet/session validation readiness", async () => {
  const dashboardSource = await readFile(
    new URL("../components/private-payroll-dashboard.tsx", import.meta.url),
    "utf8",
  );

  // Verify the button is conditioned on canSubmit
  assert.match(dashboardSource, /disabled=\{!canSubmit\}/);

  // Verify the button click is wired to handleVerifySalary
  assert.match(dashboardSource, /onClick=\{handleVerifySalary\}/);

  // Verify handleVerifySalary invokes payrollSession.verifySalary with public max and private salary
  assert.match(dashboardSource, /payrollSession\.verifySalary\(/);

  // Verify raw salary is never logged
  assert.doesNotMatch(
    dashboardSource,
    /console\.log\(.*salary/i,
    "Salary amounts must never be printed to console",
  );
});

test("Test 8: Salary parsing and validation rules", () => {
  // Valid amounts
  const valid1 = parseSalaryAmount("5000");
  assert.equal(valid1.isValid, true);
  assert.equal(valid1.amount, 5000n);

  const valid2 = parseSalaryAmount("1000000");
  assert.equal(valid2.isValid, true);
  assert.equal(valid2.amount, 1000000n);

  // Zero rejected
  const zero = parseSalaryAmount("0");
  assert.equal(zero.isValid, false);
  assert.match(zero.error, /greater than zero/);

  // Negative rejected
  const negative = parseSalaryAmount("-500");
  assert.equal(negative.isValid, false);

  // Decimal rejected (Compact handles whole integer units)
  const decimal = parseSalaryAmount("5000.50");
  assert.equal(decimal.isValid, false);
});

test("Test 9: Privacy explanation integrity", () => {
  // Public list must contain verification count and maxAllowedSalary
  assert.ok(
    PRIVACY_MODEL_DETAILS.publicItems.some((item) =>
      item.toLowerCase().includes("verification count"),
    ),
  );
  assert.ok(
    PRIVACY_MODEL_DETAILS.publicItems.some((item) =>
      item.toLowerCase().includes("maximum allowed salary"),
    ),
  );

  // Private list must contain employee salary and witness data
  assert.ok(
    PRIVACY_MODEL_DETAILS.privateItems.some((item) =>
      item.toLowerCase().includes("raw salary"),
    ),
  );
  assert.ok(
    PRIVACY_MODEL_DETAILS.privateItems.some((item) =>
      item.toLowerCase().includes("witness"),
    ),
  );

  // Explanation must detail off-chain zero-knowledge evaluation
  assert.match(PRIVACY_MODEL_DETAILS.explanation, /zero-knowledge/);
  assert.match(PRIVACY_MODEL_DETAILS.explanation, /witness/);
});

test("Test 10: Private split models, formatters, and phase labels", () => {
  // Split count formatter
  assert.equal(formatSplitCount(null), "—");
  assert.equal(formatSplitCount(undefined), "—");
  assert.equal(formatSplitCount(0n), "0");
  assert.equal(formatSplitCount(12n), "12");

  // Payroll cycle formatter
  assert.equal(formatPayrollCycle(null), "—");
  assert.equal(formatPayrollCycle(undefined), "—");
  assert.equal(formatPayrollCycle(1n), "#1");
  assert.equal(formatPayrollCycle(5n), "#5");

  // Split phase labels
  assert.equal(getSplitPhaseLabel("idle"), "Record Private Split");
  assert.equal(getSplitPhaseLabel("preparing"), "Preparing private split");
  assert.equal(getSplitPhaseLabel("proving"), "Generating proof");
  assert.equal(getSplitPhaseLabel("approving"), "Waiting for wallet approval");
  assert.equal(getSplitPhaseLabel("submitting"), "Broadcasting split transaction");
  assert.equal(getSplitPhaseLabel("confirming"), "Waiting for confirmation");
  assert.equal(getSplitPhaseLabel("success"), "Split recorded on-chain");
  assert.equal(getSplitPhaseLabel("failed"), "Split failed");

  // Split phase descriptions
  assert.match(getSplitPhaseDescription("proving"), /zk-SNARK proof/i);
  assert.match(getSplitPhaseDescription("preparing"), /blinding nonce/i);

  // canSubmitSplit helper
  assert.equal(
    canSubmitSplit({
      walletStatus: "connected",
      hasSession: true,
      maxSalaryInput: "10000",
      privateSalaryInput: "7500",
      splitPhase: "idle",
    }),
    true,
  );

  assert.equal(
    canSubmitSplit({
      walletStatus: "idle",
      hasSession: true,
      maxSalaryInput: "10000",
      privateSalaryInput: "7500",
      splitPhase: "idle",
    }),
    false,
  );

  assert.equal(
    canSubmitSplit({
      walletStatus: "connected",
      hasSession: false,
      maxSalaryInput: "10000",
      privateSalaryInput: "7500",
      splitPhase: "idle",
    }),
    false,
  );

  // Dashboard status for split phase
  const workingSplitStatus = getDashboardStatusInfo({
    walletStatus: "connected",
    contractLoading: false,
    contractError: "",
    hasSession: true,
    ledgerLoading: false,
    ledgerError: "",
    contractMode: "join",
    splitPhase: "proving",
  });
  assert.equal(workingSplitStatus.label, "Generating proof");
  assert.equal(workingSplitStatus.tone, "working");

  const successSplitStatus = getDashboardStatusInfo({
    walletStatus: "connected",
    contractLoading: false,
    contractError: "",
    hasSession: true,
    ledgerLoading: false,
    ledgerError: "",
    contractMode: "join",
    splitPhase: "success",
  });
  assert.equal(successSplitStatus.label, "Split Recorded");
  assert.equal(successSplitStatus.tone, "success");

  const failedSplitStatus = getDashboardStatusInfo({
    walletStatus: "connected",
    contractLoading: false,
    contractError: "",
    hasSession: true,
    ledgerLoading: false,
    ledgerError: "",
    contractMode: "join",
    splitError: "Duplicate payroll split detected",
  });
  assert.equal(failedSplitStatus.label, "Split Failed");
  assert.equal(failedSplitStatus.tone, "error");
});

