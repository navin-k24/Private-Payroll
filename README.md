# Private-Payroll

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
npm test              # Application and integration tests (70 tests)
npm run test:midnight # Compact contract-level tests (10 tests)
npm run test:contracts# Preserved Soroban contract tests (6 tests)
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
