/**
 * Application-facing wallet adapter for Midnight Lace / DApp Connector.
 *
 * Provides typed lifecycle management, wallet discovery, network-aware connection,
 * address resolution, and user-friendly error mapping using the official
 * @midnight-ntwrk/dapp-connector-api standard.
 */

import type {
  ConnectedAPI,
  InitialAPI,
  Configuration,
} from "@midnight-ntwrk/dapp-connector-api";

export const DEFAULT_MIDNIGHT_NETWORK_ID =
  process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK_ID?.trim() || "preview";

export type WalletConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "error";

export type MidnightWalletAddresses = {
  readonly shieldedAddress: string;
  readonly shieldedCoinPublicKey: string;
  readonly shieldedEncryptionPublicKey: string;
  readonly unshieldedAddress: string;
  readonly dustAddress: string;
};

export type MidnightWalletState = {
  readonly status: WalletConnectionStatus;
  readonly networkId: string;
  readonly initialAPI?: InitialAPI;
  readonly connectedAPI?: ConnectedAPI;
  readonly configuration?: Configuration;
  readonly addresses?: MidnightWalletAddresses;
  readonly error?: string;
};

/**
 * Discovers whether a compatible Midnight wallet (such as Lace) is injected in the browser environment.
 */
export function isMidnightWalletAvailable(
  windowObj?: Window,
): boolean {
  const currentWindow =
    windowObj ?? (typeof window !== "undefined" ? window : undefined);
  if (!currentWindow || !currentWindow.midnight) {
    return false;
  }
  return Object.keys(currentWindow.midnight).length > 0;
}

/**
 * Retrieves the Midnight InitialAPI from the window object.
 * Inspects known keys (such as `mnLace` or `lace`) or matches by RDNS/name.
 */
export function getMidnightInitialAPI(
  windowObj?: Window,
): InitialAPI | undefined {
  const currentWindow =
    windowObj ?? (typeof window !== "undefined" ? window : undefined);
  if (!currentWindow || !currentWindow.midnight) {
    return undefined;
  }

  const midnight = currentWindow.midnight;

  // 1. Check direct canonical lace identifiers
  if (midnight.mnLace) return midnight.mnLace;
  if (midnight.lace) return midnight.lace;

  // 2. Search for Lace or Midnight compatible extensions in injected keys
  for (const key of Object.keys(midnight)) {
    const candidate = midnight[key];
    if (
      candidate &&
      (candidate.rdns?.toLowerCase().includes("lace") ||
        candidate.name?.toLowerCase().includes("lace"))
    ) {
      return candidate;
    }
  }

  // 3. Fallback to first available connector if present
  const available = Object.values(midnight);
  return available.length > 0 ? available[0] : undefined;
}

/**
 * Maps connector and runtime errors into clear, actionable messages for users.
 */
export function mapWalletError(error: unknown): string {
  if (!error) return "An unknown wallet error occurred.";

  if (typeof error === "string") return error;

  const err = error as { code?: string; type?: string; reason?: string; message?: string };

  if (err.type === "DAppConnectorAPIError" || err.code) {
    switch (err.code) {
      case "Rejected":
      case "PermissionRejected":
        return "Connection request was rejected in Midnight Lace. Please approve the prompt to connect.";
      case "Disconnected":
        return "Midnight wallet disconnected. Please reconnect your account.";
      case "InternalError":
        return `Midnight Lace internal error: ${err.reason || err.message || "Failed to process request."}`;
      case "InvalidRequest":
        return `Invalid wallet request: ${err.reason || err.message || "Check network parameters."}`;
      default:
        if (err.reason) return err.reason;
    }
  }

  if (err.message) {
    if (err.message.includes("User rejected") || err.message.includes("cancelled")) {
      return "Connection request was rejected by the user.";
    }
    return err.message;
  }

  return "Failed to establish connection with Midnight wallet.";
}

/**
 * Formats a Midnight Bech32m address into an abbreviated string for UI display.
 */
export function abbreviateMidnightAddress(
  address: string,
  prefixChars = 10,
  suffixChars = 6,
): string {
  const safe = String(address ?? "").trim();
  if (safe.length <= prefixChars + suffixChars) {
    return safe;
  }
  return `${safe.slice(0, prefixChars)}...${safe.slice(-suffixChars)}`;
}

export type ConnectWalletOptions = {
  readonly networkId?: string;
  readonly windowObj?: Window;
  readonly initialAPI?: InitialAPI;
};

export type ConnectWalletResult = {
  readonly initialAPI: InitialAPI;
  readonly connectedAPI: ConnectedAPI;
  readonly addresses: MidnightWalletAddresses;
  readonly networkId: string;
  readonly configuration?: Configuration;
};

/**
 * Connects to Midnight Lace using the official DApp Connector connect(networkId) API,
 * resolves shielded and unshielded addresses, and returns the connected session.
 */
export async function connectMidnightWallet(
  options?: ConnectWalletOptions,
): Promise<ConnectWalletResult> {
  const networkId = options?.networkId || DEFAULT_MIDNIGHT_NETWORK_ID;
  const initialAPI =
    options?.initialAPI ?? getMidnightInitialAPI(options?.windowObj);

  if (!initialAPI) {
    throw new Error(
      "Midnight Lace wallet extension is not detected. Please install Midnight Lace to proceed.",
    );
  }

  if (typeof initialAPI.connect !== "function") {
    throw new Error(
      `Detected wallet '${initialAPI.name || "Unknown"}' does not implement the official DApp Connector connect() API.`,
    );
  }

  // 1. Prompt Lace for permission and connection to desired network
  let connectedAPI: ConnectedAPI;
  try {
    connectedAPI = await initialAPI.connect(networkId);
  } catch (connectError) {
    throw new Error(mapWalletError(connectError));
  }

  if (!connectedAPI) {
    throw new Error(
      "Midnight wallet did not return a valid ConnectedAPI session after connection.",
    );
  }

  // 2. Query wallet configuration if available
  let configuration: Configuration | undefined;
  if (typeof connectedAPI.getConfiguration === "function") {
    try {
      configuration = await connectedAPI.getConfiguration();
    } catch {
      // Allow fallback if wallet mocks omit getConfiguration
    }
  }

  // 3. Resolve wallet addresses from the real ConnectedAPI
  try {
    const [shielded, unshielded, dust] = await Promise.all([
      connectedAPI.getShieldedAddresses(),
      connectedAPI.getUnshieldedAddress(),
      connectedAPI.getDustAddress(),
    ]);

    const addresses: MidnightWalletAddresses = {
      shieldedAddress: shielded.shieldedAddress,
      shieldedCoinPublicKey: shielded.shieldedCoinPublicKey,
      shieldedEncryptionPublicKey: shielded.shieldedEncryptionPublicKey,
      unshieldedAddress: unshielded.unshieldedAddress,
      dustAddress: dust.dustAddress,
    };

    return {
      initialAPI,
      connectedAPI,
      addresses,
      networkId,
      configuration,
    };
  } catch (addressError) {
    throw new Error(
      `Failed to retrieve wallet addresses from Midnight Lace: ${mapWalletError(addressError)}`,
    );
  }
}
