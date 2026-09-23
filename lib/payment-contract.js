/* eslint-disable @typescript-eslint/no-require-imports */
const StellarSdk = require("@stellar/stellar-sdk");

const ADDRESS_PATTERN = /^G[A-Z2-7]{55}$/;
const MAX_MEMO_LENGTH = 28;
const MAX_TRANSFER_STROOPS = 500_000_000n;
const STROOPS_PER_XLM = 10_000_000n;
const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const PAYMENT_CONTRACT_ID = process.env.NEXT_PUBLIC_PAYMENT_CONTRACT_ID;
const REGISTRY_CONTRACT_ID = process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID;
const SOROBAN_RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL;

function logDevelopmentDiagnostic(label, value) {
  if (process.env.NODE_ENV !== "production") {
    console.error(`[Payment diagnostics] ${label}`, value);
  }
}

function createSubmissionTemplate() {
  return {
    destination: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    amount: "12.5",
    memo: "Invoice 2048",
  };
}

function normalizeStellarAddress(input) {
  const value = String(input ?? "").trim().toUpperCase();

  if (!value) {
    throw new Error("Destination address is required.");
  }

  if (!ADDRESS_PATTERN.test(value)) {
    throw new Error("Enter a valid Stellar public key that starts with G.");
  }

  return value;
}

function parseXlmAmount(input) {
  const raw = String(input ?? "").trim();

  if (!raw) {
    throw new Error("Amount is required.");
  }

  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error("Amount must be a positive decimal number.");
  }

  const [wholePart, fractionPart = ""] = raw.split(".");
  if (fractionPart.length > 7) {
    throw new Error("Amount supports up to 7 decimal places.");
  }

  const normalized = `${wholePart}${fractionPart.padEnd(7, "0")}`;
  const stroops = BigInt(normalized);

  if (stroops <= 0n) {
    throw new Error("Amount must be greater than zero.");
  }

  return stroops;
}

function formatXlmAmount(stroops) {
  const value = typeof stroops === "bigint" ? stroops : BigInt(stroops);
  const whole = value / STROOPS_PER_XLM;
  const fraction = value % STROOPS_PER_XLM;

  if (fraction === 0n) {
    return whole.toString();
  }

  return `${whole.toString()}.${fraction.toString().padStart(7, "0").replace(/0+$/, "")}`;
}

function createPipelineDigest(intent, timestamp) {
  const seed = [
    intent.source,
    intent.destination,
    intent.amountStroops.toString(),
    intent.memo,
    timestamp.toISOString(),
  ].join("|");

  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `dg-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function buildAuditMemo(memo, destination) {
  const safeMemo = String(memo ?? "").trim();
  if (safeMemo.length > MAX_MEMO_LENGTH) {
    throw new Error(`Memo must be ${MAX_MEMO_LENGTH} characters or fewer.`);
  }

  return `${safeMemo || "no memo"} -> ${destination.slice(0, 6)}...`;
}

function createPaymentIntent({ destination, amount, memo, source = "" }) {
  const normalizedDestination = normalizeStellarAddress(destination);
  const stroops = parseXlmAmount(amount);
  const auditMemo = buildAuditMemo(memo, normalizedDestination);

  return {
    source,
    destination: normalizedDestination,
    amountStroops: stroops,
    amountXlm: formatXlmAmount(stroops),
    memo: memo ? String(memo).trim() : "",
    auditMemo,
    submittedAt: new Date().toISOString(),
  };
}

function validatePaymentIntent(intent) {
  const warnings = [];

  if (intent.amountStroops > MAX_TRANSFER_STROOPS) {
    warnings.push("Large transfer requires manual review.");
  }

  if (!intent.memo) {
    warnings.push("Memo is empty; reconciliation will rely on the receipt id.");
  }

  return {
    approved: warnings.length === 0,
    warnings,
  };
}

function routePayment(intent, validation) {
  if (!validation.approved && intent.amountStroops > MAX_TRANSFER_STROOPS) {
    return {
      bridgeAddress: PAYMENT_CONTRACT_ID || "Payment contract unavailable",
      routeLabel: "review-queue",
      feeStroops: 100n,
      warnings: validation.warnings,
    };
  }

  return {
    bridgeAddress: PAYMENT_CONTRACT_ID || "Payment contract unavailable",
    routeLabel: "payment-contract",
    feeStroops: 100n,
    warnings: validation.warnings,
  };
}

function auditPayment(intent, routing, validation) {
  const memo = validation.warnings.length
    ? `${intent.auditMemo} | ${validation.warnings.join(" ")}`
    : intent.auditMemo;

  return {
    signed: true,
    memo,
    digest: createPipelineDigest(intent, new Date(intent.submittedAt)),
    routing,
  };
}

function notifyPayment(intent, auditResult, routing) {
  return {
    channel: "event-stream",
    message: `Payment of ${intent.amountXlm} XLM queued through the ${routing.routeLabel}.`,
    detail: `Audit digest ${auditResult.digest} recorded for ${intent.destination.slice(0, 8)}...`,
  };
}

function getRpcServer() {
  if (!SOROBAN_RPC_URL) {
    throw new Error("NEXT_PUBLIC_SOROBAN_RPC_URL is not set.");
  }

  return new StellarSdk.rpc.Server(SOROBAN_RPC_URL);
}

function getPaymentContract() {
  if (!PAYMENT_CONTRACT_ID) {
    throw new Error("NEXT_PUBLIC_PAYMENT_CONTRACT_ID is not set.");
  }

  return new StellarSdk.Contract(PAYMENT_CONTRACT_ID);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTransactionConfirmation(server, hash, timeoutMs = 60_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const response = await server.getTransaction(hash);

    if (response.status === "SUCCESS") {
      return response;
    }

    if (response.status === "FAILED") {
      throw new Error(`Transaction failed on-chain: ${hash}`);
    }

    if (response.status !== "NOT_FOUND") {
      throw new Error(`Unexpected transaction status: ${response.status}`);
    }

    await sleep(2_000);
  }

  throw new Error(`Timed out waiting for transaction confirmation: ${hash}`);
}

async function buildPaymentTransaction(intent, sourceAddress) {
  const server = getRpcServer();
  const paymentContract = getPaymentContract();
  const normalizedSource = normalizeStellarAddress(sourceAddress);
  const destinationAddress = normalizeStellarAddress(intent.destination);
  const amountStroops = intent.amountStroops ?? parseXlmAmount(intent.amount);

  if (normalizedSource === destinationAddress) {
    throw new Error("Destination address must be different from the connected wallet.");
  }

  logDevelopmentDiagnostic("transaction context", {
    transactionSource: normalizedSource,
    sendPaymentFrom: normalizedSource,
    destinationAddress,
    amountStroops: amountStroops.toString(),
    network: "Testnet",
    networkPassphrase: TESTNET_PASSPHRASE,
    paymentContractId: PAYMENT_CONTRACT_ID,
    registryContractId: REGISTRY_CONTRACT_ID,
    nativeAssetContractId: process.env.NEXT_PUBLIC_NATIVE_ASSET_CONTRACT_ID,
  });

  const sourceAccount = await server.getAccount(normalizedSource);

  const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(
      paymentContract.call(
        "send_payment",
        StellarSdk.nativeToScVal(StellarSdk.Address.fromString(normalizedSource), {
          type: "address",
        }),
        StellarSdk.nativeToScVal(StellarSdk.Address.fromString(destinationAddress), {
          type: "address",
        }),
        StellarSdk.nativeToScVal(amountStroops, { type: "i128" }),
      ),
    )
    .setTimeout(30)
    .build();

  const simulation = await server.simulateTransaction(
    transaction,
    undefined,
    "record",
  );
  logDevelopmentDiagnostic("Soroban simulation result", simulation);

  if (!StellarSdk.rpc.Api.isSimulationSuccess(simulation)) {
    const simulationError = new Error(
      simulation.error || "Soroban transaction simulation failed.",
    );
    simulationError.code = "SIMULATION_FAILED";
    throw simulationError;
  }

  const prepared = StellarSdk.rpc.assembleTransaction(
    transaction,
    simulation,
  ).build();

  return {
    prepared,
    sourceAddress: normalizedSource,
    destinationAddress,
    amountStroops,
    amountXlm: formatXlmAmount(amountStroops),
  };
}

async function submitSignedPayment(signedTxXdr) {
  const server = getRpcServer();
  const signedTx = StellarSdk.TransactionBuilder.fromXDR(
    signedTxXdr,
    TESTNET_PASSPHRASE,
  );

  const sendResponse = await server.sendTransaction(signedTx);

  if (sendResponse.status === "ERROR") {
    throw new Error(`Soroban RPC rejected the transaction: ${sendResponse.hash}`);
  }

  const confirmed = await waitForTransactionConfirmation(server, sendResponse.hash);

  return {
    sendResponse,
    confirmed,
    transactionHash: sendResponse.hash,
  };
}

function createInitialFeed() {
  return [];
}

function getArchitectureNotes() {
  return [
    {
      title: "Contract orchestration",
      detail:
        "The payment contract submits the transfer on Testnet and the registry contract records the payment history on-chain.",
    },
    {
      title: "Real-time feedback",
      detail:
        "The UI subscribes to a server-sent event stream so the feed updates without manual refreshes.",
    },
  ];
}

module.exports = {
  TESTNET_PASSPHRASE,
  createSubmissionTemplate,
  normalizeStellarAddress,
  parseXlmAmount,
  formatXlmAmount,
  createPaymentIntent,
  validatePaymentIntent,
  routePayment,
  auditPayment,
  notifyPayment,
  getRpcServer,
  getPaymentContract,
  buildPaymentTransaction,
  submitSignedPayment,
  createInitialFeed,
  getArchitectureNotes,
};
