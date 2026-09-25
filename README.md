# Private-Payroll

[![CI](https://github.com/navin-k24/Private-Payroll/actions/workflows/ci.yml/badge.svg)](https://github.com/navin-k24/Private-Payroll/actions/workflows/ci.yml)

A privacy-preserving payroll and splits dApp built on Midnight, enabling confidential employee compensation compliance and private split commitments with zero-knowledge proofs and selective disclosure.

## Current Project Status: Private Payroll / Splits

The repository implements the approved **Private Payroll / Splits** architecture, supporting multiple private payroll split records while exposing only the minimal public state required for auditability:

- **Compact Smart Contract (`private-payroll.compact`):**
  - Compiled with Compact compiler `0.31.1` targeting the Midnight Testnet runtime.
  - **Ledger State:**
    - `split_count`: Counter tracking total registered private payroll split commitments.
    - `payroll_cycle`: Counter tracking active payroll distribution periods.
    - `split_commitments`: Cryptographic `Set<Bytes<32>>` storing anonymized commitment hashes and preventing double-splits.
    - `verification_count`: Counter tracking general policy compliance checks.
  - **Circuits:**
    - `record_private_split(max_allowed_salary)`: Primary product feature. Asserts `0 < salary <= max_allowed_salary`, computes `persistentHash<PrivatePayrollSplit>(split)`, enforces that commitment is not already present, inserts it into `split_commitments`, increments `split_count`, and returns the 32-byte commitment hash.
    - `verify_salary(max_allowed_salary)`: Compliance verification circuit (backward-compatible).
    - `advance_payroll_cycle()`: Increments the payroll cycle counter.
  - **Witness Ingestion:**
    - `get_salary_amount()`: Ingests confidential employee compensation off-chain.
    - `get_split_nonce()`: Ingests a unique 32-byte blinding salt to guarantee commitment indistinguishability.

- **Frontend Dashboard (`components/private-payroll-dashboard.tsx`):**
  - **Dual Distinct Actions:**
    - **Record Private Payroll Split (Primary Product Action):** Computes local zk-SNARK proof and registers commitment hash on-chain, updating `split_count`.
    - **Private Salary Verification:** Single-party zero-knowledge compliance verification against ceiling.
  - **Public Information Cards:**
    - **Payroll Cycle:** Active distribution cycle (`#1`, `#2`, etc.).
    - **Private Splits Recorded:** Total on-chain commitment count.
    - **Salary Policy Ceiling:** Public threshold checked by zk-circuits (`≤ 10000`).
    - **Verification Count:** Number of compliance checks completed.
  - **Real-Time Execution Phases:** Transparently visualizes progress from local witness preparation through local proving, wallet authorization, network broadcast, and indexer confirmation.

- **Public vs. Private Observer Visibility:**
  - **Public (On-Chain):**
    - Split counter & payroll cycle counter
    - 32-byte cryptographic split commitments in `split_commitments` set
    - Total verification count
    - Public salary policy ceiling threshold argument
    - Contract address and circuit verifier keys
  - **Private (Confidential Off-Chain):**
    - Raw employee salary figures and individual split amounts
    - 32-byte random blinding nonces
    - Prover witness evaluations and private state
    - Encrypted local client storage

- **Current Limitation / Roadmap:**
  - On-chain token balance settlement and automated payouts are not yet automated on-chain. Current functionality provides cryptographically binding compliance verification, split commitment registry, duplicate prevention, and cycle tracking.

- **Legacy Implementation:**
  - The baseline Stellar/Soroban payment workflow remains preserved for comparative reference and backward compatibility.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Compile Compact Contract
```bash
npm run contract:compile
```

### 3. Run Test Suite
```bash
npm test                          # Full default test suite (70 tests: application, dashboard, wallet, session, contract)
npm run test:midnight             # Compact contract-level tests (10 tests)
npm run test:midnight:integration # Real Midnight integration test suite (7 scenarios)
npm run test:contracts            # Preserved Soroban contract tests (6 tests)
```

### 4. Build and Lint
```bash
npm run lint
npm run build
```

### 5. Start Development Server
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to access the Midnight Private Payroll / Splits dashboard.

---

## Automated Midnight Testing

The repository provides multi-tiered automated testing across unit, contract, and end-to-end integration layers:

### 1. Test Architecture & Separation
- **Default Fast Test Suite (`npm test`):**
  - Executes **70 tests** across application models, frontend dashboard components, Midnight Lace wallet connectors, MidnightJS provider bridging, contract session flows, and Compact contract assertions.
  - Runs in ~3 seconds using Node's native test runner (`node --test`).
  - Completely self-contained: does NOT require Docker or external blockchain services.
  - Test inventory:
    - `tests/*.test.mjs`: 45 application, wallet, provider, and session tests.
    - `contract/tests/private-payroll.test.mjs`: 10 Compact circuit tests.
    - `lib/*.test.mjs`: 15 preserved payment contract & dashboard tests.
- **Midnight Integration Test Suite (`npm run test:midnight:integration`):**
  - Executes the real Midnight Compact contract runtime (`contract/compiled/contract/index.js`), real Ledger state (`@midnight-ntwrk/ledger`), real witness injection, and client-side LevelDB encrypted private state storage (`levelPrivateStateProvider`).
  - Connects to local devnet endpoints when available, or runs through the standalone contract runtime engine.
  - Automatically manages lifecycle cleanup of LevelDB temporary databases.
  - When `MIDNIGHT_DEVNET_REQUIRED=true` is set (e.g. in CI), the suite strictly fails if the devnet services are unreachable.

### 2. Integration Scenarios Covered
1. **Contract Initialization:** Verifies `verification_count: 0`, `split_count: 0`, `payroll_cycle: 0`, and empty `split_commitments` set upon deployment.
2. **Real Private Salary Verification:** Executes `verify_salary(10000)` with private salary `7500`, asserting that `verification_count` increments to 1, while the raw salary remains completely absent from public transaction arguments and public ledger state.
3. **Real Private Payroll Split:** Executes `record_private_split(10000)` with private salary and 32-byte secret salt, registering a 32-byte cryptographic commitment on-chain and incrementing `split_count`.
4. **Duplicate Commitment Rejection:** Proves double-split protection. Submitting an identical split commitment is rejected by the contract (`Duplicate payroll split: commitment already recorded`) and preserves ledger state invariance.
5. **Zero Salary Circuit Rejection:** Asserts that non-positive salaries (`salary = 0`) trigger circuit assertion failure (`Salary amount must be strictly greater than zero`) with zero counter mutation.
6. **Salary-Above-Ceiling Rejection:** Asserts that compensation exceeding the policy threshold (`salary > maxAllowedSalary`) is rejected by the circuit without incrementing counters.
7. **Payroll Cycle Advancement:** Executes `advance_payroll_cycle()`, proving that `payroll_cycle` increments from 0 to 1 while retaining prior split commitments and historical counters.

### 3. Local DevNet Orchestration (Docker)
The local devnet stack uses official Midnight container images (`docker/standalone.yml`):
- `midnight-node` (`midnightntwrk/midnight-node:0.20.0`): Local Substrate consensus node on port `9944`.
- `indexer` (`midnightntwrk/indexer-standalone:3.0.0`): Standalone GraphQL & WebSocket indexer on port `8088`.
- `proof-server` (`midnightntwrk/proof-server:8.0.3`): Prover service for zero-knowledge transaction synthesis on port `6300`.

**DevNet Management Commands:**
```bash
# Start local Midnight devnet services
npm run test:midnight:integration:up

# Run the integration test suite
npm run test:midnight:integration

# Stop and tear down devnet containers and storage volumes
npm run test:midnight:integration:down
```

### 4. Continuous Integration & Quality Pipeline (GitHub Actions)
The repository CI workflow (`.github/workflows/ci.yml`) runs on every push and pull request across two dedicated parallel jobs:

1. **Verify & Build Job (`verify`):**
   - **Environment:** Ubuntu with Node.js 22 and Rust stable toolchain.
   - **Toolchain Alignment:** Automatically installs and pins Compact compiler `0.31.1`.
   - **Quality Gates:**
     1. Compact contract compilation (`npm run contract:compile`)
     2. Full default unit & contract test suite (`npm test`, 70 tests)
     3. Dedicated Compact contract tests (`npm run test:midnight`, 10 tests)
     4. Preserved Soroban contract tests (`npm run test:contracts`, 6 tests)
     5. ESLint validation (`npm run lint`, 0 warnings, 0 errors)
     6. Next.js production build (`npm run build`)
2. **Midnight Integration Job (`integration`):**
   - Automatically provisions local devnet containers (`midnight-node`, `indexer`, `proof-server`) via `npm run test:midnight:integration:up`.
   - Executes `npm run test:midnight:integration` with `MIDNIGHT_DEVNET_REQUIRED=true`.
   - Honest assertion: if devnet services fail to initialize or are unreachable, the job fails immediately.
   - On failure: captures and uploads `docker compose logs` as an artifact.
   - Always tears down devnet containers upon completion.

