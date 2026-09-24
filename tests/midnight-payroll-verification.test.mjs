import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  joinPrivatePayrollContract,
  submitVerifySalaryCall,
  submitRecordPrivateSplitCall,
  mapPayrollSessionError,
} from "../lib/midnight/payroll-session.ts";
import {
  createPayrollWitnesses,
} from "../lib/midnight/contract.ts";
import {
  canSubmitVerification,
  getVerificationPhaseLabel,
  getVerificationPhaseDescription,
  parseSalaryAmount,
  getDashboardStatusInfo,
} from "../lib/midnight/dashboard-model.ts";
import { DEFAULT_PRIVATE_STATE_ID } from "../lib/midnight/session.ts";

const MOCK_CONTRACT_ADDRESS =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function createMockPayrollProviders(overrides = {}) {
  let disposed = false;
  const privateStateMap = new Map();
  let currentContractAddress = "";

  const privateStateProvider = {
    get: async (key) => privateStateMap.get(key),
    set: async (key, val) => {
      privateStateMap.set(key, val);
    },
    remove: async (key) => {
      privateStateMap.delete(key);
    },
    clear: async () => {
      privateStateMap.clear();
    },
    setContractAddress: (addr) => {
      currentContractAddress = addr;
    },
    getContractAddress: () => currentContractAddress,
    setSigningKey: async () => {},
    getSigningKey: async () => undefined,
    ...(overrides.privateStateProvider || {}),
  };

  let ledgerVerificationCount = 0n;
  if (overrides.initialVerificationCount !== undefined) {
    ledgerVerificationCount = overrides.initialVerificationCount;
  }
  let ledgerSplitCount = overrides.initialSplitCount !== undefined ? overrides.initialSplitCount : 0n;
  let ledgerPayrollCycle = overrides.initialPayrollCycle !== undefined ? overrides.initialPayrollCycle : 1n;

  const publicDataProvider = {
    queryContractState: async () => ({
      data: {
        verification_count: ledgerVerificationCount,
        split_count: ledgerSplitCount,
        payroll_cycle: ledgerPayrollCycle,
        split_commitments: new Set(),
      },
    }),
    watchForTxData: async () => ({
      status: "succeedEntirely",
    }),
    queryContractStateAtBlock: async () => null,
    queryZswapState: async () => null,
    queryBlockState: async () => null,
    incrementLedger: () => {
      ledgerVerificationCount += 1n;
    },
    ...(overrides.publicDataProvider || {}),
  };

  const zkConfigProvider = {
    getZKIR: async () => new Uint8Array(0),
    getProverKey: async () => new Uint8Array(0),
    getVerifierKey: async () => new Uint8Array(0),
    ...(overrides.zkConfigProvider || {}),
  };

  const proofProvider = {
    proveTx: async () => ({}),
    ...(overrides.proofProvider || {}),
  };

  const walletProvider = {
    balanceTx: async () => ({}),
    getCoinPublicKey: () => new Uint8Array(32),
    getEncryptionPublicKey: () => new Uint8Array(32),
    ...(overrides.walletProvider || {}),
  };

  const midnightProvider = {
    submitTx: async () => "mock-tx-id",
    ...(overrides.midnightProvider || {}),
  };

  return {
    privateStateProvider,
    publicDataProvider,
    zkConfigProvider,
    proofProvider,
    walletProvider,
    midnightProvider,
    dispose: async () => {
      disposed = true;
      if (overrides.onDispose) overrides.onDispose();
    },
    get isDisposed() {
      return disposed;
    },
    ...overrides,
  };
}

function createMockDeployedContract(contractAddress, onVerifySalary, onRecordSplit) {
  return {
    deployTxData: {
      public: {
        contractAddress,
        status: "succeedEntirely",
      },
    },
    callTx: {
      verify_salary: onVerifySalary || (async () => ({
        public: { txId: "tx_mock_call_001", status: "succeedEntirely" },
      })),
      record_private_split: onRecordSplit || (async () => ({
        public: {
          txId: "tx_mock_split_001",
          status: "succeedEntirely",
          result: new Uint8Array(32).fill(1),
        },
      })),
    },
    circuitMaintenanceTx: {},
    contractMaintenanceTx: {},
  };
}

test("Test A: Transaction builder receives only maxAllowedSalary as public argument", async () => {
  const providers = createMockPayrollProviders();
  let capturedCircuitArgs = null;

  const mockSubmitCallTx = async (prov, opts) => {
    capturedCircuitArgs = opts.args;
    return {
      public: {
        txId: "tx_public_arg_check_100",
        status: "succeedEntirely",
      },
    };
  };

  const maxSalary = 20000n;
  const privateSalary = 15000n;

  await submitVerifySalaryCall(providers, {
    contractAddress: MOCK_CONTRACT_ADDRESS,
    maxAllowedSalary: maxSalary,
    privateSalary,
    submitCallTxFn: mockSubmitCallTx,
  });

  // Verify that args array strictly contains only [maxSalary]
  assert.ok(capturedCircuitArgs);
  assert.equal(capturedCircuitArgs.length, 1);
  assert.equal(capturedCircuitArgs[0], maxSalary);
  assert.notEqual(capturedCircuitArgs[0], privateSalary);
});

test("Test B: Private salary is supplied through witness/private-state mechanism", async () => {
  const providers = createMockPayrollProviders();
  const privateSalary = 12500n;

  // Execute verification call with privateSalary
  await submitVerifySalaryCall(providers, {
    contractAddress: MOCK_CONTRACT_ADDRESS,
    maxAllowedSalary: 15000n,
    privateSalary,
    deployedContract: createMockDeployedContract(MOCK_CONTRACT_ADDRESS),
  });

  // Check that the private state provider stored the private salary
  const storedState = await providers.privateStateProvider.get(DEFAULT_PRIVATE_STATE_ID);
  assert.deepEqual(storedState, { salaryAmount: privateSalary });

  // Check witness extraction
  const witnesses = createPayrollWitnesses(privateSalary);
  const context = {
    privateState: { salaryAmount: privateSalary },
  };
  const [nextState, witnessValue] = witnesses.get_salary_amount(context);
  assert.equal(witnessValue, privateSalary);
  assert.deepEqual(nextState.salaryAmount, privateSalary);
});

test("Test C: Changing private salary does not change public transaction argument list", async () => {
  const providers = createMockPayrollProviders();
  const maxSalary = 30000n;

  let capturedArgs1 = null;
  let capturedArgs2 = null;

  // First call with privateSalary = 10000n
  await submitVerifySalaryCall(providers, {
    contractAddress: MOCK_CONTRACT_ADDRESS,
    maxAllowedSalary: maxSalary,
    privateSalary: 10000n,
    submitCallTxFn: async (p, opts) => {
      capturedArgs1 = opts.args;
      return { public: { txId: "tx_1" } };
    },
  });

  // Second call with privateSalary = 25000n
  await submitVerifySalaryCall(providers, {
    contractAddress: MOCK_CONTRACT_ADDRESS,
    maxAllowedSalary: maxSalary,
    privateSalary: 25000n,
    submitCallTxFn: async (p, opts) => {
      capturedArgs2 = opts.args;
      return { public: { txId: "tx_2" } };
    },
  });

  // Both public transaction argument lists must be strictly identical: [30000n]
  assert.deepEqual(capturedArgs1, [maxSalary]);
  assert.deepEqual(capturedArgs2, [maxSalary]);
  assert.deepEqual(capturedArgs1, capturedArgs2);
});

test("Test D: Successful verification triggers refresh/query of public verification_count", async () => {
  let queryCount = 0;
  const providers = createMockPayrollProviders({
    initialVerificationCount: 3n,
    publicDataProvider: {
      queryContractState: async () => {
        queryCount += 1;
        // On subsequent query after call, returns incremented state
        return {
          data: { verification_count: BigInt(2 + queryCount) },
        };
      },
    },
  });

  const session = await joinPrivatePayrollContract({
    contractAddress: MOCK_CONTRACT_ADDRESS,
    providers,
    findDeployedContractFn: async () =>
      createMockDeployedContract(MOCK_CONTRACT_ADDRESS),
  });

  // Initial query
  const initialLedger = await session.queryLedger();
  assert.equal(initialLedger.verification_count, 3n);

  // Execute verification
  const txResult = await session.verifySalary(10000n, 8000n);
  assert.ok(txResult.public.txId);

  // Refresh query
  const updatedLedger = await session.queryLedger();
  assert.equal(updatedLedger.verification_count, 4n);
  assert.equal(queryCount, 2);
});

test("Test E: Failed verification does not fake or manually increment verification_count", async () => {
  let ledgerCount = 5n;
  const providers = createMockPayrollProviders({
    publicDataProvider: {
      queryContractState: async () => ({
        data: { verification_count: ledgerCount },
      }),
    },
  });

  const failingDeployedContract = createMockDeployedContract(
    MOCK_CONTRACT_ADDRESS,
    async () => {
      throw new Error("salary exceeds maximum allowed");
    },
  );

  const session = await joinPrivatePayrollContract({
    contractAddress: MOCK_CONTRACT_ADDRESS,
    providers,
    findDeployedContractFn: async () => failingDeployedContract,
  });

  // Verify salary exceeds max
  await assert.rejects(
    async () => {
      await session.verifySalary(5000n, 8000n);
    },
    /salary exceeds/i,
  );

  // Query ledger: counter must remain untouched
  const ledger = await session.queryLedger();
  assert.equal(ledger.verification_count, 5n);
});

test("Test F: UI / models do not log or expose private salary in public transaction data", async () => {
  const dashboardSource = await readFile(
    new URL("../components/private-payroll-dashboard.tsx", import.meta.url),
    "utf8",
  );

  // Assert no console.log of salary
  assert.doesNotMatch(
    dashboardSource,
    /console\.log\(.*salary/i,
    "Salary must never be written to console.log",
  );

  // Assert input has type="password" to protect over-the-shoulder privacy
  assert.match(
    dashboardSource,
    /id="private-salary-input"[^>]*type="password"/,
    "Private salary input must be protected with type=password",
  );

  // Assert error mapper does not leak numbers
  const mappedCircuitErr = mapPayrollSessionError(
    new Error("salary exceeds maximum allowed: 99999999"),
  );
  assert.doesNotMatch(mappedCircuitErr, /99999999/);
  assert.match(mappedCircuitErr, /Private salary exceeds maximum allowed/);
});

test("Integration Scenario: Full mocked verification pipeline from wallet to ledger confirmation", async () => {
  let onChainCounter = 0n;

  // 1. Setup mock provider representing connected Midnight Lace environment
  const mockProviders = createMockPayrollProviders({
    publicDataProvider: {
      queryContractState: async () => ({
        data: { verification_count: onChainCounter },
      }),
    },
  });

  // 2. Deploy or join Private Payroll contract
  const deployedContract = createMockDeployedContract(
    MOCK_CONTRACT_ADDRESS,
    async (maxAllowed) => {
      // Simulate circuit verification and on-chain counter increment
      assert.equal(maxAllowed, 12000n);
      onChainCounter += 1n;
      return {
        public: {
          txId: "tx_midnight_block_49210_verify",
          status: "succeedEntirely",
        },
      };
    },
  );

  const session = await joinPrivatePayrollContract({
    contractAddress: MOCK_CONTRACT_ADDRESS,
    providers: mockProviders,
    findDeployedContractFn: async () => deployedContract,
  });

  // 3. User input validation using pure models
  const maxInput = "12000";
  const privateInput = "9500";

  const maxParsed = parseSalaryAmount(maxInput);
  const privParsed = parseSalaryAmount(privateInput);

  assert.equal(maxParsed.isValid, true);
  assert.equal(privParsed.isValid, true);
  assert.ok(privParsed.amount <= maxParsed.amount);

  // Check canSubmit helper
  const canSubmit = canSubmitVerification({
    walletStatus: "connected",
    hasSession: true,
    maxSalaryInput: maxInput,
    privateSalaryInput: privateInput,
    verificationPhase: "idle",
  });
  assert.equal(canSubmit, true);

  // 4. Verification Execution
  const txResult = await session.verifySalary(
    maxParsed.amount,
    privParsed.amount,
  );

  assert.equal(txResult.public.txId, "tx_midnight_block_49210_verify");
  assert.equal(txResult.public.status, "succeedEntirely");

  // 5. Query and verify updated public ledger
  const refreshedLedger = await session.queryLedger();
  assert.equal(refreshedLedger.verification_count, 1n);

  // 6. Test phase transitions
  assert.equal(
    getVerificationPhaseLabel("preparing"),
    "Preparing private verification",
  );
  assert.equal(getVerificationPhaseLabel("proving"), "Generating proof");
  assert.equal(
    getVerificationPhaseLabel("approving"),
    "Waiting for wallet approval",
  );
  assert.equal(
    getVerificationPhaseLabel("submitting"),
    "Submitting transaction",
  );
  assert.equal(
    getVerificationPhaseLabel("confirming"),
    "Waiting for confirmation",
  );
  assert.equal(
    getVerificationPhaseLabel("success"),
    "Verification successful",
  );
  assert.equal(
    getVerificationPhaseLabel("failed"),
    "Verification failed",
  );
  assert.match(
    getVerificationPhaseDescription("proving"),
    /proof-server/i,
  );

  // Test dashboard status in success phase
  const successStatus = getDashboardStatusInfo({
    walletStatus: "connected",
    contractLoading: false,
    contractError: "",
    hasSession: true,
    ledgerLoading: false,
    ledgerError: "",
    contractMode: "join",
    verificationPhase: "success",
  });
  assert.equal(successStatus.label, "Verification Successful");
  assert.equal(successStatus.tone, "success");

  // Clean disposal
  await session.dispose();
  assert.equal(mockProviders.isDisposed, true);
});

test("Test G: Private payroll split receives only maxAllowedSalary as public argument", async () => {
  const providers = createMockPayrollProviders();
  let capturedCircuitArgs = null;
  let capturedCircuitId = null;

  const mockSubmitCallTx = async (prov, opts) => {
    capturedCircuitId = opts.circuitId;
    capturedCircuitArgs = opts.args;
    return {
      public: {
        txId: "tx_public_split_check_200",
        status: "succeedEntirely",
        result: new Uint8Array(32).fill(3),
      },
    };
  };

  const maxSalary = 25000n;
  const privateSalary = 18000n;
  const splitNonce = new Uint8Array(32).fill(42);

  await submitRecordPrivateSplitCall(providers, {
    contractAddress: MOCK_CONTRACT_ADDRESS,
    maxAllowedSalary: maxSalary,
    privateSalary,
    splitNonce,
    submitCallTxFn: mockSubmitCallTx,
  });

  // Public argument check: only maxAllowedSalary
  assert.equal(capturedCircuitId, "record_private_split");
  assert.deepEqual(capturedCircuitArgs, [maxSalary]);

  // Private state check: salary and nonce stored off-chain
  const storedState = await providers.privateStateProvider.get(DEFAULT_PRIVATE_STATE_ID);
  assert.equal(storedState.salaryAmount, privateSalary);
  assert.deepEqual(storedState.splitNonce, splitNonce);

  // Witness check: get_salary_amount and get_split_nonce provide correct confidential values
  const witnesses = createPayrollWitnesses(privateSalary, splitNonce);
  const context = { privateState: storedState };
  const [, extractedSalary] = witnesses.get_salary_amount(context);
  const [, extractedNonce] = witnesses.get_split_nonce(context);
  assert.equal(extractedSalary, privateSalary);
  assert.deepEqual(extractedNonce, splitNonce);
});

test("Test H: Successful split triggers refresh/query of public split_count", async () => {
  let queryCount = 0;
  const providers = createMockPayrollProviders({
    publicDataProvider: {
      queryContractState: async () => {
        queryCount += 1;
        return {
          data: {
            verification_count: 1n,
            split_count: BigInt(queryCount),
            payroll_cycle: 1n,
            split_commitments: new Set(),
          },
        };
      },
    },
  });

  const session = await joinPrivatePayrollContract({
    contractAddress: MOCK_CONTRACT_ADDRESS,
    providers,
    findDeployedContractFn: async () =>
      createMockDeployedContract(MOCK_CONTRACT_ADDRESS),
  });

  // Initial query
  const initialLedger = await session.queryLedger();
  assert.equal(initialLedger.split_count, 1n);

  // Execute recordPrivatePayrollSplit
  const splitResult = await session.recordPrivatePayrollSplit(15000n, 12000n);
  assert.ok(splitResult.public.txId);

  // Subsequent query reflects incremented on-chain counter
  const refreshedLedger = await session.queryLedger();
  assert.equal(refreshedLedger.split_count, 2n);
  assert.equal(queryCount, 2);
});

test("Test I: Duplicate or failed split does not fake or manually increment split_count", async () => {
  const currentSplitCount = 3n;
  const providers = createMockPayrollProviders({
    publicDataProvider: {
      queryContractState: async () => ({
        data: {
          verification_count: 0n,
          split_count: currentSplitCount,
          payroll_cycle: 1n,
          split_commitments: new Set(),
        },
      }),
    },
  });

  const failingDeployedContract = createMockDeployedContract(
    MOCK_CONTRACT_ADDRESS,
    null,
    async () => {
      throw new Error("Duplicate payroll split: commitment already recorded");
    },
  );

  const session = await joinPrivatePayrollContract({
    contractAddress: MOCK_CONTRACT_ADDRESS,
    providers,
    findDeployedContractFn: async () => failingDeployedContract,
  });

  // Call should reject with duplicate error
  await assert.rejects(
    async () => {
      await session.recordPrivatePayrollSplit(10000n, 8000n);
    },
    /Duplicate payroll split/i,
  );

  // Public ledger split_count must remain untouched at 3n
  const ledger = await session.queryLedger();
  assert.equal(ledger.split_count, 3n);
});

test("Test J: UI component provides distinct actions for Verify Salary and Record Private Split", async () => {
  const dashboardSource = await readFile(
    new URL("../components/private-payroll-dashboard.tsx", import.meta.url),
    "utf8",
  );

  // Form input for split
  assert.match(
    dashboardSource,
    /id="split-max-salary-input"/,
    "Dashboard must provide split max salary input",
  );
  assert.match(
    dashboardSource,
    /id="split-private-salary-input"[^>]*type="password"/,
    "Split private salary input must be protected with type=password",
  );

  // Split action button and handler
  assert.match(
    dashboardSource,
    /onClick=\{handleRecordSplit\}/,
    "Dashboard must wire handleRecordSplit to Record Private Split button",
  );
  assert.match(
    dashboardSource,
    /disabled=\{!canSubmitSplitAction\}/,
    "Record Private Split button must be controlled by canSubmitSplitAction",
  );

  // Both distinct actions exist
  assert.match(dashboardSource, /Record Private Payroll Split/);
  assert.match(dashboardSource, /Private Salary Verification/);

  // 4 Public cards exist in dashboard
  assert.match(dashboardSource, /Payroll Cycle/);
  assert.match(dashboardSource, /Private Splits Recorded/);
  assert.match(dashboardSource, /Salary Policy Ceiling/);
  assert.match(dashboardSource, /Verification Count/);
});

