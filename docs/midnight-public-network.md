# Midnight Public Network Guide (Preview & Preprod)

This document provides complete instructions for configuring, deploying, and validating the **Midnight Private Payroll / Splits dApp** on official Midnight public networks (**Preview** and **Preprod**).

---

## 1. Network Environments & Endpoints

Midnight operates two official public developer networks alongside the local development environment. **Do not use the deprecated `testnet-02` identifier.**

| Parameter | Preview (Default) | Preprod | Local DevNet (Standalone) |
| :--- | :--- | :--- | :--- |
| **Network Identifier** | `preview` | `preprod` | `undeployed` |
| **Environment Type** | Public Test Network | Public Test Network | Local Docker DevNet |
| **Node RPC** | `https://rpc.preview.midnight.network` | `https://rpc.preprod.midnight.network` | `http://localhost:9944` |
| **Node WebSocket** | `wss://rpc.preview.midnight.network` | `wss://rpc.preprod.midnight.network` | `ws://localhost:9944` |
| **Indexer GraphQL** | `https://indexer.preview.midnight.network/api/v4/graphql` | `https://indexer.preprod.midnight.network/api/v4/graphql` | `http://localhost:8088/api/v3/graphql` |
| **Indexer WebSocket** | `wss://indexer.preview.midnight.network/api/v4/graphql/ws` | `wss://indexer.preprod.midnight.network/api/v4/graphql/ws` | `ws://localhost:8088/api/v3/graphql/ws` |
| **Proof Server** | `http://localhost:6300` (Local / Wallet Provider) | `http://localhost:6300` (Local / Wallet Provider) | `http://localhost:6300` |
| **Faucet Portal** | `https://faucet.preview.midnight.network` | `https://faucet.preprod.midnight.network` | Genesis pre-funded |

### Configuration via Environment Variables

To select a public network, configure your `.env.local` (or CI environment):

```bash
# Configure active Midnight network (preview | preprod | undeployed)
NEXT_PUBLIC_MIDNIGHT_NETWORK_ID=preview

# Optional: set pre-deployed contract address
NEXT_PUBLIC_MIDNIGHT_PAYROLL_CONTRACT_ADDRESS=
```

---

## 2. Lace Wallet Setup & Network Selection

1. Install the official **Midnight Lace** browser extension in a Chromium-based browser (Brave, Chrome, Edge).
2. Open Midnight Lace and create or restore your developer test wallet.
3. **Select Network:** In Lace Settings / Network Selector, choose **Preview** (or **Preprod** to match your application configuration).
4. **Never disclose wallet credentials:** Never store seed phrases, recovery mnemonics, or private spending keys in `.env` files, Git commits, screenshots, or logs. All cryptographic authorization is performed locally inside Lace.

---

## 3. Testnet Funding & DUST Generation

Interacting with public networks requires testnet tokens for transaction balancing and gas fees.

1. In Midnight Lace, copy your **Unshielded Address** (begins with `mn_addr_...`).
   * *Note:* Do not use shielded addresses (`mn1...`) or Cardano addresses at the faucet.
2. Navigate to the official faucet:
   * **Preview:** [https://faucet.preview.midnight.network](https://faucet.preview.midnight.network)
   * **Preprod:** [https://faucet.preprod.midnight.network](https://faucet.preprod.midnight.network)
3. Paste your unshielded address, complete the verification, and click **Request tokens**.
4. Once `tNIGHT` arrives in your wallet (typically 1–2 minutes), open Midnight Lace and click **Generate tDUST** to accrue gas balance required for submitting zero-knowledge transactions.

---

## 4. Deploying the Private Payroll Contract

1. Launch the application frontend:
   ```bash
   npm run dev
   ```
2. Navigate to `http://localhost:3000`.
3. Click **Connect Midnight Lace**. Review and approve the connection request in Lace.
4. Verify that the UI displays `Network: Preview` and `Environment: Public Network`.
5. Under **Private Payroll Session**, select **Deploy New Contract**.
6. Set an initial seed salary (e.g. `5000`) for the client's local private state storage.
7. Click **Deploy Private Payroll Contract**.
8. In Midnight Lace, review the unbalanced deployment transaction and approve fee payment.
9. Wait for indexer confirmation. Once deployed, the application will display the live on-chain contract address (64-character hexadecimal or Bech32m).
10. Verify that the initial public ledger displays:
    * **Payroll Cycle:** `#0`
    * **Private Splits Recorded:** `0`
    * **Verification Count:** `0`

---

## 5. Joining an Existing Deployed Contract

To connect another browser or test session to an existing deployment:

1. Connect Midnight Lace on the same network (`preview` or `preprod`).
2. Under **Private Payroll Session**, select **Join Existing Contract**.
3. Paste the active contract address into the input field.
4. Click **Join Contract**.
5. The application will query the public indexer GraphQL endpoint and populate the latest on-chain counters.

---

## 6. Performing a Real Private Payroll Split

The private payroll split evaluates employee salary constraints in zero-knowledge and writes an anonymized cryptographic commitment hash to the blockchain:

1. In the **Record Private Payroll Split** section:
   * **Maximum Allowed Salary (Public Policy):** e.g., `10000`
   * **Private Salary (Confidential):** e.g., `7500`
2. Click **Record Private Split**.
3. **Execution Pipeline:**
   * **Witness Generation:** A cryptographically random 32-byte blinding nonce is generated locally.
   * **Zero-Knowledge Proof:** The proof client evaluates the circuit (`salary > 0` and `salary <= maxAllowedSalary`) and computes `commitment = sha256(salary, nonce)`.
   * **Lace Approval:** Lace prompts you to balance and authorize transaction submission.
   * **Ledger Update:** The transaction is broadcast to the public network.
4. **Post-Transaction Verification:**
   * The split count increments by 1 on the public ledger.
   * The returned 32-byte commitment hash is displayed.
   * The confidential private salary input is cleared and is **never** printed to logs or published on-chain.

---

## 7. Verifying Privacy Boundaries

On the public indexer (`https://indexer.preview.midnight.network/api/v4/graphql`) or block explorer:

1. **Public Parameters:** Only the `maxAllowedSalary` threshold (`10000`) appears in the transaction intent arguments.
2. **Confidentiality:** The private salary (`7500`) and blinding nonce are absent from public ledger storage and transaction blocks.
3. **Commitment Uniqueness:** Submitting the exact same split commitment again is rejected by contract circuit assertions.

---

## 8. Important Architecture Limitations

> [!IMPORTANT]
> The current Private Payroll contract is designed for **privacy-preserving payroll split verification and commitment recording**.
> It verifies compliance against salary policies in zero-knowledge and records cryptographic audit commitments on-chain.
> It **does not yet execute automated fiat or cryptocurrency token transfers** to employee accounts. Payment execution is handled via integrated settlement rails (such as Stellar / Soroban payment registry).
