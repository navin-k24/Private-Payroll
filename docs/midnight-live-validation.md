# Midnight Public Network Live Validation Checklist

This checklist tracks manual and automated validation of the **Midnight Private Payroll / Splits dApp** against official Midnight public networks (**Preview** / **Preprod**).

> [!NOTE]
> Per project guidelines, checkboxes are marked complete (`[x]`) strictly as verified. Manual transaction steps that require user interaction with a funded Midnight Lace browser wallet on the public testnet are verified during manual live validation sessions.

---

## 1. Network Configuration & Pre-Flight

- [x] **Correct public network selected**
  - Application configuration layer supports `preview` and `preprod` via `NEXT_PUBLIC_MIDNIGHT_NETWORK_ID`.
  - Obsolete `testnet-02` identifier is rejected and explicitly flagged obsolete.
- [x] **Public endpoints verified**
  - Preview Node RPC: `https://rpc.preview.midnight.network`
  - Preview Indexer GraphQL: `https://indexer.preview.midnight.network/api/v4/graphql`
  - Preview Indexer WebSocket: `wss://indexer.preview.midnight.network/api/v4/graphql/ws`
  - Public faucet: `https://faucet.preview.midnight.network`
- [x] **UI shows correct public network**
  - Product header displays `Network: Preview` and `Environment: Public Network`.
  - Network mismatch detection prevents cross-network transactions and displays corrective guidance.
- [x] **Automated network selection tests pass**
  - All 7 network selection and compatibility test scenarios in `tests/midnight-network-config.test.mjs` pass.

---

## 2. Interactive Wallet & Public Testnet Procedures

The following checklist tracks end-to-end verification through the connected Midnight Lace browser extension:

- [ ] **Lace connected**
  - Midnight Lace browser extension connects via `@midnight-ntwrk/dapp-connector-api`.
  - Shielded address (`addresses.shieldedAddress`) is resolved and abbreviated in the UI.
- [ ] **Wallet funded**
  - Unshielded address (`mn_addr_...`) received `tNIGHT` from the official Preview faucet.
  - `tDUST` accrued in Midnight Lace to pay for zero-knowledge transaction fees.
- [ ] **Contract deployed**
  - User invoked **Deploy Private Payroll Contract** from the dashboard.
  - Deployment transaction sealed and broadcast to Midnight Preview.
- [ ] **Contract address captured**
  - Real contract address retrieved and displayed upon block finalization.
- [ ] **Initial public ledger queried**
  - Indexer queried: `split_count = 0`, `verification_count = 0`, `payroll_cycle = 0`.
- [ ] **Contract joined successfully**
  - New session joined using the captured contract address; public state matches.
- [ ] **Private split transaction submitted**
  - Confidential salary and public maximum ceiling supplied.
  - Client-side zk-SNARK proof synthesized with blinding nonce.
- [ ] **Wallet approval completed**
  - Transaction balanced and authorized in Midnight Lace.
- [ ] **Transaction confirmed**
  - Transaction finalized in a block on Midnight Preview.
- [ ] **Split count increased from actual ledger**
  - Public ledger queried from indexer; `split_count` incremented by 1 without client-side faking.
- [ ] **Commitment visible**
  - 32-byte cryptographic split commitment hash displayed in receipt.
- [ ] **Raw salary absent from public state**
  - Block data and public ledger checked: raw salary figure and blinding salt are strictly absent.
- [ ] **Invalid split rejected**
  - Attempting to submit salary exceeding ceiling is rejected by circuit assertion with counters untouched.

---

## 3. Product Scope Clarification

> [!IMPORTANT]
> The current system provides **privacy-preserving payroll split verification and commitment recording**.
> It ensures confidential salaries satisfy organization policies in zero-knowledge and logs immutable proof commitments.
> It does not execute automated cryptocurrency or fiat payroll payouts to employee wallets.
