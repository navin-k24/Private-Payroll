/**
 * Midnight Public Network Configuration and Validation Layer.
 *
 * Supports official Midnight developer networks:
 * - `preview`: Primary public test network for early development & experimentation
 * - `preprod`: Public test network closely tracking mainnet for final validation
 * - `undeployed`: Local Docker DevNet standalone engine
 *
 * Rejects legacy/obsolete network identifiers such as `testnet-02`.
 * Adheres to the Midnight DApp Connector specification by prioritizing
 * wallet-supplied service configurations and validating wallet network alignment.
 */

import type { Configuration } from "@midnight-ntwrk/dapp-connector-api";

export type SupportedNetworkId = "preview" | "preprod" | "undeployed";

export type NetworkEnvironmentType = "public" | "local-devnet";

export type MidnightNetworkDefinition = {
  readonly id: SupportedNetworkId;
  readonly displayName: string;
  readonly environment: NetworkEnvironmentType;
  readonly nodeRpcUri: string;
  readonly indexerUri: string;
  readonly indexerWsUri: string;
  readonly proofServerUri: string;
  readonly faucetUrl?: string;
  readonly description: string;
};

export const SUPPORTED_NETWORKS: Readonly<Record<SupportedNetworkId, MidnightNetworkDefinition>> = {
  preview: {
    id: "preview",
    displayName: "Preview",
    environment: "public",
    nodeRpcUri: "https://rpc.preview.midnight.network",
    indexerUri: "https://indexer.preview.midnight.network/api/v4/graphql",
    indexerWsUri: "wss://indexer.preview.midnight.network/api/v4/graphql/ws",
    proofServerUri: "http://localhost:6300",
    faucetUrl: "https://faucet.preview.midnight.network",
    description: "Public test network for early development and experimentation",
  },
  preprod: {
    id: "preprod",
    displayName: "Preprod",
    environment: "public",
    nodeRpcUri: "https://rpc.preprod.midnight.network",
    indexerUri: "https://indexer.preprod.midnight.network/api/v4/graphql",
    indexerWsUri: "wss://indexer.preprod.midnight.network/api/v4/graphql/ws",
    proofServerUri: "http://localhost:6300",
    faucetUrl: "https://faucet.preprod.midnight.network",
    description: "Public test network tracking mainnet for pre-production validation",
  },
  undeployed: {
    id: "undeployed",
    displayName: "Local DevNet",
    environment: "local-devnet",
    nodeRpcUri: "http://localhost:9944",
    indexerUri: "http://localhost:8088/api/v3/graphql",
    indexerWsUri: "ws://localhost:8088/api/v3/graphql/ws",
    proofServerUri: "http://localhost:6300",
    description: "Isolated local development network running standalone Docker services",
  },
};

export const OBSOLETE_NETWORKS = ["testnet-02", "testnet-01", "testnet"] as const;

/**
 * Normalizes a raw network ID string.
 */
export function normalizeNetworkId(networkId?: string): string {
  return String(networkId || "").trim().toLowerCase();
}

/**
 * Checks if a network ID is currently supported.
 */
export function isSupportedNetworkId(networkId?: string): networkId is SupportedNetworkId {
  const normalized = normalizeNetworkId(networkId);
  return normalized === "preview" || normalized === "preprod" || normalized === "undeployed";
}

/**
 * Checks if a network ID belongs to an obsolete network (e.g. testnet-02).
 */
export function isObsoleteNetworkId(networkId?: string): boolean {
  const normalized = normalizeNetworkId(networkId);
  return OBSOLETE_NETWORKS.some((obs) => normalized === obs || normalized.startsWith("testnet-"));
}

/**
 * Checks if a network is a public network (Preview or Preprod).
 */
export function isPublicNetwork(networkId?: string): boolean {
  const normalized = normalizeNetworkId(networkId);
  return normalized === "preview" || normalized === "preprod";
}

/**
 * Checks if a network is local DevNet (undeployed).
 */
export function isLocalDevnet(networkId?: string): boolean {
  const normalized = normalizeNetworkId(networkId);
  return normalized === "undeployed" || normalized === "devnet";
}

/**
 * Resolves the application's target Midnight network ID from environment or default.
 * Defaults to "preview" for public testnet operation.
 */
export function resolveApplicationNetworkId(overrideNetworkId?: string): SupportedNetworkId {
  const rawId = overrideNetworkId ?? process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK_ID;
  const normalized = normalizeNetworkId(rawId);

  if (!normalized) {
    return "preview";
  }

  if (isObsoleteNetworkId(normalized)) {
    throw new Error(
      `Network identifier '${rawId}' is obsolete. Please configure 'preview' or 'preprod' in NEXT_PUBLIC_MIDNIGHT_NETWORK_ID.`,
    );
  }

  if (!isSupportedNetworkId(normalized)) {
    throw new Error(
      `Unsupported Midnight network identifier '${rawId}'. Supported networks are 'preview', 'preprod', or 'undeployed'.`,
    );
  }

  return normalized;
}

/**
 * Returns the full network configuration definition for an application network ID.
 */
export function resolveApplicationNetworkConfig(
  overrideNetworkId?: string,
): MidnightNetworkDefinition {
  const id = resolveApplicationNetworkId(overrideNetworkId);
  return SUPPORTED_NETWORKS[id];
}

export type WalletNetworkValidationResult = {
  readonly compatible: boolean;
  readonly isObsolete?: boolean;
  readonly reason?: string;
  readonly appNetworkId: string;
  readonly walletNetworkId?: string;
  readonly walletEndpoints?: {
    readonly indexerUri?: string;
    readonly indexerWsUri?: string;
    readonly substrateNodeUri?: string;
    readonly proverServerUri?: string;
  };
};

/**
 * Validates that the connected Midnight Lace wallet network matches the application network,
 * and verifies that the wallet supplies valid endpoints.
 */
export function validateWalletNetworkCompatibility(params: {
  readonly appNetworkId: string;
  readonly walletNetworkId?: string;
  readonly walletConfig?: Partial<Configuration>;
}): WalletNetworkValidationResult {
  const { appNetworkId, walletNetworkId, walletConfig } = params;
  const appNorm = normalizeNetworkId(appNetworkId);
  const walletNorm = normalizeNetworkId(walletNetworkId || walletConfig?.networkId);

  if (!walletNorm) {
    return {
      compatible: false,
      reason: "Wallet network is unknown or not reported by Midnight Lace.",
      appNetworkId: appNorm,
      walletNetworkId: undefined,
    };
  }

  if (isObsoleteNetworkId(walletNorm)) {
    return {
      compatible: false,
      isObsolete: true,
      reason: `Connected wallet is configured for obsolete network '${walletNorm}'. Please switch your Midnight Lace wallet network to '${appNorm}'.`,
      appNetworkId: appNorm,
      walletNetworkId: walletNorm,
    };
  }

  if (appNorm !== walletNorm) {
    const appDef = isSupportedNetworkId(appNorm) ? SUPPORTED_NETWORKS[appNorm].displayName : appNorm;
    const walletDef = isSupportedNetworkId(walletNorm) ? SUPPORTED_NETWORKS[walletNorm].displayName : walletNorm;
    return {
      compatible: false,
      reason: `Network mismatch: Midnight Lace is connected to '${walletDef}' (${walletNorm}), but this application requires '${appDef}' (${appNorm}). Please switch networks in Midnight Lace and reconnect.`,
      appNetworkId: appNorm,
      walletNetworkId: walletNorm,
    };
  }

  // If walletConfig is present, validate endpoints if provided
  if (walletConfig) {
    if (walletConfig.indexerUri && !walletConfig.indexerUri.startsWith("http")) {
      return {
        compatible: false,
        reason: `Wallet indexer URI '${walletConfig.indexerUri}' is malformed.`,
        appNetworkId: appNorm,
        walletNetworkId: walletNorm,
      };
    }
  }

  return {
    compatible: true,
    appNetworkId: appNorm,
    walletNetworkId: walletNorm,
    walletEndpoints: walletConfig
      ? {
          indexerUri: walletConfig.indexerUri,
          indexerWsUri: walletConfig.indexerWsUri,
          substrateNodeUri: walletConfig.substrateNodeUri,
          proverServerUri: walletConfig.proverServerUri,
        }
      : undefined,
  };
}

export type EffectiveServiceEndpoints = {
  readonly networkId: SupportedNetworkId;
  readonly environment: NetworkEnvironmentType;
  readonly indexerUri: string;
  readonly indexerWsUri: string;
  readonly substrateNodeUri: string;
  readonly proofServerUri: string;
  readonly source: "wallet-configured" | "application-defaults" | "custom-override";
};

/**
 * Derives effective service endpoints prioritizing:
 * 1. Explicit caller overrides
 * 2. Wallet-provided configuration (via Lace getConfiguration())
 * 3. Official application network defaults
 *
 * Ensures no private credentials, passwords, or witness data are leaked.
 */
export function getEffectiveServiceEndpoints(params: {
  readonly appNetworkId?: string;
  readonly walletConfig?: Partial<Configuration>;
  readonly explicitOverrides?: {
    readonly indexerUri?: string;
    readonly indexerWsUri?: string;
    readonly proofServerUri?: string;
    readonly substrateNodeUri?: string;
  };
}): EffectiveServiceEndpoints {
  const appConfig = resolveApplicationNetworkConfig(params.appNetworkId);
  const wallet = params.walletConfig;
  const overrides = params.explicitOverrides;

  const hasWalletEndpoints = Boolean(wallet?.indexerUri || wallet?.indexerWsUri || wallet?.proverServerUri);
  const hasOverrides = Boolean(
    overrides?.indexerUri || overrides?.indexerWsUri || overrides?.proofServerUri,
  );

  const indexerUri =
    overrides?.indexerUri?.trim() ||
    wallet?.indexerUri?.trim() ||
    appConfig.indexerUri;

  const indexerWsUri =
    overrides?.indexerWsUri?.trim() ||
    wallet?.indexerWsUri?.trim() ||
    appConfig.indexerWsUri;

  const substrateNodeUri =
    overrides?.substrateNodeUri?.trim() ||
    wallet?.substrateNodeUri?.trim() ||
    appConfig.nodeRpcUri;

  const proofServerUri =
    overrides?.proofServerUri?.trim() ||
    wallet?.proverServerUri?.trim() ||
    appConfig.proofServerUri;

  return {
    networkId: appConfig.id,
    environment: appConfig.environment,
    indexerUri,
    indexerWsUri,
    substrateNodeUri,
    proofServerUri,
    source: hasOverrides
      ? "custom-override"
      : hasWalletEndpoints
        ? "wallet-configured"
        : "application-defaults",
  };
}
