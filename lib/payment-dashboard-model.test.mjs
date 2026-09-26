import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildPaymentFeed,
  getConsoleStatusLabel,
  mergeFeedEntries,
} from "./payment-dashboard-model.js";

test("mergeFeedEntries removes duplicates and keeps the newest items", () => {
  const feed = mergeFeedEntries(
    [
      { id: "a", kind: "ledger", message: "old a", detail: "", time: "09:00" },
      { id: "b", kind: "audit", message: "old b", detail: "", time: "09:01" },
    ],
    [
      { id: "b", kind: "audit", message: "new b", detail: "", time: "09:02" },
      { id: "c", kind: "notify", message: "new c", detail: "", time: "09:03" },
    ],
    3,
  );

  assert.deepEqual(
    feed.map((entry) => entry.id),
    ["b", "c", "a"],
  );
});

test("buildPaymentFeed prepends the rendered payment receipt", () => {
  const feed = buildPaymentFeed(
    [{ id: "seed", kind: "ledger", message: "seed", detail: "", time: "09:00" }],
    {
      receiptId: "tx-demo",
      amount: "2",
      destination: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      statusSummary: "Payment confirmed on Stellar Testnet and recorded by the registry contract.",
      events: [
        {
          id: "tx-demo-audit",
          kind: "wallet",
          message: "Freighter signed transaction",
          detail: "Wallet authorization completed.",
          time: "09:01",
        },
      ],
    },
    4,
  );

  assert.equal(feed[0].id, "tx-demo");
  assert.equal(feed[1].kind, "wallet");
  assert.equal(feed.length, 3);
});

test("getConsoleStatusLabel maps status to display text", () => {
  assert.equal(getConsoleStatusLabel("sending"), "Processing");
  assert.equal(getConsoleStatusLabel("success"), "Ready");
  assert.equal(getConsoleStatusLabel("idle"), "Idle");
});

test("dashboard exposes wallet controls, loading state, and honest hash state", async () => {
  const source = await readFile(
    new URL("../components/payment-dashboard.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /Connect Wallet/);
  assert.match(source, /Reconnect \/ Switch Account/);
  assert.match(source, /Connecting\.\.\./);
  assert.match(source, /disabled=\{pending \|\| walletLoading \|\| !walletAddress\}/);
  assert.match(source, /Not submitted yet/);
  assert.doesNotMatch(source, /useState\("TODO"\)/);
});

test("public UI omits submission placeholders and uses payment-registry wording", async () => {
  const files = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/payment-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("./payment-contract.js", import.meta.url), "utf8"),
  ]);
  const source = files.join("\n");
  for (const forbidden of [
    "Submission checklist",
    "Submission artifacts",
    "CI ready",
    "Passing tests",
    "Deployment posture",
    "Pending Vercel deployment",
    "Pending video upload",
    "audit contract",
    "notification contract",
  ]) {
    assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false);
  }
  assert.match(source, /registry contract/);
  assert.match(source, /xl:grid-cols-\[1\.3fr_0\.9fr\]/);
  assert.match(source, /sm:p-6/);
});

test("Stellar Expert contract and transaction links are safe and Testnet-only", async () => {
  const page = await readFile(new URL("../app/stellar/page.tsx", import.meta.url), "utf8");
  const dashboard = await readFile(
    new URL("../components/payment-dashboard.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /Verify on Stellar Testnet/);
  assert.match(
    page,
    /https:\/\/stellar\.expert\/explorer\/testnet\/contract\/CCAPQHTL5EYUYDWUV7BNZCXL6RPZWXLWQ35YUUQFCXDRIOUAFS4TJEY7/,
  );
  assert.match(
    page,
    /https:\/\/stellar\.expert\/explorer\/testnet\/contract\/CABBVUWIV2VXIRH7Y7OIKJDQHULOV2HOSCETOAZBKJWCL7QJYIUN5X77/,
  );
  assert.equal((page.match(/target="_blank"/g) ?? []).length, 2);
  assert.equal((page.match(/rel="noopener noreferrer"/g) ?? []).length, 2);
  assert.match(dashboard, /View transaction on Stellar Expert/);
  assert.match(dashboard, /target="_blank"/);
  assert.match(dashboard, /rel="noopener noreferrer"/);
  assert.match(dashboard, /result\.confirmationStatus === "success"/);
});
