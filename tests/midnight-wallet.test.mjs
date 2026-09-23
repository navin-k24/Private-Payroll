import test from "node:test";
import assert from "node:assert/strict";
import {
  abbreviateMidnightAddress,
  connectMidnightWallet,
  getMidnightInitialAPI,
  isMidnightWalletAvailable,
  mapWalletError,
} from "../lib/midnight/wallet.ts";
import {
  attachConnectedWallet,
  createPayrollSessionConfig,
  initializePayrollSession,
} from "../lib/midnight/session.ts";

function createMockConnectedAPI(overrides = {}) {
  return {
    getShieldedAddresses: async () => ({
      shieldedAddress: "mn1qyshieldedmockaddress1234567890abcdef",
      shieldedCoinPublicKey: "mock-coin-pubkey-1234567890",
      shieldedEncryptionPublicKey: "mock-enc-pubkey-1234567890",
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
    getShieldedBalances: async () => ({}),
    getUnshieldedBalances: async () => ({}),
    getDustBalance: async () => ({ cap: 100n, balance: 10n }),
    ...overrides,
  };
}

function createMockInitialAPI(connectFn, metadataOverrides = {}) {
  return {
    rdns: "io.midnight.lace",
    name: "Midnight Lace",
    icon: "data:image/svg+xml;base64,mock",
    apiVersion: "4.0.1",
    connect: connectFn || (async () => createMockConnectedAPI()),
    ...metadataOverrides,
  };
}

test("Test A: wallet unavailable returns controlled error and false availability", async () => {
  const emptyWindow = {};
  assert.equal(isMidnightWalletAvailable(emptyWindow), false);
  assert.equal(getMidnightInitialAPI(emptyWindow), undefined);

  await assert.rejects(
    async () => {
      await connectMidnightWallet({ windowObj: emptyWindow });
    },
    {
      message: /Midnight Lace wallet extension is not detected/i,
    },
  );
});

test("Test B: wallet connection succeeds and returns ConnectedAPI session and addresses", async () => {
  const mockConnectedAPI = createMockConnectedAPI();
  let requestedNetworkId = "";
  const mockInitialAPI = createMockInitialAPI(async (netId) => {
    requestedNetworkId = netId;
    return mockConnectedAPI;
  });

  const fakeWindow = {
    midnight: {
      mnLace: mockInitialAPI,
    },
  };

  assert.equal(isMidnightWalletAvailable(fakeWindow), true);
  assert.equal(getMidnightInitialAPI(fakeWindow), mockInitialAPI);

  const result = await connectMidnightWallet({
    initialAPI: mockInitialAPI,
    networkId: "testnet-02",
  });

  assert.equal(requestedNetworkId, "testnet-02");
  assert.equal(result.networkId, "testnet-02");
  assert.ok(result.connectedAPI);
  assert.equal(result.initialAPI.name, "Midnight Lace");
  assert.equal(
    result.addresses.shieldedAddress,
    "mn1qyshieldedmockaddress1234567890abcdef",
  );
  assert.equal(
    result.addresses.unshieldedAddress,
    "mn1qyunshieldedmockaddress1234567890abcdef",
  );
  assert.equal(
    result.addresses.dustAddress,
    "mn1qydustmockaddress1234567890abcdef",
  );
});

test("Test C: wallet connection rejection produces controlled error without false connected state", async () => {
  const rejectedInitialAPI = createMockInitialAPI(async () => {
    const error = new Error("User rejected connection request");
    error.type = "DAppConnectorAPIError";
    error.code = "Rejected";
    error.reason = "User declined";
    throw error;
  });

  await assert.rejects(
    async () => {
      await connectMidnightWallet({ initialAPI: rejectedInitialAPI });
    },
    {
      message: /rejected in Midnight Lace/i,
    },
  );
});

test("Test D: wallet address abbreviation and error mapping behave deterministically", () => {
  const longAddress = "mn1qyshieldedmockaddress1234567890abcdef";
  const abbreviated = abbreviateMidnightAddress(longAddress, 10, 6);
  assert.equal(abbreviated, "mn1qyshiel...abcdef");

  const shortAddress = "short";
  assert.equal(abbreviateMidnightAddress(shortAddress), "short");

  const disconnectedErr = {
    type: "DAppConnectorAPIError",
    code: "Disconnected",
  };
  assert.match(mapWalletError(disconnectedErr), /disconnected/i);

  const internalErr = {
    type: "DAppConnectorAPIError",
    code: "InternalError",
    reason: "Internal prover fault",
  };
  assert.match(mapWalletError(internalErr), /Internal prover fault/);
});

test("Test E: session integration binds ConnectedAPI into session state", () => {
  const config = createPayrollSessionConfig();
  const session = initializePayrollSession(config, 5000n);
  assert.equal(session.connectedAPI, undefined);

  const mockConnectedAPI = createMockConnectedAPI();
  const attachedSession = attachConnectedWallet(session, mockConnectedAPI);

  assert.ok(attachedSession.connectedAPI);
  assert.equal(attachedSession.connectedAPI, mockConnectedAPI);
  assert.equal(attachedSession.privateState.salaryAmount, 5000n);
});
