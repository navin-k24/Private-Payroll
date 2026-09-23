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
