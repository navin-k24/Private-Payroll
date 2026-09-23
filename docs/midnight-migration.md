# Midnight Migration Roadmap: Private Payroll

## Overview

- **Current Project:** Stellar/Soroban payment dApp (`simple-payment-dapp`)
- **Target Project:** Midnight Private Payroll
- **Approved Level 3 Idea:** Private Payroll / Splits

This document outlines the architectural transition from the baseline Stellar/Soroban payment application into a privacy-preserving Midnight Level 3 dApp.

---

## Migration Strategy

The existing Stellar implementation is being preserved temporarily to keep the repository buildable and testable while the new Midnight architecture is staged incrementally.

### 1. What Remains Reusable
- **Next.js 16 + React 19 App Structure:** Routing, error boundaries (`error.tsx`, `global-error.tsx`), layouts, and loading skeletons.
- **Tailwind CSS 4 Architecture:** Responsive dual-pane UI design and styling patterns.
- **Real-Time Streaming (`app/api/stream/route.ts`):** Server-Sent Events (SSE) pipeline for live on-chain status tracking.
- **CI/CD Pipelines (`.github/workflows/`):** Automated build verification and Vercel production deployment workflows.
- **Public Assets & Configuration:** PostCSS, TypeScript config, and core UI assets.

### 2. What Will Eventually Be Replaced
- **Smart Contracts:** The Soroban Rust contracts (`soroban/src/lib.rs` and `soroban/payment-registry/`) will be replaced by a Midnight **Compact** smart contract (`contract/contracts/payroll.compact`).
- **Wallet Connection:** `@stellar/freighter-api` will be replaced by Midnight Lace / DApp Connector APIs.
- **Ledger Client:** `@stellar/stellar-sdk` and Soroban RPC interactions will be replaced by the Midnight SDK (`@midnight-ntwrk/midnight-js-contracts`, indexer query clients, and proof generation providers).
- **Domain Logic:** Public single-payment validation will be upgraded to private payroll splitting, cryptographic commitments, and zero-knowledge proof verification.

---

## Intended Midnight Architecture

```
Private-Payroll/
├── contract/
│   ├── contracts/          # Midnight Compact smart contracts (e.g., payroll.compact)
│   ├── compiled/           # Compiled zk-SNARK circuits, keys, and TypeScript bindings
│   └── tests/              # Contract-level Compact tests
├── lib/
│   ├── midnight/           # Midnight network, wallet, provider, and session wrappers
│   │   ├── wallet.ts       # Lace wallet discovery and interaction
│   │   ├── providers.ts    # Indexer, prover, and node client providers
│   │   ├── contract.ts     # Compact contract interface and witness handlers
│   │   └── session.ts      # Private session state & viewing key management
│   ├── payroll/            # Private payroll domain models, salary splits, commitments
│   └── payment-*           # Legacy Stellar modules (preserved temporarily)
├── tests/                  # Application and integration test suites
└── docs/                   # Level 3 documentation, privacy model, proposal
```

---

## Temporary Preservation Status

All existing Stellar/Soroban modules, tests, and configurations remain untouched during this scaffolding step to ensure ongoing build stability and zero disruption to the baseline pipeline. Subsequent steps will introduce the Compact contract, Midnight SDK bindings, and updated UI workflows.

---

## Selected Midnight Development Stack & Toolchain

### 1. Selected Stack & Versions
- **Compact Toolchain:** `compact` CLI pinned to compiler version `0.26.0` (specified via `.compact-version` and `contract/.compact-version`).
- **Compact Runtime:** `@midnight-ntwrk/compact-runtime` (`^0.19.0`)
- **MidnightJS Contracts SDK:** `@midnight-ntwrk/midnight-js-contracts` (`^4.1.1`)
- **Midnight DApp Connector API:** `@midnight-ntwrk/dapp-connector-api` (`^4.0.1`)
- **Midnight Ledger Engine:** `@midnight-ntwrk/ledger` (`^4.0.0`)

### 2. Selection Rationale & Target Network
- **Target Network:** Midnight Testnet (`Testnet-02` / public Testnet).
- **Toolchain Alignment:** Version `0.26.0` of the Compact compiler matches the stable on-chain runtime (`v4.0.0-rc.3` / `compact-runtime 0.19.0`) deployed to Midnight Testnet. Higher preview versions (such as `0.27.x`) are designated for developer preview networks and introduce ledger breaking changes incompatible with Testnet-02.
- **Client & Prover Compatibility:** MidnightJS `4.1.x` and DApp Connector `4.0.x` represent the stable official release branch for client-side proving and Lace wallet communications on Testnet without unstable alpha/beta breaking changes.

### 3. Dependency Inventory
- **Added Midnight Dependencies:**
  - `@midnight-ntwrk/compact-runtime@^0.19.0`: Executes zero-knowledge circuits and witnesses compiled from `.compact` smart contracts.
  - `@midnight-ntwrk/midnight-js-contracts@^4.1.1`: Provides contract deployment, interaction pipeline, and state synchronization.
  - `@midnight-ntwrk/dapp-connector-api@^4.0.1`: Exposes Lace browser wallet integration types and window provider hooks.
  - `@midnight-ntwrk/ledger@^4.0.0`: Core ledger cryptographic models and balance commitment structures.
- **Intentionally Retained Stellar Dependencies:**
  - `@stellar/stellar-sdk@^16.2.0`: Retained temporarily so that the working Stellar payment engine and transaction builder remain functional during the migration phase.
  - `@stellar/freighter-api@^6.0.1`: Retained temporarily to keep legacy wallet connect flows intact until Midnight Lace wallet flows are wired up.

---

## MidnightJS Contract Integration

### 1. Where the Compiled Contract Lives
The Compact compiler (`compactc 0.31.1`) processes `contract/contracts/private-payroll.compact` and generates the runtime artifacts in:
- `contract/compiled/contract/index.js`: Compiled JavaScript runtime implementing the circuit handlers, state transitions, and witness injection logic.
- `contract/compiled/contract/index.d.ts`: TypeScript typings defining `Contract`, `Ledger`, `Witnesses`, `Circuits`, and `pureCircuits`.
- `contract/compiled/zkir/verify_salary.zkir`: Zero-Knowledge Intermediate Representation of the `verify_salary` circuit for proving key generation.
- `contract/compiled/compiler/contract-info.json`: Build metadata and contract hashes.

### 2. How the Application Imports It
- `contract/index.ts` re-exports the compiled contract exports directly:
  ```ts
  export * from "./compiled/contract/index.js";
  ```
- The application integration layer (`lib/midnight/contract.ts`) consumes these compiled definitions directly, avoiding manual recreation of contract types.

### 3. Responsibilities of `lib/midnight/contract.ts`
- **Application-Facing Contract Typing:** Binds `Contract<PayrollPrivateState, PayrollWitnesses>` into strongly typed aliases (`PrivatePayrollContract`, `PayrollWitnesses`, `PayrollCircuits`, `PayrollLedger`).
- **Witness Implementation:** `createPayrollWitnesses(salaryAmount)` feeds the private salary value into the off-chain witness provider without exposing it to public ledger storage.
- **Factory Helpers:** Provides `createPayrollContract()` and `getPayrollLedgerState()` to cleanly construct and inspect the contract in application components.
- **MidnightJS Compatibility:** Exports `DeployedPayrollContract` (bound to `@midnight-ntwrk/midnight-js-contracts`) for future on-chain deployment and transaction pipelines.

### 4. What is Still Missing Before Live Wallet/Network Usage
- **Prover & Indexer Providers:** Configuration of remote or local Midnight proof server (`http://localhost:6300`) and indexer endpoints.
- **On-Chain Deployment / Address Binding:** Deploying the compiled contract to Midnight Testnet or resolving an existing deployed contract address.
- **Frontend Action Binding:** Replacing the legacy Stellar payment form with the Private Payroll console and proof status indicators.

---

## Midnight Lace Wallet Integration

### 1. How the Wallet is Detected
- The browser extension injects its metadata into `window.midnight` upon initialization.
- The wallet adapter (`lib/midnight/wallet.ts`) inspects `window.midnight` for known keys (`mnLace`, `lace`) or queries registered entries matching RDNS (`io.midnight.lace`) adhering to the `@midnight-ntwrk/dapp-connector-api` specification.
- If no extension is present, `isMidnightWalletAvailable()` returns `false`, allowing the UI to present installation guidance rather than throwing an unhandled exception.

### 2. How Connection Works
- The application initiates connection via `connectMidnightWallet({ networkId })`.
- This calls the standard `initialAPI.connect(networkId)` method (where `networkId` defaults to `testnet-02`), prompting the user inside Midnight Lace to review and authorize the connection.
- If rejected by the user, the connector throws a `DAppConnectorAPIError` with code `Rejected`, which is cleanly intercepted and mapped to a polite rejection alert without altering application connection state.
- Upon authorization, Lace returns a typed `ConnectedAPI` session instance.

### 3. What Information the dApp Receives
- **Shielded Address:** Bech32m-formatted address used for private interactions and balance commitments.
- **Shielded Public Keys:** Coin public key and encryption public key for proof outputs and shielded transactions.
- **Unshielded Address:** Public Bech32m address for unshielded token operations.
- **Dust Address:** Dedicated Dust balance address.
- **InitialAPI Metadata:** Wallet display name, icon URI, and connector API version.

### 4. What Remains Local and Private
- **Private Keys & Seed Phrases:** Never leave the browser extension sandbox.
- **Private Payroll State:** Employee salary amounts and split ratios are held in `PayrollPrivateState` and only accessed locally by witness providers during proof generation.
- **Circuit Transcripts:** Raw witness evaluation occurs off-chain; zero-knowledge proofs verify invariants without disclosing private numbers.

### 5. What is Still Not Implemented
- **Transaction Balancing & Proving:** Full balancing through `connectedAPI.balanceTx()` and client-side proof generation with local prover / prover server.
- **Live Contract Invocation:** Submitting verified transactions via MidnightJS `submitCallTx`.
- **Replacing Legacy UI:** The legacy Stellar payment console remains intact and operational until the full Private Payroll UI workflow is connected.



