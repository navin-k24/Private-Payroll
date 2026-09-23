"use client";

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  getAddress,
  isConnected,
  requestAccess,
  signTransaction,
} = require("@stellar/freighter-api");
const {
  buildPaymentTransaction,
  createPaymentIntent,
  formatXlmAmount,
  normalizeStellarAddress,
  routePayment,
  submitSignedPayment,
  validatePaymentIntent,
} = require("./payment-contract");

const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const TRANSACTION_HASH_PATTERN = /^[0-9a-f]{64}$/i;
const DEFAULT_FREIGHTER_API = {
  getAddress,
  isConnected,
  requestAccess,
  signTransaction,
};

async function ensureFreighterAccess(freighterApi = DEFAULT_FREIGHTER_API) {
  const connection = await freighterApi.isConnected();

  if (connection.error) {
    throw new Error(
      connection.error.message ||
        "Freighter could not verify the wallet connection.",
    );
  }

  const connected = typeof connection === "boolean" ? connection : connection.isConnected;
  if (!connected) {
    const access = await freighterApi.requestAccess();
    if (access.error) {
      throw new Error(
        access.error.message ||
          "Freighter access request was rejected or unavailable.",
      );
    }

    const grantedAddress =
      typeof access.address === "string" ? access.address.trim() : "";

    if (!grantedAddress) {
      throw new Error(
        "Freighter access was not granted. Please approve the browser extension popup and try again.",
      );
    }

    return grantedAddress;
  }

  return null;
}

async function requestFreighterAccess(freighterApi = DEFAULT_FREIGHTER_API) {
  const access = await freighterApi.requestAccess();
  if (access.error) {
    throw new Error(
      access.error.message ||
        "Freighter access request was rejected or unavailable.",
    );
  }

  const grantedAddress =
    typeof access.address === "string" ? access.address.trim() : "";

  if (!grantedAddress) {
    throw new Error(
      "Freighter access was not granted. Please approve the browser extension popup and try again.",
    );
  }

  return grantedAddress;
}

async function getFreighterAddress(freighterApi = DEFAULT_FREIGHTER_API) {
  const grantedAddress = await ensureFreighterAccess(freighterApi);
  if (grantedAddress) {
    return grantedAddress;
  }

  const addressResult = await freighterApi.getAddress();
  if (!addressResult || typeof addressResult !== "object") {
    throw new Error(
      "Freighter returned an unexpected getAddress() response. Expected an object with an address field.",
    );
  }

  if (addressResult.error) {
    throw new Error(
      addressResult.error.message ||
        "Freighter could not return the connected address.",
    );
  }

  const address = typeof addressResult.address === "string"
    ? addressResult.address.trim()
    : "";

  if (!address) {
    throw new Error("Freighter returned an empty wallet address.");
  }

  return address;
}

async function getConnectedFreighterAddress(freighterApi = DEFAULT_FREIGHTER_API) {
  const connection = await freighterApi.isConnected();
  if (connection?.error) {
    throw new Error(connection.error.message || "Freighter connection check failed.");
  }
  const connected = typeof connection === "boolean" ? connection : connection?.isConnected;
  if (!connected) {
    throw new Error("Connect Freighter before submitting a payment.");
  }

  const result = await freighterApi.getAddress();
  if (result?.error) {
    throw new Error(result.error.message || "Freighter could not return the selected account.");
  }
  const address = typeof result?.address === "string" ? result.address.trim() : "";
  if (!address) {
    throw new Error("Freighter did not return a selected account.");
  }
  return normalizeStellarAddress(address);
}

function assertWalletAccountMatch(selectedAddress, transactionSource, fromAddress) {
  const selected = normalizeStellarAddress(selectedAddress);
  const source = normalizeStellarAddress(transactionSource);
  const from = normalizeStellarAddress(fromAddress);

  if (selected !== source || source !== from) {
    const error = new Error(
      "Wallet account changed. Reconnect the wallet and review the payment before trying again.",
    );
    error.code = "WALLET_ACCOUNT_MISMATCH";
    throw error;
  }

  return selected;
}

function mapPaymentError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = error && typeof error === "object" ? error.code : undefined;

  if (code === "WALLET_ACCOUNT_MISMATCH") return message;
  if (/connect Freighter|wallet not connected|did not return a selected/i.test(message)) {
    return "Connect Freighter on Testnet before submitting a payment.";
  }
  if (/reject|denied|declined|cancel/i.test(message)) {
    return "The wallet request was rejected. No transaction was submitted.";
  }
  if (/insufficient|balance/i.test(message)) {
    return "The connected account does not have enough available XLM for this payment and fees.";
  }
  if (/destination.*different|source and destination|self/i.test(message)) {
    return "Destination address must be different from the connected wallet.";
  }
  if (/not initialized|missing.*config|configuration/i.test(message)) {
    return "The payment contract is not configured. Please contact the app administrator.";
  }
  if (/network|passphrase/i.test(message)) {
    return "Freighter must be connected to Stellar Testnet.";
  }
  if (code === "SIMULATION_FAILED" || /HostError|simulation|UnreachableCodeReached/i.test(message)) {
    return "The payment could not be prepared on Testnet. Please reconnect your wallet and try again.";
  }
  return "The payment could not be submitted. Please try again.";
}

function getTransactionExplorerUrl(transactionHash) {
  const hash = String(transactionHash ?? "").trim();
  return TRANSACTION_HASH_PATTERN.test(hash)
    ? `https://stellar.expert/explorer/testnet/tx/${hash}`
    : null;
}

async function signTransactionWithFreighter(
  tx,
  address,
  freighterApi = DEFAULT_FREIGHTER_API,
) {
  const signerAddress = address ?? (await getFreighterAddress(freighterApi));
  const response = await freighterApi.signTransaction(tx.toXDR(), {
    networkPassphrase: TESTNET_PASSPHRASE,
    address: signerAddress,
  });

  if (!response || typeof response !== "object") {
    throw new Error(
      "Freighter returned an unexpected signTransaction() response. Expected an object with signedTxXdr and signerAddress.",
    );
  }

  if (response.error) {
    throw new Error(response.error.message || "Freighter rejected the transaction.");
  }

  if (typeof response.signedTxXdr !== "string" || !response.signedTxXdr.trim()) {
    throw new Error("Freighter returned an empty signed transaction.");
  }

  return {
    signedTxXdr: response.signedTxXdr,
    signerAddress: typeof response.signerAddress === "string" && response.signerAddress.trim()
      ? response.signerAddress.trim()
      : signerAddress,
  };
}

async function executePaymentPipeline(
  intent,
  options = {},
) {
  const startedAt = (options.clock ?? (() => new Date()))();
  const freighterApi = options.freighterApi ?? DEFAULT_FREIGHTER_API;
  const buildPaymentTransactionFn =
    options.buildPaymentTransaction ?? buildPaymentTransaction;
  const submitSignedPaymentFn =
    options.submitSignedPayment ?? submitSignedPayment;
  const validation = validatePaymentIntent(intent);
  const routing = routePayment(intent, validation);

  if (!intent.source) {
    throw new Error("Connect a wallet before submitting a payment.");
  }
  const selectedAddress = await getConnectedFreighterAddress(freighterApi);
  if (process.env.NODE_ENV !== "production") {
    console.error("[Payment diagnostics] Freighter-selected address", selectedAddress);
  }
  const sourceAddress = intent.source;
  const normalizedSourceAddress = normalizeStellarAddress(sourceAddress);
  if (normalizedSourceAddress === normalizeStellarAddress(intent.destination)) {
    throw new Error("Destination address must be different from the connected wallet.");
  }
  assertWalletAccountMatch(
    selectedAddress,
    normalizedSourceAddress,
    intent.source,
  );

  const preparedPayment = await buildPaymentTransactionFn(
    intent,
    normalizedSourceAddress,
  );
  const { signedTxXdr, signerAddress } = await signTransactionWithFreighter(
    preparedPayment.prepared,
    normalizedSourceAddress,
    freighterApi,
  );

  const submission = await submitSignedPaymentFn(signedTxXdr);
  const confirmationStatus = submission.confirmed?.status === "SUCCESS"
    ? "success"
    : "pending";
  const transactionHash = String(submission.transactionHash ?? "").trim();
  const explorerUrl = getTransactionExplorerUrl(transactionHash);
  const amount = formatXlmAmount(preparedPayment.amountStroops);
  const fee = formatXlmAmount(BigInt(preparedPayment.prepared.fee));
  const receiptId = `tx-${startedAt.getTime().toString(36)}-${preparedPayment.amountStroops
    .toString(36)
    .slice(0, 8)}`;

  const events = [
    {
      id: `${receiptId}-sign`,
      kind: "wallet",
      message: "Freighter signed transaction",
      detail: `Signed by ${signerAddress || normalizedSourceAddress}.`,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
    {
      id: `${receiptId}-confirm`,
      kind: "notify",
      message: confirmationStatus === "success"
        ? "Transaction confirmed on Stellar Testnet"
        : "Transaction pending confirmation",
      detail: confirmationStatus === "success"
        ? `Soroban RPC confirmed transaction ${transactionHash}.`
        : `Submitted transaction ${transactionHash}; awaiting Soroban RPC confirmation.`,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
  ];

  return {
    receiptId,
    transactionHash,
    explorerUrl,
    confirmationStatus,
    bridgeAddress: routing.bridgeAddress,
    amount,
    destination: intent.destination,
    fee,
    routeLabel: "on-chain",
    statusSummary: confirmationStatus === "success"
      ? "Payment confirmed on Stellar Testnet and recorded by the registry contract."
      : "Transaction pending confirmation",
    validation,
    routing,
    events,
  };
}

module.exports = {
  createPaymentIntent,
  requestFreighterAccess,
  getFreighterAddress,
  getConnectedFreighterAddress,
  assertWalletAccountMatch,
  mapPaymentError,
  getTransactionExplorerUrl,
  executePaymentPipeline,
};
