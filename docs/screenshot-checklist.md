# Level 3 Submission Screenshot Checklist

This checklist defines the 9 required screenshots for the Midnight Level 3 submission package.

> [!IMPORTANT]
> **Privacy & Security Rule:** Ensure that no private seed phrases, private spending keys, confidential recovery phrases, or actual confidential employee salaries are visible in any recorded images.

---

## Required Screenshots

| # | Screen / State | Description | File Path / Target | Status |
|---|---|---|---|---|
| **1** | **Main Dashboard Overview** | Full-width view of the Midnight Private Payroll application at `http://localhost:3000` showing clean branding and network badge. | `docs/screenshots/01-dashboard-overview.png` | [x] Ready (`midnight-contract-deployed.png`) |
| **2** | **Lace Wallet Connected** | Shielded address card showing green `Connected` badge, network identifier (`preview`), and abbreviation. | `docs/screenshots/02-lace-connected.png` | [x] Ready (`midnight-contract-deployed.png`) |
| **3** | **Contract Deployed / Bound** | Smart contract session card showing `Session Active` and verified contract address `e8c98d59b66ba8986e403eb32a14fbd491515f5f5f01108ca9265d15940e0469`. | `docs/screenshots/03-contract-active.png` | [x] Ready (`midnight-contract-deployed.png`) |
| **4** | **Private Split Form** | Form displaying public ceiling input (`10000`, marked `PUBLIC`) and confidential salary input (marked `PROTECTED` and masked). | `docs/screenshots/04-private-split-form.png` | [x] Ready (`midnight-contract-deployed.png`) |
| **5** | **Successful Transaction** | Green confirmation alert: *"Private Split Recorded Successfully"* showing transaction hash and cryptographic commitment details. | `docs/screenshots/05-transaction-success.png` | [x] Ready (`midnight-split-success.png`) |
| **6** | **Updated Public Counters** | Ledger status cards showing updated counters: `Private Splits Recorded: 1`, `Verification Count: 1`, `Payroll Cycle: #0`. | `docs/screenshots/06-updated-counters.png` | [x] Ready (`midnight-split-success.png`) |
| **7** | **Zero-Knowledge Privacy Model** | Architecture Reference card on the right column contrasting **PUBLIC (ON-CHAIN)** data against **PRIVATE (ZERO-KNOWLEDGE)** data. | `docs/screenshots/07-privacy-model.png` | [x] Ready (`midnight-contract-deployed.png`) |
| **8** | **GitHub Actions CI Passing** | GitHub Actions workflow page showing green checkmarks for both `Verify & Build` and `Midnight Local DevNet Integration` jobs. | `docs/screenshots/08-github-actions.png` | [x] Ready (`github-actions.png`) |
| **9** | **Automated Tests Passing** | Terminal output showing `pass 77` tests with zero failures across all test suites. | `docs/screenshots/09-tests-passing.png` | [x] Ready (`tests-passing.png`) |

---

## Screenshot Capture Guidelines
- Use standard resolution: `1920×1080` (1080p).
- Format: PNG (`.png`).
- Store all final screenshots in `docs/screenshots/`.
- Ensure light-theme UI elements and status text are clearly legible.
