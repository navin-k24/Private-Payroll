# Private-Payroll

A privacy-preserving payroll dApp built on Midnight, enabling private salary splits with zero-knowledge proofs and selective disclosure.

## Current Project Status

The repository features the **Midnight Private Payroll** frontend dashboard, integrating:
- **Midnight Lace Wallet Connection:** Real browser extension connection, account resolution, and network binding (`testnet-02`).
- **Compact Smart Contract Integration:** `private-payroll.compact` compiled circuit runtime with TypeScript bindings.
- **Contract Session Orchestration:** Contract deployment and discovery (`deployPrivatePayrollContract`, `joinPrivatePayrollContract`) with client-side encrypted private state.
- **Public Ledger Synchronization:** Live queries for on-chain `verification_count` via the Midnight GraphQL indexer.
- **Privacy Model Interface:** Clear boundary separation between public parameters and confidential employee salary figures.
- **Next Implementation Step:** Wiring and enabling live zero-knowledge circuit execution (`verify_salary`) through `submitVerifySalaryCall()`. Full payroll payments and distribution will follow after contract call completion.
- **Legacy Implementation:** The baseline Stellar/Soroban payment workflow remains temporarily available for comparative reference and backward compatibility.
