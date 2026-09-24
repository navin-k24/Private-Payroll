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
- **Live Contract Invocation:** Submitting verified transactions via MidnightJS `submitCallTx` or `deployContract`.
- **Replacing Legacy UI:** The legacy Stellar payment console remains intact and operational until the full Private Payroll UI workflow is connected.

---

## MidnightJS Provider Architecture

The MidnightJS provider stack (`lib/midnight/providers.ts` and `lib/midnight/session.ts`) provides the complete runtime foundation needed for transaction synthesis, zero-knowledge proof generation, client-side encryption, and ledger synchronization.

```
+-------------------------------------------------------------------------+
|                       Private Payroll Session                           |
|                       (lib/midnight/session.ts)                         |
+-------------------------------------------------------------------------+
                                     |
               +---------------------+---------------------+
               |                                           |
               v                                           v
+-------------------------------+             +---------------------------+
|      Client-Side Privacy      |             |     Lace Wallet Bridge    |
+-------------------------------+             +---------------------------+
| 1. privateStateProvider       |             | 5. walletProvider         |
|    - LevelDB local storage    |             |    - balanceUnsealedTx    |
|    - AES-256 encrypted        |             |    - Coin/Enc public keys |
|    - Holds salary amounts     |             | 6. midnightProvider       |
| 2. zkConfigProvider           |             |    - submitTransaction    |
|    - Loads verify_salary.zkir |             |    - Relays to network    |
| 3. proofProvider              |             +---------------------------+
|    - HTTP proof server client |                          |
|    - Synthesizes ZK proof     |                          v
+-------------------------------+             +---------------------------+
               |                              |    Network Infrastructure |
               +----------------------------->| 4. publicDataProvider     |
                                              |    - Apollo GraphQL indexer|
                                              |    - WebSocket state feed |
                                              +---------------------------+
```

### 1. Purpose of Each Provider
1. **`privateStateProvider` (`levelPrivateStateProvider`):** Manages local, client-side encrypted storage for contract private states (such as private salary amounts and commitments). Stores data under account-scoped LevelDB namespaces without transmitting plaintext sensitive data over the network.
2. **`publicDataProvider` (`indexerPublicDataProvider`):** Connects to the Midnight GraphQL indexer and WebSocket subscription feeds to query contract deployment state, observe on-chain state updates, and track block heights and transaction confirmations.
3. **`zkConfigProvider` (`FetchZkConfigProvider`):** Resolves zero-knowledge circuit artifacts—including the intermediate representation (`verify_salary.zkir`), prover keys, and verifier keys generated during Compact contract compilation.
4. **`proofProvider` (`httpClientProofProvider`):** Communicates with the Midnight proof server (local or remote daemon) over HTTP to generate zero-knowledge Halo2 proofs for unproven transactions, verifying contract circuit constraints off-chain.
5. **`walletProvider` (`createWalletProvider`):** Bridges the Midnight Lace `ConnectedAPI` to the MidnightJS `WalletProvider` interface. Supplies shielded coin and encryption public keys and delegates transaction fee balancing to `connectedAPI.balanceUnsealedTransaction`.
6. **`midnightProvider` (`createMidnightProvider`):** Isolates transaction submission logic, relaying finalized, balanced transactions to the Midnight network via `connectedAPI.submitTransaction` and resolving the transaction identifier.

### 2. Privacy Boundaries: Private vs. Public Data
- **Private Data (Stays Strictly Client-Side):**
  - Employee salary figures and confidential split ratios.
  - Private storage encryption keys and passwords.
  - Witness inputs and intermediate witness values during circuit execution.
  - Unproven transaction payloads containing raw shielded coin information.
- **Public Data (Retrieved from Indexer Layer):**
  - Contract deployment transaction records and public contract addresses.
  - On-chain public ledger counters (`verification_count`).
  - Unshielded balances, transaction statuses, and block inclusion receipts.
  - Zswap public ledger events and state hashes.

### 3. ZK Artifacts and Proving Architecture
- **Artifact Location:** Compiled artifacts are generated by the Compact toolchain (`contract/compile.mjs`) into `contract/compiled/zkir/verify_salary.zkir` and companion contract metadata in `contract/compiled/compiler/contract-info.json`.
- **Artifact Retrieval:** In web applications, `FetchZkConfigProvider` retrieves `.zkir`, `.prover`, and `.verifier` artifacts from the application's `/zk` static endpoint or configured base URL on demand.
- **Proof Generation:** Proof synthesis occurs off-chain via the HTTP proof server client (`httpClientProofProvider`). Private witness values are consumed in memory by the prover to generate cryptographic zero-knowledge proofs. The resulting proof is included in the transaction without revealing the underlying salary numbers.

### 4. Wallet Provider Bridging with Midnight Lace
- The wallet bridge delegates balancing to `connectedAPI.balanceUnsealedTransaction(txHex, { payFees: true })`.
- Cryptographic keys (`getCoinPublicKey()` and `getEncryptionPublicKey()`) are resolved synchronously from the shielded address bundle returned upon connecting to Lace.
- Transaction submission is cleanly decoupled into `midnightProvider.submitTx()`, invoking `connectedAPI.submitTransaction(txHex)`.

### 5. Provider Lifecycle and Cleanup Guarantees
- **No Side-Effects on Import:** Importing `lib/midnight/providers.ts` or `lib/midnight/session.ts` does not initiate network connections, open sockets, or create background workers.
- **Controlled Error Handling:** Provider instantiation validates required indexer and proof-server configurations, throwing explicit, actionable errors if endpoints are missing.
- **Automated Rollback & Cleanup:** If initialization fails midway through assembly, all previously opened resources are terminated via registered cleanup hooks before re-throwing the primary error.
- **Disposal Hook:** The constructed `PayrollProviders` bundle exposes a `dispose()` function, allowing the UI and session lifecycle managers to cleanly release subscriptions and network resources on disconnect or unmount.

---

## Midnight Contract Deployment and Session

The contract session layer (`lib/midnight/payroll-session.ts`, re-exported via `lib/midnight/session.ts`) provides application-level orchestrators for deploying, discovering, querying, and invoking the compiled `private-payroll.compact` contract on the Midnight network.

```
+-------------------------------------------------------------------------------------------------+
|                                    PayrollContractSession                                       |
+-------------------------------------------------------------------------------------------------+
|  contractAddress   : string (64-character hex or Bech32m Midnight contract address)            |
|  deployedContract  : DeployedContract<PrivatePayrollContract> | FoundContract<PrivatePayrollContract> |
|  providers         : PayrollProviders (bundle of 6 MidnightJS provider abstractions)            |
|  privateStateId    : string (client-side LevelDB namespace)                                     |
|  queryLedger()     : () => Promise<PayrollLedger> (returns on-chain verification_count)         |
|  verifySalary()    : (maxAllowedSalary: bigint) => Promise<FinalizedCallTxData>                 |
|  dispose()         : () => Promise<void> (cleans up subscriptions and provider resources)       |
+-------------------------------------------------------------------------------------------------+
```

### 1. Contract Deployment (`deployPrivatePayrollContract`)
- **Explicit Execution Only:** Deployment never runs automatically during application startup or module evaluation. It executes strictly upon user initiation.
- **Contract Compilation Asset Binding:** Utilizes `CompiledContract.withWitnesses` and `CompiledContract.withCompiledFileAssets` to bundle compiled Compact artifacts and witnesses without requiring external asset paths at runtime.
- **Private State Seeding:** The deployer's initial private salary is committed directly into the client-side `privateStateProvider` under the designated `privateStateId`. The raw salary value is never exposed on the public ledger or sent in cleartext over the network.
- **Resource Cleanup on Failure:** If deployment fails (e.g., node rejection or network disruption), any temporary providers spawned for the operation are automatically released via `providers.dispose()`.

### 2. Joining an Existing Deployed Contract (`joinPrivatePayrollContract`)
- **Address Validation:** Enforces strict validation via `isValidContractAddress()`, verifying 64-character hexadecimal or standard Midnight Bech32m address formats (`contract_...` or `mn1...`) while explicitly rejecting empty strings, placeholders, and truncated input.
- **On-Chain Discovery:** Locates the contract on the Midnight blockchain using `findDeployedContract()` via the indexer's public data provider.
- **Circuit Verification Key Matching:** Validates that the on-chain contract verifier keys match local compiled artifacts for the `verify_salary` circuit, safeguarding against contract version mismatches.
- **Session Construction:** Binds the discovered contract to the active provider stack and returns a fully initialized `PayrollContractSession`.

### 3. Deployed Contract Address Resolution
- **Environment Configuration:** Configurable at build/runtime through `NEXT_PUBLIC_MIDNIGHT_PAYROLL_CONTRACT_ADDRESS` (available via `CONFIGURED_PAYROLL_CONTRACT_ADDRESS`).
- **Dynamic User Input:** Users can input or paste any valid deployed Midnight contract address directly into the dApp console.
- **No Hardcoded Values:** No fixed production address is hardcoded into application source files; fallback is an empty string requiring deployment or explicit entry.

### 4. Public Ledger State Queries (`queryPayrollLedgerState`)
- **Direct Indexer Query:** Fetches on-chain public state through `publicDataProvider.queryContractState(contractAddress)`.
- **Typed Ledger Representation:** Safely parses contract state data using `safeGetPayrollLedger()`, returning `{ verification_count: bigint }`.
- **Zero Privacy Leakage:** The public ledger exclusively records the scalar `verification_count`. No private salary amounts, recipient identifiers, or balance commitments are exposed on-chain.

### 5. Witness and Circuit Invocation (`submitVerifySalaryCall`)
- **Witness Isolation:** The private salary is provided off-chain via `createPayrollWitnesses(salaryAmount)` and stored in the encrypted local `privateStateProvider`.
- **Public Argument Boundary:** The `verify_salary` circuit invocation takes ONLY `maxAllowedSalary` as a public on-chain argument (`args: [maxAllowedSalary]`).
- **Cryptographic Assurance:** The circuit verifies that `0 < salary <= maxAllowedSalary` inside a zero-knowledge proof. The validator verifies the proof and increments `verification_count` without ever learning the actual salary amount.

### 6. Current Implementation Status & Next Steps
- **Working Now:**
  - `private-payroll.compact` contract compilation with Compact toolchain.
  - TypeScript types and witness handlers for contract interaction.
  - Midnight Lace wallet adapter and provider bridging.
  - Contract deployment (`deployPrivatePayrollContract`) and join (`joinPrivatePayrollContract`) workflows.
  - Public ledger state reader (`queryPayrollLedgerState`) and verification counter tracking.
  - End-to-end zero-knowledge circuit call execution (`verify_salary`) through `submitVerifySalaryCall` and `session.verifySalary()`.
  - Application frontend dashboard (`components/private-payroll-dashboard.tsx`) integrated as the primary experience in `app/page.tsx`.
  - Privacy boundary enforcement: private salary passed solely via witness and local encrypted state; `maxAllowedSalary` is the sole public transaction argument.
  - Comprehensive unit test coverage for wallet, providers, contract, payroll session, frontend dashboard, and private verification pipeline.
- **Next Steps:**
  - Implement full payroll distribution and private salary splits.
  - Employee address registry and multi-recipient payouts.

---

## Midnight Private Payroll Frontend Flow

The Midnight Private Payroll frontend (`components/private-payroll-dashboard.tsx` mounted in `app/page.tsx`) implements a seamless 5-stage lifecycle:

```
[1. Wallet Connection] ──> [2. Provider/Session] ──> [3. Deploy or Join] ──> [4. Public Ledger Query] ──> [5. Private Verification Execution]
    (Midnight Lace)             (6 Abstractions)        (Compact Contract)          (verification_count)          (verify_salary Circuit)
```

### 1. Wallet Connection
- **User Action:** User clicks "Connect Midnight Lace".
- **Execution:** Connects via `connectMidnightWallet()` to the official DApp Connector API (`testnet-02`), resolving the user's shielded address (`addresses.shieldedAddress`), shielded public keys, unshielded address, and dust address.
- **UI State:** Renders the abbreviated shielded address, active network identifier (`testnet-02`), and exposes disconnect / account switching actions.

### 2. Provider & Session Layer Binding
- **Lifecycle:** On successful wallet connection, the returned `ConnectedAPI` is held ready for contract operations.
- **No Early Overhead:** MidnightJS providers (LevelDB encrypted private storage, indexer client, ZK config provider, HTTP proof server client) are only constructed on explicit deployment or joining.
- **Cleanup Management:** Active sessions are tracked in a React ref and explicitly disposed via `session.dispose()` when switching contracts or unmounting.

### 3. Contract Deployment or Discovery
- **Join Existing Mode:** User inputs a 64-character hexadecimal or Bech32m address (`contract_...`). Address validation (`validateContractAddressInput`) validates format and rejects placeholders before invoking `joinPrivatePayrollContract()`. Circuit verification keys are validated against local compiled artifacts.
- **Deploy New Mode:** User enters an optional initial salary amount to seed local private storage and clicks "Deploy Private Payroll Contract". Calls `deployPrivatePayrollContract()`, committing the initial private state and resolving the new contract address.
- **Feedback:** Displays progress indicators ("Joining Contract...", "Deploying Contract...") and maps errors into human-readable messages via `mapPayrollSessionError()`.

### 4. Public Ledger Query
- **Automatic Polling:** Once a contract session is established, `session.queryLedger()` queries the GraphQL indexer for `verification_count`.
- **Public Counter Display:** Displays the total count of verified payroll assertions committed to the Midnight blockchain.
- **Manual Refresh:** Users can trigger on-demand indexer synchronization via the "Refresh" button.
- **Zero Privacy Leakage:** Demonstrates that the public ledger reveals only the verification tally, completely shielding individual compensation figures.

### 5. Private Verification Execution (Live in Step 10)
- **Interface Structure:**
  - `maxAllowedSalary`: Public threshold argument posted on-chain.
  - `privateSalary`: Confidential employee salary amount provided strictly via the local witness mechanism (protected by `type="password"` input).
- **Execution Phases:**
  1. `Preparing private verification`: Ingests private salary into local private state provider.
  2. `Generating proof`: Local proof-server constructs zero-knowledge proof for `verify_salary`.
  3. `Waiting for wallet approval`: Prompts user approval in Midnight Lace wallet.
  4. `Submitting transaction`: Broadcasts verified transaction to Midnight consensus nodes.
  5. `Waiting for confirmation`: Waits for block finalization and indexer transaction inclusion.
  6. `Verification successful`: Displays confirmed on-chain transaction ID, clears the private salary input field, and automatically refreshes `verification_count` from the public ledger.
- **Error Mapping:** Clean error messages for invalid salary (`salary <= 0`), exceeded ceiling (`salary > maxAllowedSalary`), wallet rejection, or unreachable network endpoints without leaking sensitive numbers or stack traces.

---

## Step 11: Private Payroll / Splits Evolution

### 1. Architectural Upgrade
To fulfill the approved **Level 3 idea ("Private Payroll / Splits")**, the contract and session layer evolved from a single compliance verifier into a multi-record confidential payroll split application:

1. **Commitment Set & Duplicate Prevention:**
   The Compact contract introduces `split_commitments: Set<Bytes<32>>`. When `record_private_split` is called:
   - A struct `PrivatePayrollSplit { salary: Uint<64>, nonce: Bytes<32> }` is hashed via `persistentHash<PrivatePayrollSplit>(split)`.
   - The contract asserts `!split_commitments.member(commitment)`, preventing duplicate payouts or split re-submissions.
   - The commitment is inserted into `split_commitments`.
2. **Multi-Record Split Counter & Cycle Tracking:**
   - `split_count`: Counter incremented upon each registered split.
   - `payroll_cycle`: Counter tracking active distribution cycles.
3. **Blinding Nonces & Witness Privacy:**
   - The witness `get_split_nonce()` generates/ingests a cryptographically secure 32-byte salt.
   - Nonce + salary ensures distinct commitments even if two employees receive identical salaries.
   - Public circuit arguments consist solely of `max_allowed_salary: Uint<64>`. Raw salaries and blinding nonces are never submitted on-chain or published in block data.

### 2. Public vs. Private Visibility Matrix
| Data Item | Observer Visibility | Storage Location |
| :--- | :--- | :--- |
| **Split Count** | Public | Midnight Blockchain Ledger |
| **Payroll Cycle** | Public | Midnight Blockchain Ledger |
| **Split Commitments (`Set<Bytes<32>>`)** | Public | Midnight Blockchain Ledger |
| **Verification Count** | Public | Midnight Blockchain Ledger |
| **Salary Policy Ceiling** | Public | Transaction Argument / Ledger Rule |
| **Contract Address & Verifier Keys** | Public | Midnight Network State |
| **Employee Split Figures** | **Private / Shielded** | Off-Chain Prover Witness Only |
| **Blinding Salt / Nonce** | **Private / Shielded** | Client-Side Private Storage (`privateStateProvider`) |
| **Proof Intermediate Wires** | **Private / Shielded** | Local ZK Proof Engine |

### 3. Current Limitation
On-chain automated token balance transfers are not yet automated on-chain. Current implementation provides end-to-end cryptographic payroll split validation, duplicate prevention, on-chain commitment registration, and cycle tracking. Direct token transfer integrations are slated for upcoming milestones.








