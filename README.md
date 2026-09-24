# Private-Payroll

A privacy-preserving payroll dApp built on Midnight, enabling private salary compliance and payouts with zero-knowledge proofs and selective disclosure.

## Current Project Status

The repository features the complete **Midnight Private Payroll** frontend dashboard with real zero-knowledge contract verification:
- **Midnight Lace Wallet Connection:** Real browser extension connection, account resolution, and network binding (`testnet-02`).
- **Compact Smart Contract Integration:** `private-payroll.compact` compiled circuit runtime with TypeScript bindings.
- **Contract Session Orchestration:** Contract deployment and discovery (`deployPrivatePayrollContract`, `joinPrivatePayrollContract`) with client-side encrypted private state.
- **Live Zero-Knowledge Verification:** End-to-end execution of `verify_salary`:
  - Off-chain witness ingestion (`get_salary_amount`) via client-side private storage (`privateStateProvider`).
  - Strict public argument boundary (`args: [maxAllowedSalary]`).
  - Transparent transaction execution phases (`Preparing private verification` → `Generating proof` → `Waiting for wallet approval` → `Submitting transaction` → `Waiting for confirmation` → `Verification successful`).
- **Public Ledger Synchronization:** Live queries for on-chain `verification_count` via the Midnight GraphQL indexer, refreshed upon transaction finalization.
- **Privacy Model Guarantees:** Salary figures remain strictly confidential to the employee and local proof server; never logged, never posted to ledger, and shielded from public validators.
- **Next Implementation Step:** Private payroll distribution and multi-employee salary splits.
- **Legacy Implementation:** The baseline Stellar/Soroban payment workflow remains temporarily available for comparative reference and backward compatibility.

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
npm test
npm run test:midnight
```

### 4. Start Development Server
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to access the Midnight Private Payroll dashboard.
