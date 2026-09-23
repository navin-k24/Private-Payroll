import test from "node:test";
import assert from "node:assert/strict";
import {
  createPayrollProviders,
  createWalletProvider,
  createMidnightProvider,
  createDevStoragePasswordProvider,
  resolveMidnightNetworkId,
  DEV_DEFAULT_PRIVATE_STATE_PASSWORD,
} from "../lib/midnight/providers.ts";
import {
  createPayrollSessionConfig,
  initializePayrollSession,
  initializeProviderSession,
  attachPayrollProviders,
} from "../lib/midnight/session.ts";
import { NetworkId } from "@midnight-ntwrk/ledger";

function createMockConnectedAPI(overrides = {}) {
  const defaultWalletConfig = {
    indexerUri: "http://localhost:8088/api/v1/graphql",
    indexerWsUri: "ws://localhost:8088/api/v1/graphql/ws",
    proverServerUri: "http://localhost:6300",
    substrateNodeUri: "ws://localhost:9944",
    networkId: "testnet-02",
  };

  const defaultAddresses = {
    shieldedAddress: "mn1qyshieldedmockaddress1234567890abcdef",
    shieldedCoinPublicKey: "00".repeat(32),
    shieldedEncryptionPublicKey: "11".repeat(32),
  };

  return {
    getConfiguration: async () => ({
      ...defaultWalletConfig,
      ...(overrides.config || {}),
    }),
    getShieldedAddresses: async () => ({
      ...defaultAddresses,
      ...(overrides.shielded || {}),
    }),
    getUnshieldedAddress: async () => ({
      unshieldedAddress: "mn1qyunshieldedmockaddress1234567890abcdef",
      ...(overrides.unshielded || {}),
    }),
    getDustAddress: async () => ({
      dustAddress: "mn1qydustmockaddress1234567890abcdef",
      ...(overrides.dust || {}),
    }),
    balanceUnsealedTransaction: async (tx) => ({
      tx: tx || "00",
    }),
    balanceSealedTransaction: async (tx) => ({
      tx: tx || "00",
    }),
    submitTransaction: async () => {},
    ...overrides,
  };
}

test("Test A: Provider configuration can be created from a mocked ConnectedAPI", async () => {
  const connectedAPI = createMockConnectedAPI();

  const providers = await createPayrollProviders({
    connectedAPI,
  });

  // Verify all 6 required provider abstractions are present
  assert.ok(providers.privateStateProvider, "privateStateProvider must be defined");
  assert.equal(typeof providers.privateStateProvider.get, "function");
  assert.equal(typeof providers.privateStateProvider.set, "function");

  assert.ok(providers.publicDataProvider, "publicDataProvider must be defined");
  assert.equal(typeof providers.publicDataProvider.queryContractState, "function");

  assert.ok(providers.zkConfigProvider, "zkConfigProvider must be defined");
  assert.equal(typeof providers.zkConfigProvider.getZKIR, "function");

  assert.ok(providers.proofProvider, "proofProvider must be defined");
  assert.equal(typeof providers.proofProvider.proveTx, "function");

  assert.ok(providers.walletProvider, "walletProvider must be defined");
  assert.equal(typeof providers.walletProvider.balanceTx, "function");
  assert.equal(typeof providers.walletProvider.getCoinPublicKey, "function");
  assert.equal(typeof providers.walletProvider.getEncryptionPublicKey, "function");

  assert.ok(providers.midnightProvider, "midnightProvider must be defined");
  assert.equal(typeof providers.midnightProvider.submitTx, "function");

  // Verify lifecycle dispose method is exposed
  assert.equal(typeof providers.dispose, "function");
  await providers.dispose();
});

test("Test B: Wallet and Midnight provider bridging uses expected connector methods", async () => {
  let balancedTxReceived = null;
  let balanceOptionsReceived = null;
  let submittedTxReceived = null;

  const connectedAPI = createMockConnectedAPI({
    balanceUnsealedTransaction: async (tx, options) => {
      balancedTxReceived = tx;
      balanceOptionsReceived = options;
      return { tx: "balanced-tx-hex-payload" };
    },
    submitTransaction: async (tx) => {
      submittedTxReceived = tx;
    },
  });

  const addresses = {
    shieldedAddress: "mn1qyshielded999",
    shieldedCoinPublicKey: "mock-coin-key-abc",
    shieldedEncryptionPublicKey: "mock-enc-key-xyz",
    unshieldedAddress: "mn1qyunshielded999",
    dustAddress: "mn1qydust999",
  };

  const walletProvider = createWalletProvider(connectedAPI, addresses);

  // 1. Verify key getters
  assert.equal(walletProvider.getCoinPublicKey(), "mock-coin-key-abc");
  assert.equal(walletProvider.getEncryptionPublicKey(), "mock-enc-key-xyz");

  // 2. Verify balanceTx delegates to balanceUnsealedTransaction with fee payment
  const mockUnboundTx = {
    serialize: () => Buffer.from("unproven-tx-raw-bytes"),
  };

  // Mock Transaction.deserialize for balancing
  const originalDeserialize = (await import("@midnight-ntwrk/ledger")).Transaction.deserialize;
  try {
    (await import("@midnight-ntwrk/ledger")).Transaction.deserialize = (bytes) => ({
      rawBytes: bytes,
      isBalanced: true,
      identifiers: () => ["tx-identifier-12345"],
      serialize: () => bytes,
    });

    const finalized = await walletProvider.balanceTx(mockUnboundTx);
    assert.ok(finalized);
    assert.equal(balancedTxReceived, Buffer.from("unproven-tx-raw-bytes").toString("hex"));
    assert.deepEqual(balanceOptionsReceived, { payFees: true });

    // 3. Verify midnightProvider delegates to submitTransaction
    const midnightProvider = createMidnightProvider(connectedAPI);
    const txId = await midnightProvider.submitTx(finalized);

    assert.equal(submittedTxReceived, Buffer.from("balanced-tx-hex-payload", "hex").toString("hex"));
    assert.equal(txId, "tx-identifier-12345");
  } finally {
    (await import("@midnight-ntwrk/ledger")).Transaction.deserialize = originalDeserialize;
  }
});

test("Test C: Missing proof-server configuration produces a controlled error", async () => {
  const connectedAPI = createMockConnectedAPI({
    config: {
      indexerUri: "http://localhost:8088/api/v1/graphql",
      indexerWsUri: "ws://localhost:8088/api/v1/graphql/ws",
      proverServerUri: undefined,
    },
  });

  await assert.rejects(
    async () => {
      await createPayrollProviders({
        connectedAPI,
      });
    },
    {
      message: /Missing proof-server configuration/i,
    },
  );
});

test("Test D: Missing indexer configuration produces a controlled error", async () => {
  const connectedAPI = createMockConnectedAPI({
    config: {
      indexerUri: "",
      indexerWsUri: "",
      proverServerUri: "http://localhost:6300",
    },
  });

  await assert.rejects(
    async () => {
      await createPayrollProviders({
        connectedAPI,
      });
    },
    {
      message: /Missing indexer configuration/i,
    },
  );
});

test("Test E: Provider cleanup runs when provider initialization fails", async () => {
  let cleanupInvoked = false;

  const connectedAPI = createMockConnectedAPI({
    config: {
      indexerUri: "http://localhost:8088/api/v1/graphql",
      indexerWsUri: "ws://localhost:8088/api/v1/graphql/ws",
      proverServerUri: undefined, // Will trigger error in proof-provider step
    },
  });

  await assert.rejects(
    async () => {
      await createPayrollProviders({
        connectedAPI,
        onCleanup: () => {
          cleanupInvoked = true;
        },
      });
    },
    {
      message: /Missing proof-server configuration/i,
    },
  );

  assert.equal(cleanupInvoked, true, "onCleanup must be invoked when initialization fails");
});

test("Test F: Session successfully receives the provider bundle from a mocked connected wallet", async () => {
  const sessionConfig = createPayrollSessionConfig();
  const initialSession = initializePayrollSession(sessionConfig, 7500n);

  assert.equal(initialSession.status, "ready");
  assert.equal(initialSession.providers, undefined);
  assert.ok(initialSession.contract);

  const connectedAPI = createMockConnectedAPI();

  const providerSession = await initializeProviderSession(
    initialSession,
    connectedAPI,
    {
      proofServerUri: "http://localhost:6300",
    },
  );

  assert.equal(providerSession.status, "ready");
  assert.equal(providerSession.connectedAPI, connectedAPI);
  assert.ok(providerSession.providers, "session must hold provider bundle");
  assert.ok(providerSession.providers.walletProvider);
  assert.ok(providerSession.providers.midnightProvider);
  // Also test attachPayrollProviders directly
  const attachedSession = attachPayrollProviders(initialSession, providerSession.providers);
  assert.equal(attachedSession.providers, providerSession.providers);
  assert.equal(attachedSession.status, "ready");

  // Clean up
  await providerSession.providers.dispose();
});

test("Helper utilities: network ID resolution and dev password strength", () => {
  assert.equal(resolveMidnightNetworkId("testnet-02").ledgerNetworkId, NetworkId.TestNet);
  assert.equal(resolveMidnightNetworkId("testnet-02").networkName, "TestNet");
  assert.equal(resolveMidnightNetworkId("devnet").ledgerNetworkId, NetworkId.DevNet);
  assert.equal(resolveMidnightNetworkId("devnet").networkName, "DevNet");
  assert.equal(resolveMidnightNetworkId("mainnet").ledgerNetworkId, NetworkId.MainNet);
  assert.equal(resolveMidnightNetworkId("undeployed").ledgerNetworkId, NetworkId.Undeployed);
  assert.equal(resolveMidnightNetworkId(undefined).ledgerNetworkId, NetworkId.TestNet);

  const pwd = createDevStoragePasswordProvider()();
  assert.equal(pwd, DEV_DEFAULT_PRIVATE_STATE_PASSWORD);
  assert.ok(pwd.length >= 16);
});
