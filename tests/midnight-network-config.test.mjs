import test from "node:test";
import assert from "node:assert/strict";
import {
  SUPPORTED_NETWORKS,
  OBSOLETE_NETWORKS,
  normalizeNetworkId,
  isSupportedNetworkId,
  isObsoleteNetworkId,
  isPublicNetwork,
  isLocalDevnet,
  resolveApplicationNetworkId,
  resolveApplicationNetworkConfig,
  validateWalletNetworkCompatibility,
  getEffectiveServiceEndpoints,
} from "../lib/midnight/network-config.ts";
import { resolveMidnightNetworkId } from "../lib/midnight/providers.ts";
import {
  canSubmitSplit,
  canSubmitVerification,
  getDashboardStatusInfo,
} from "../lib/midnight/dashboard-model.ts";
import { NetworkId } from "@midnight-ntwrk/ledger";

test("Requirement 15.1: preview network is accepted and configured as public testnet", () => {
  assert.equal(isSupportedNetworkId("preview"), true);
  assert.equal(isSupportedNetworkId("PREVIEW"), true);
  assert.equal(isPublicNetwork("preview"), true);
  assert.equal(isLocalDevnet("preview"), false);

  const resolvedId = resolveApplicationNetworkId("preview");
  assert.equal(resolvedId, "preview");

  const config = resolveApplicationNetworkConfig("preview");
  assert.equal(config.id, "preview");
  assert.equal(config.displayName, "Preview");
  assert.equal(config.environment, "public");
  assert.equal(config.nodeRpcUri, "https://rpc.preview.midnight.network");
  assert.equal(config.indexerUri, "https://indexer.preview.midnight.network/api/v4/graphql");
  assert.equal(config.indexerWsUri, "wss://indexer.preview.midnight.network/api/v4/graphql/ws");
  assert.equal(config.faucetUrl, "https://faucet.preview.midnight.network");

  const ledgerRes = resolveMidnightNetworkId("preview");
  assert.equal(ledgerRes.ledgerNetworkId, NetworkId.TestNet);
  assert.equal(ledgerRes.isObsolete, false);
});

test("Requirement 15.2: preprod network is accepted and configured as public testnet", () => {
  assert.equal(isSupportedNetworkId("preprod"), true);
  assert.equal(isSupportedNetworkId("  Preprod  "), true);
  assert.equal(isPublicNetwork("preprod"), true);
  assert.equal(isLocalDevnet("preprod"), false);

  const resolvedId = resolveApplicationNetworkId("preprod");
  assert.equal(resolvedId, "preprod");

  const config = resolveApplicationNetworkConfig("preprod");
  assert.equal(config.id, "preprod");
  assert.equal(config.displayName, "Preprod");
  assert.equal(config.environment, "public");
  assert.equal(config.nodeRpcUri, "https://rpc.preprod.midnight.network");
  assert.equal(config.indexerUri, "https://indexer.preprod.midnight.network/api/v4/graphql");
  assert.equal(config.indexerWsUri, "wss://indexer.preprod.midnight.network/api/v4/graphql/ws");
  assert.equal(config.faucetUrl, "https://faucet.preprod.midnight.network");

  const ledgerRes = resolveMidnightNetworkId("preprod");
  assert.equal(ledgerRes.ledgerNetworkId, NetworkId.TestNet);
  assert.equal(ledgerRes.isObsolete, false);
});

test("Requirement 15.3: old testnet-02 identifier is rejected and explicitly flagged obsolete", () => {
  assert.equal(normalizeNetworkId("  TestNet-02  "), "testnet-02");
  assert.ok(OBSOLETE_NETWORKS.includes("testnet-02"));
  assert.equal(isObsoleteNetworkId("testnet-02"), true);
  assert.equal(isObsoleteNetworkId("TESTNET-02"), true);
  assert.equal(isObsoleteNetworkId("testnet-01"), true);
  assert.equal(isSupportedNetworkId("testnet-02"), false);

  assert.throws(
    () => resolveApplicationNetworkId("testnet-02"),
    /Network identifier 'testnet-02' is obsolete/i,
  );

  const ledgerRes = resolveMidnightNetworkId("testnet-02");
  assert.equal(ledgerRes.isObsolete, true);

  const validation = validateWalletNetworkCompatibility({
    appNetworkId: "preview",
    walletNetworkId: "testnet-02",
  });
  assert.equal(validation.compatible, false);
  assert.equal(validation.isObsolete, true);
  assert.match(validation.reason || "", /obsolete network/i);
});

test("Requirement 15.4: wallet/application network mismatch blocks transactions", () => {
  // Scenario A: App expects preview, wallet is on preprod
  const mismatchVal = validateWalletNetworkCompatibility({
    appNetworkId: "preview",
    walletNetworkId: "preprod",
  });
  assert.equal(mismatchVal.compatible, false);
  assert.match(mismatchVal.reason || "", /Network mismatch/i);

  // Scenario B: canSubmitVerification blocked when network is incompatible
  const canVerify = canSubmitVerification({
    walletStatus: "connected",
    hasSession: true,
    maxSalaryInput: "10000",
    privateSalaryInput: "7500",
    verificationPhase: "idle",
    isNetworkCompatible: false,
  });
  assert.equal(canVerify, false, "Salary verification must be blocked on network mismatch");

  // Scenario C: canSubmitSplit blocked when network is incompatible
  const canSplit = canSubmitSplit({
    walletStatus: "connected",
    hasSession: true,
    maxSalaryInput: "10000",
    privateSalaryInput: "7500",
    splitPhase: "idle",
    isNetworkCompatible: false,
  });
  assert.equal(canSplit, false, "Private split recording must be blocked on network mismatch");

  // Scenario D: Dashboard status reflects network mismatch error
  const status = getDashboardStatusInfo({
    walletStatus: "connected",
    contractLoading: false,
    contractError: "",
    hasSession: true,
    ledgerLoading: false,
    ledgerError: "",
    contractMode: "join",
    networkError: "Network mismatch: Wallet is connected to Preprod",
  });
  assert.equal(status.label, "Network Mismatch");
  assert.equal(status.tone, "error");
  assert.match(status.message, /Network mismatch/i);

  // Scenario E: Compatible network allows submission
  const canVerifyAllowed = canSubmitVerification({
    walletStatus: "connected",
    hasSession: true,
    maxSalaryInput: "10000",
    privateSalaryInput: "7500",
    verificationPhase: "idle",
    isNetworkCompatible: true,
  });
  assert.equal(canVerifyAllowed, true);
});

test("Requirement 15.5: public environment configuration is distinct from local DevNet", () => {
  const publicConfig = resolveApplicationNetworkConfig("preview");
  const localConfig = resolveApplicationNetworkConfig("undeployed");

  // Environments
  assert.equal(publicConfig.environment, "public");
  assert.equal(localConfig.environment, "local-devnet");

  // Endpoints: public uses remote https/wss, local uses localhost
  assert.ok(publicConfig.nodeRpcUri.startsWith("https://"));
  assert.ok(publicConfig.indexerUri.startsWith("https://"));
  assert.ok(publicConfig.indexerWsUri.startsWith("wss://"));

  assert.ok(localConfig.nodeRpcUri.includes("localhost:9944"));
  assert.ok(localConfig.indexerUri.includes("localhost:8088"));
  assert.ok(localConfig.indexerWsUri.includes("ws://localhost:8088"));

  // Public networks have faucets; local devnet does not need one
  assert.ok(publicConfig.faucetUrl?.startsWith("https://"));
  assert.equal(localConfig.faucetUrl, undefined);
});

test("Requirement 15.6: wallet-supplied endpoint configuration is honored", () => {
  const customIndexer = "https://custom-indexer.preview.example.com/api/v4/graphql";
  const customWs = "wss://custom-indexer.preview.example.com/api/v4/graphql/ws";
  const customNode = "https://custom-node.preview.example.com";
  const customProver = "http://127.0.0.1:6300";

  // Wallet-configured endpoints take precedence over defaults
  const effective = getEffectiveServiceEndpoints({
    appNetworkId: "preview",
    walletConfig: {
      indexerUri: customIndexer,
      indexerWsUri: customWs,
      substrateNodeUri: customNode,
      proverServerUri: customProver,
    },
  });

  assert.equal(effective.source, "wallet-configured");
  assert.equal(effective.indexerUri, customIndexer);
  assert.equal(effective.indexerWsUri, customWs);
  assert.equal(effective.substrateNodeUri, customNode);
  assert.equal(effective.proofServerUri, customProver);

  // Application defaults used when wallet config is omitted
  const defaultEndpoints = getEffectiveServiceEndpoints({
    appNetworkId: "preview",
  });
  assert.equal(defaultEndpoints.source, "application-defaults");
  assert.equal(defaultEndpoints.indexerUri, SUPPORTED_NETWORKS.preview.indexerUri);

  // Explicit override takes precedence over wallet config
  const overrideEndpoints = getEffectiveServiceEndpoints({
    appNetworkId: "preview",
    walletConfig: { indexerUri: customIndexer },
    explicitOverrides: { indexerUri: "http://override-indexer:8088/graphql" },
  });
  assert.equal(overrideEndpoints.source, "custom-override");
  assert.equal(overrideEndpoints.indexerUri, "http://override-indexer:8088/graphql");
});

test("Requirement 15.7: private values do not appear in network configuration output", () => {
  const previewConfig = resolveApplicationNetworkConfig("preview");
  const preprodConfig = resolveApplicationNetworkConfig("preprod");
  const localConfig = resolveApplicationNetworkConfig("undeployed");

  const effective = getEffectiveServiceEndpoints({
    appNetworkId: "preview",
    walletConfig: {
      indexerUri: "https://indexer.preview.midnight.network/api/v4/graphql",
      indexerWsUri: "wss://indexer.preview.midnight.network/api/v4/graphql/ws",
      substrateNodeUri: "https://rpc.preview.midnight.network",
      proverServerUri: "http://localhost:6300",
    },
  });

  const serialized = JSON.stringify({
    previewConfig,
    preprodConfig,
    localConfig,
    effective,
  }).toLowerCase();

  // Assert no secret keys, seeds, passwords, witness, or salary data exist in network configurations
  assert.equal(serialized.includes("password"), false, "No passwords in network config");
  assert.equal(serialized.includes("secret"), false, "No secrets in network config");
  assert.equal(serialized.includes("seed"), false, "No seeds in network config");
  assert.equal(serialized.includes("mnemonic"), false, "No mnemonics in network config");
  assert.equal(serialized.includes("privatekey"), false, "No private keys in network config");
  assert.equal(serialized.includes("witness"), false, "No witness data in network config");
  assert.equal(serialized.includes("salary"), false, "No salary data in network config");
});
