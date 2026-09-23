import test from "node:test";
import assert from "node:assert/strict";

import {
  createPaymentIntent,
  formatXlmAmount,
  normalizeStellarAddress,
  parseXlmAmount,
} from "./payment-contract.js";
import {
  assertWalletAccountMatch,
  executePaymentPipeline,
  getTransactionExplorerUrl,
  mapPaymentError,
  requestFreighterAccess,
} from "./payment-contract-client.js";

const SENDER = "GC4X35HILWEOB6QWECLA2FKXECA3RU2EJU5RHIFMORUSW3PL6IJE724C";
const DESTINATION = "GCM66EU64WWR3QUXLV5XESMMZY6W3HVMAENNSKI7BD37WPN2BOYNX4AH";
const REAL_HASH = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

test("normalizeStellarAddress accepts a Stellar-style public key", () => {
  const address = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  assert.equal(normalizeStellarAddress(address), address);
});

test("parseXlmAmount converts decimal XLM into stroops", () => {
  assert.equal(parseXlmAmount("12.5"), 125000000n);
  assert.equal(formatXlmAmount(125000000n), "12.5");
});

test("createPaymentIntent builds a validated transfer payload", () => {
  const intent = createPaymentIntent({
    destination: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    amount: "1.2500000",
    memo: "Invoice 2048",
  });

  assert.equal(intent.amountXlm, "1.25");
  assert.equal(intent.auditMemo.includes("Invoice 2048"), true);
});

test("executePaymentPipeline returns a receipt and streamed contract events", async () => {
  const result = await executePaymentPipeline(
    createPaymentIntent({
      destination: DESTINATION,
      amount: "2",
      memo: "Rent",
      source: SENDER,
    }),
    {
      clock: () => new Date("2024-01-01T00:00:00Z"),
      freighterApi: {
        isConnected: async () => true,
        requestAccess: async () => ({
          address: SENDER,
        }),
        getAddress: async () => ({
          address: SENDER,
        }),
        signTransaction: async () => ({
          signedTxXdr: "signed-xdr",
          signerAddress: SENDER,
        }),
      },
      buildPaymentTransaction: async () => ({
        prepared: {
          fee: "100",
          toXDR: () => "prepared-xdr",
        },
        sourceAddress: SENDER,
        destinationAddress: DESTINATION,
        amountStroops: 20000000n,
        amountXlm: "2",
      }),
      submitSignedPayment: async () => ({
        transactionHash: REAL_HASH,
        sendResponse: { hash: REAL_HASH, status: "PENDING" },
        confirmed: { status: "SUCCESS" },
      }),
    },
  );

  assert.ok(result.receiptId.startsWith("tx-"));
  assert.equal(result.transactionHash, REAL_HASH);
  assert.equal(result.confirmationStatus, "success");
  assert.equal(
    result.statusSummary,
    "Payment confirmed on Stellar Testnet and recorded by the registry contract.",
  );
  assert.equal(
    result.explorerUrl,
    `https://stellar.expert/explorer/testnet/tx/${REAL_HASH}`,
  );
  assert.doesNotMatch(result.statusSummary, /PENDING|Confirmed on Testnet via/);
  assert.equal(result.events.length, 2);
  assert.equal(result.amount, "2");
  assert.equal(result.routeLabel, "on-chain");
  assert.equal(result.validation.approved, true);
});

test("wallet selection, transaction source, and from address must match", () => {
  assert.throws(
    () => assertWalletAccountMatch(SENDER, DESTINATION, SENDER),
    /Wallet account changed/,
  );
  assert.equal(assertWalletAccountMatch(SENDER, SENDER, SENDER), SENDER);
});

test("self-payment is rejected before transaction simulation", async () => {
  let buildCalled = false;
  await assert.rejects(
    executePaymentPipeline(
      createPaymentIntent({ destination: SENDER, amount: "0.1", memo: "self", source: SENDER }),
      {
        freighterApi: {
          isConnected: async () => ({ isConnected: true }),
          getAddress: async () => ({ address: SENDER }),
        },
        buildPaymentTransaction: async () => {
          buildCalled = true;
        },
      },
    ),
    /Destination address must be different/,
  );
  assert.equal(buildCalled, false);
});

test("Freighter rejection and simulation traps map to friendly messages", async () => {
  await assert.rejects(
    requestFreighterAccess({
      requestAccess: async () => ({ error: { message: "User rejected request" } }),
    }),
    /User rejected request/,
  );
  assert.equal(
    mapPaymentError(new Error("HostError: VM call trapped: UnreachableCodeReached")),
    "The payment could not be prepared on Testnet. Please reconnect your wallet and try again.",
  );
  assert.equal(
    mapPaymentError(new Error("User rejected request")),
    "The wallet request was rejected. No transaction was submitted.",
  );
});

test("pending RPC results are never described as confirmed", async () => {
  const result = await executePaymentPipeline(
    createPaymentIntent({ destination: DESTINATION, amount: "0.1", memo: "pending", source: SENDER }),
    {
      freighterApi: {
        isConnected: async () => ({ isConnected: true }),
        getAddress: async () => ({ address: SENDER }),
        signTransaction: async () => ({ signedTxXdr: "signed-xdr", signerAddress: SENDER }),
      },
      buildPaymentTransaction: async () => ({
        prepared: { fee: "100", toXDR: () => "prepared-xdr" },
        amountStroops: 1_000_000n,
      }),
      submitSignedPayment: async () => ({
        transactionHash: REAL_HASH,
        sendResponse: { status: "PENDING" },
        confirmed: { status: "PENDING" },
      }),
    },
  );
  assert.equal(result.confirmationStatus, "pending");
  assert.equal(result.statusSummary, "Transaction pending confirmation");
  assert.equal(result.events[1].message, "Transaction pending confirmation");
});

test("explorer links require exactly 64 hexadecimal characters", () => {
  assert.equal(
    getTransactionExplorerUrl(REAL_HASH),
    `https://stellar.expert/explorer/testnet/tx/${REAL_HASH}`,
  );
  assert.equal(getTransactionExplorerUrl("TODO"), null);
  assert.equal(getTransactionExplorerUrl("abc123"), null);
});
