# One-Minute Demo Video Script: Midnight Private Payroll

This script outlines the exact structure for recording a clean, high-impact **60-second video demo** for the Level 3 submission.

---

## Video Guidelines
- **Target Duration:** 55–60 seconds.
- **Resolution:** 1080p (1920×1080) or 4K, 30/60 fps.
- **Audio:** Clear voiceover or concise text captions.
- **Privacy Rule:** Never reveal sensitive seed phrases, wallet credentials, or actual confidential employee salaries during recording. The UI automatically masks confidential salary inputs.

---

## Script Breakdown

### 0:00 – 0:10 | Introduction
- **Visual:** Open browser on the clean dashboard at `http://localhost:3000`. Show the header: *"Midnight Private Payroll — Zero-Knowledge Confidential Payroll Compliance"*.
- **Voiceover / Caption:**
  > *"Welcome to Midnight Private Payroll. In traditional systems, salary distributions and compensation compliance are publicly exposed. With Midnight smart contracts, we verify compensation rules and record payroll splits entirely using zero-knowledge proofs."*

### 0:10 – 0:20 | Wallet Connection
- **Visual:** Click **Connect Midnight Lace**. The wallet modal or connector status turns green with the shielded address displayed.
- **Voiceover / Caption:**
  > *"First, we connect our Midnight Lace wallet on the Preview testnet. The dApp securely binds our shielded identity and network endpoints without exposing account credentials."*

### 0:20 – 0:30 | Smart Contract Session
- **Visual:** Point to the **Private Payroll Session** card showing `Session Active` and the verified contract address: `e8c98d59b66ba8986e403eb32a14fbd491515f5f5f01108ca9265d15940e0469`.
- **Voiceover / Caption:**
  > *"Our session is actively bound to the Compact smart contract deployed on the Midnight Preview blockchain. The ledger currently shows our active payroll cycle and public counters."*

### 0:30 – 0:45 | Input Parameters (Public vs. Private)
- **Visual:** In the **Record Private Payroll Split** form:
  - Keep Maximum Allowed Salary Ceiling as `10000` (highlight the **PUBLIC** badge).
  - Type an employee salary into the confidential field (highlight the **PROTECTED** badge and masked characters `••••`).
- **Voiceover / Caption:**
  > *"Now we set our public policy ceiling to 10,000. Underneath, the employee's salary is entered into the confidential witness input. This number never leaves local memory and is never published on-chain."*

### 0:45 – 0:55 | Proving & Lace Approval
- **Visual:** Click **Record Private Split**. Show the step-by-step phase indicators (`Preparing` → `Proving` → `Approving`). Midnight Lace popup opens; click **Sign transaction**.
- **Voiceover / Caption:**
  > *"Clicking Record Private Split generates a local zk-SNARK proof verifying that the salary complies with the policy ceiling. We sign the balanced transaction in Midnight Lace."*

### 0:55 – 1:00 | Confirmation & Privacy Guarantee
- **Visual:** Show the green confirmation banner: *"Private Split Recorded Successfully"*, displaying the transaction hash and showing the **Private Splits Recorded** counter increment from `1` to `2`.
- **Voiceover / Caption:**
  > *"The split is confirmed on the Midnight public ledger! Only an anonymized 256-bit commitment hash and the public split counter are recorded. Complete privacy, verifiable compliance."*

---

## Pre-Recording Checklist
1. Next.js dev server running on port 3000 (`npm run dev`).
2. Local proof server running on port 6300 (`Invoke-RestMethod http://localhost:6300/health`).
3. Midnight Lace extension installed, unlocked, and funded with tDUST / tNIGHT on Preview network.
4. Browser zoom set to 100% or 110% for clear text readability.
