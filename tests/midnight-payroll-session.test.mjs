import test from "node:test";
import assert from "node:assert/strict";
import {
  deployPrivatePayrollContract,
  joinPrivatePayrollContract,
  queryPayrollLedgerState,
  submitVerifySalaryCall,
  submitRecordPrivateSplitCall,
  safeGetPayrollLedger,
  isValidContractAddress,
  mapPayrollSessionError,
  CONFIGURED_PAYROLL_CONTRACT_ADDRESS,
} from "../lib/midnight/payroll-session.ts";
import {
  createPayrollWitnesses,
} from "../lib/midnight/contract.ts";
import { DEFAULT_PRIVATE_STATE_ID } from "../lib/midnight/session.ts";

const MOCK_VALID_CONTRACT_ADDRESS =
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

  const publicDataProvider = {
    queryContractState: async () => ({
      data: { verification_count: 0n },
    }),
    watchForTxData: async () => ({
      status: "succeedEntirely",
    }),
    queryContractStateAtBlock: async () => null,
    queryZswapState: async () => null,
    queryBlockState: async () => null,
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

function createMockDeployedContract(contractAddress, callTxVerifySalary) {
  return {
    deployTxData: {
      public: {
        contractAddress,
        status: "succeedEntirely",
      },
    },
    callTx: {
      verify_salary: callTxVerifySalary || (async () => ({
        public: { txId: "call-tx-123", status: "succeedEntirely" },
      })),
    },
    circuitMaintenanceTx: {},
    contractMaintenanceTx: {},
  };
}

test("Scenario A: Deploy session returns contract address & session", async () => {
  const providers = createMockPayrollProviders();
  let deployOptionsReceived = null;

  const mockDeployContractFn = async (prov, opts) => {
    deployOptionsReceived = opts;
    return createMockDeployedContract(MOCK_VALID_CONTRACT_ADDRESS);
  };

  const initialSalary = 15000n;
  const session = await deployPrivatePayrollContract({
    providers,
    initialSalary,
    deployContractFn: mockDeployContractFn,
  });

  // Verify returned session attributes
  assert.ok(session, "session must be defined");
  assert.equal(session.contractAddress, MOCK_VALID_CONTRACT_ADDRESS);
  assert.ok(session.deployedContract);
  assert.equal(session.providers, providers);
  assert.ok(session.privateStateId);

  // Verify deployOptions passed to deployContract
  assert.ok(deployOptionsReceived);
  assert.deepEqual(deployOptionsReceived.initialPrivateState, {
    salaryAmount: initialSalary,
  });

  // Verify session methods exist and are functions
  assert.equal(typeof session.queryLedger, "function");
  assert.equal(typeof session.verifySalary, "function");
  assert.equal(typeof session.dispose, "function");

  // Verify dispose cleans up providers
  await session.dispose();
  assert.equal(providers.isDisposed, true);
});

test("Scenario B: Joining existing contract returns session", async () => {
  const providers = createMockPayrollProviders();
  let findOptionsReceived = null;

  const mockFindDeployedContractFn = async (prov, opts) => {
    findOptionsReceived = opts;
    return createMockDeployedContract(MOCK_VALID_CONTRACT_ADDRESS);
  };

  const session = await joinPrivatePayrollContract({
    contractAddress: MOCK_VALID_CONTRACT_ADDRESS,
    providers,
    initialSalary: 12000n,
    findDeployedContractFn: mockFindDeployedContractFn,
  });

  assert.ok(session);
  assert.equal(session.contractAddress, MOCK_VALID_CONTRACT_ADDRESS);
  assert.ok(session.deployedContract);
  assert.equal(session.providers, providers);
  assert.equal(findOptionsReceived.contractAddress, MOCK_VALID_CONTRACT_ADDRESS);
  assert.equal(typeof session.queryLedger, "function");
  assert.equal(typeof session.verifySalary, "function");
  assert.equal(typeof session.dispose, "function");

  await session.dispose();
  assert.equal(providers.isDisposed, true);
});

test("Scenario C: Invalid/missing contract address is rejected", async () => {
  const providers = createMockPayrollProviders();
  const invalidAddresses = [
    "",
    "   ",
    "placeholder",
    "0123456789abcdef...",
    "invalid-short-address",
    "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
  ];

  for (const invalidAddr of invalidAddresses) {
    // 1. isValidContractAddress returns false
    assert.equal(
      isValidContractAddress(invalidAddr),
      false,
      `Address "${invalidAddr}" should be invalid`,
    );

    // 2. joinPrivatePayrollContract rejects
    await assert.rejects(
      async () => {
        await joinPrivatePayrollContract({
          contractAddress: invalidAddr,
          providers,
        });
      },
      {
        message: /Invalid contract address/,
      },
    );

    // 3. queryPayrollLedgerState rejects
    await assert.rejects(
      async () => {
        await queryPayrollLedgerState(providers.publicDataProvider, invalidAddr);
      },
      {
        message: /Invalid contract address/,
      },
    );
  }

  // Also confirm valid addresses pass validation
  assert.equal(isValidContractAddress(MOCK_VALID_CONTRACT_ADDRESS), true);
  assert.equal(isValidContractAddress("mn1q8abcdef0123456789abcdef0123456789abcdef"), true);
});

test("Scenario D: Public ledger query returns expected typed verification_count", async () => {
  // 1. When ledger data has verification_count = 7n
  const customProvider = createMockPayrollProviders({
    publicDataProvider: {
      queryContractState: async () => ({
        data: { verification_count: 7n },
      }),
    },
  });

  const state = await queryPayrollLedgerState(
    customProvider.publicDataProvider,
    MOCK_VALID_CONTRACT_ADDRESS,
  );
  assert.equal(typeof state.verification_count, "bigint");
  assert.equal(state.verification_count, 7n);

  // 2. When contract state returns empty data, defaults to 0n
  const emptyProvider = createMockPayrollProviders({
    publicDataProvider: {
      queryContractState: async () => null,
    },
  });
  const emptyState = await queryPayrollLedgerState(
    emptyProvider.publicDataProvider,
    MOCK_VALID_CONTRACT_ADDRESS,
  );
  assert.equal(emptyState.verification_count, 0n);

  // 3. safeGetPayrollLedger handles various data shapes
  assert.equal(safeGetPayrollLedger(null).verification_count, 0n);
  assert.equal(safeGetPayrollLedger({}).verification_count, 0n);
  assert.equal(safeGetPayrollLedger({ verification_count: 42n }).verification_count, 42n);
});

test("Scenario E: verify_salary call is constructed with correct circuit ID and public argument", async () => {
  const providers = createMockPayrollProviders();
  let receivedMaxAllowedSalary = null;

  const mockDeployedContract = createMockDeployedContract(
    MOCK_VALID_CONTRACT_ADDRESS,
    async (maxLimit) => {
      receivedMaxAllowedSalary = maxLimit;
      return {
        public: { txId: "tx-call-verification-001", status: "succeedEntirely" },
      };
    },
  );

  const maxAllowed = 25000n;
  const privateSalary = 20000n;

  // Execute verifySalary via submitVerifySalaryCall
  const result = await submitVerifySalaryCall(providers, {
    contractAddress: MOCK_VALID_CONTRACT_ADDRESS,
    maxAllowedSalary: maxAllowed,
    privateSalary,
    deployedContract: mockDeployedContract,
  });

  // Verify the public argument passed was maxAllowed
  assert.equal(receivedMaxAllowedSalary, maxAllowed);
  assert.equal(result.public.status, "succeedEntirely");

  // Test submitting via submitCallTxFn override when deployedContract has no direct callTx
  let submitCallOptions = null;
  const mockSubmitCallTx = async (prov, opts) => {
    submitCallOptions = opts;
    return { public: { txId: "tx-call-002", status: "succeedEntirely" } };
  };

  await submitVerifySalaryCall(providers, {
    contractAddress: MOCK_VALID_CONTRACT_ADDRESS,
    maxAllowedSalary: maxAllowed,
    privateSalary,
    submitCallTxFn: mockSubmitCallTx,
  });

  assert.ok(submitCallOptions);
  assert.equal(submitCallOptions.circuitId, "verify_salary");
  assert.equal(submitCallOptions.contractAddress, MOCK_VALID_CONTRACT_ADDRESS);
  assert.deepEqual(submitCallOptions.args, [maxAllowed]);
});

test("Scenario F: Private salary is supplied through private/witness mechanism, not written to public ledger", async () => {
  const privateSalary = 18500n;
  const witnesses = createPayrollWitnesses(privateSalary);

  // 1. Witness extracts private salary from context
  const mockCtx = {
    privateState: { salaryAmount: privateSalary },
  };
  const [nextPrivateState, witnessSalary] = witnesses.get_salary_amount(mockCtx);
  assert.equal(witnessSalary, privateSalary);
  assert.deepEqual(nextPrivateState, mockCtx.privateState);

  // 2. submitVerifySalaryCall stores salary strictly in private state provider
  const providers = createMockPayrollProviders();
  const mockDeployedContract = createMockDeployedContract(MOCK_VALID_CONTRACT_ADDRESS);

  await submitVerifySalaryCall(providers, {
    contractAddress: MOCK_VALID_CONTRACT_ADDRESS,
    maxAllowedSalary: 30000n,
    privateSalary,
    deployedContract: mockDeployedContract,
  });

  const storedPrivateState = await providers.privateStateProvider.get(DEFAULT_PRIVATE_STATE_ID);
  assert.deepEqual(storedPrivateState, { salaryAmount: privateSalary });

  // 3. Confirm public ledger state contains only verification_count
  const publicLedger = await queryPayrollLedgerState(
    providers.publicDataProvider,
    MOCK_VALID_CONTRACT_ADDRESS,
  );
  assert.equal("salaryAmount" in publicLedger, false);
  assert.equal("salary" in publicLedger, false);
  assert.deepEqual(Object.keys(publicLedger), [
    "verification_count",
    "split_count",
    "payroll_cycle",
    "split_commitments",
  ]);
});

test("Scenario G: Provider/session cleanup and error mapping on deployment or join failure", async () => {
  // 1. Session dispose cleans up providers
  let disposedCount = 0;
  const mockProv = createMockPayrollProviders({
    onDispose: () => {
      disposedCount += 1;
    },
  });

  const session = await deployPrivatePayrollContract({
    providers: mockProv,
    deployContractFn: async () => createMockDeployedContract(MOCK_VALID_CONTRACT_ADDRESS),
  });

  await session.dispose();
  assert.equal(disposedCount, 1);

  // 2. Error mapping tests
  assert.equal(
    mapPayrollSessionError("wallet not connected"),
    "Wallet is not connected. Please connect Midnight Lace to proceed with contract operations.",
  );
  assert.equal(
    mapPayrollSessionError("Missing proof-server uri"),
    "Midnight proof-server configuration is unavailable or unreachable. Ensure your prover service is running.",
  );
  assert.equal(
    mapPayrollSessionError("Missing indexer uri"),
    "Midnight indexer configuration is unavailable or unreachable. Check your network configuration.",
  );
  assert.ok(
    mapPayrollSessionError("Contract not found on chain").includes(
      "Contract was not found on the Midnight network",
    ),
  );
  assert.ok(
    mapPayrollSessionError("DeployTxFailedError: node rejected").includes(
      "Private Payroll deployment failed",
    ),
  );
  assert.ok(
    mapPayrollSessionError("CallTxFailedError: verify_salary assertion failed").includes(
      "Salary verification circuit execution failed",
    ),
  );
  assert.ok(
    mapPayrollSessionError("Duplicate payroll split: commitment already recorded").includes(
      "Duplicate payroll split detected",
    ),
  );

  // 3. Configured contract address exported constant is a string
  assert.equal(typeof CONFIGURED_PAYROLL_CONTRACT_ADDRESS, "string");
});

test("Scenario H: record_private_split call passes only maxAllowedSalary publicly and stores private state", async () => {
  const providers = createMockPayrollProviders();
  let capturedCircuitId = null;
  let capturedArgs = null;

  const mockSubmitCallTx = async (prov, opts) => {
    capturedCircuitId = opts.circuitId;
    capturedArgs = opts.args;
    return {
      public: {
        txId: "tx_mock_split_001",
        status: "succeedEntirely",
        result: new Uint8Array(32).fill(7),
      },
    };
  };

  const maxAllowedSalary = 50000n;
  const privateSalary = 42000n;
  const splitNonce = new Uint8Array(32).fill(99);

  await submitRecordPrivateSplitCall(providers, {
    contractAddress: MOCK_VALID_CONTRACT_ADDRESS,
    maxAllowedSalary,
    privateSalary,
    splitNonce,
    submitCallTxFn: mockSubmitCallTx,
  });

  // Verify on-chain public parameters
  assert.equal(capturedCircuitId, "record_private_split");
  assert.deepEqual(capturedArgs, [maxAllowedSalary]);

  // Verify private state storage
  const storedPrivateState = await providers.privateStateProvider.get(DEFAULT_PRIVATE_STATE_ID);
  assert.equal(storedPrivateState.salaryAmount, privateSalary);
  assert.deepEqual(storedPrivateState.splitNonce, splitNonce);
});

test("Scenario I: record_private_split input validation enforces positive bounds", async () => {
  const providers = createMockPayrollProviders();

  // Zero maxAllowedSalary rejected
  await assert.rejects(
    async () => {
      await submitRecordPrivateSplitCall(providers, {
        contractAddress: MOCK_VALID_CONTRACT_ADDRESS,
        maxAllowedSalary: 0n,
      });
    },
    /greater than zero/i,
  );

  // Private salary exceeding max rejected
  await assert.rejects(
    async () => {
      await submitRecordPrivateSplitCall(providers, {
        contractAddress: MOCK_VALID_CONTRACT_ADDRESS,
        maxAllowedSalary: 1000n,
        privateSalary: 2000n,
      });
    },
    /salary exceeds maximum/i,
  );
});

