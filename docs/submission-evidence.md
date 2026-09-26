# Level 3 Submission Evidence Checklist

This document tracks all required Level 3 evidence artifacts for **Midnight Private Payroll**. Items are marked complete strictly where concrete verification artifacts exist within the repository.

---

## Evidence Inventory

| Requirement | Status | Evidence Location / Verification |
|---|---|---|
| **3+ Passing Tests Evidence** | [x] Complete | 77 passing tests in default test suite (`npm test`). Evidence logged in terminal runs and test runner output. Screenshot available at `docs/screenshots/tests-passing.png`. |
| **GitHub Actions CI Passing** | [x] Complete | CI workflow defined at `.github/workflows/ci.yml`. Badge in README. Screenshot of successful run at `docs/screenshots/github-actions.png`. |
| **Live dApp Screenshot** | [x] Complete | Deployed dashboard connected to Midnight Preview testnet. Screenshot at `docs/screenshots/midnight-contract-deployed.png`. |
| **Private Payroll Split Success** | [x] Complete | On-chain execution of `record_private_split` circuit on Preview testnet. Screenshot at `docs/screenshots/midnight-split-success.png`. |
| **Public Counter Updates** | [x] Complete | `split_count: 1`, `verification_count: 1`, `payroll_cycle: #0` displayed on public dashboard cards. Screenshot at `docs/screenshots/midnight-split-success.png`. |
| **Privacy Boundary Evidence** | [x] Complete | Cryptographic boundary audited and documented in `docs/public-deployment-evidence.md`. Public ledger receives only 256-bit commitment hashes; raw salaries never leave the client witness. |
| **Public Deployment Evidence** | [x] Complete | Verified Preview contract address `e8c98d59b66ba8986e403eb32a14fbd491515f5f5f01108ca9265d15940e0469`. Detailed audit in `docs/public-deployment-evidence.md`. |
| **1-Minute Demo Video** | [ ] Pending Recording | Demo script prepared in `docs/demo-script.md`. Video recording to be completed by user prior to final submission. |
| **Vercel Public Production URL** | [ ] Optional / Self-Hosted | Production build tested and verified locally (`npm run build`). Vercel deployment URL to be linked once deployed to user's Vercel team account. |

---

## Verification Artifact Details

### 1. Test Suite Verification
```text
# tests 77
# suites 0
# pass 77
# fail 0
# cancelled 0
# skipped 0
# todo 0
```
- 52 application, wallet connector, provider bridging, and dashboard tests (`tests/*.test.mjs`)
- 10 Compact smart contract circuit tests (`contract/tests/private-payroll.test.mjs`)
- 15 payment model & routing regression tests (`lib/*.test.mjs`)

### 2. On-Chain Preview Deployment
- **Contract Address:** `e8c98d59b66ba8986e403eb32a14fbd491515f5f5f01108ca9265d15940e0469`
- **Network:** Midnight Preview (`preview`)
- **Circuit Key Distribution:** Served via `public/zk/keys/` and `public/zk/zkir/`
