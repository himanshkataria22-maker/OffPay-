# ⚡ OffPay — Offline-First Peer-to-Peer Payment Demo with Auto-Settling UPI Gateway

> **Hackathon Prototype**: A lightweight, zero-external-dependency simulator demonstrating peer-to-peer offline payments over simulated Bluetooth Low Energy (BLE) and Mesh Relay, with automatic cryptographic settlement into a mock NPCI/UPI banking gateway once connectivity is restored.

---

## 🎯 The Problem

In developing economies and disaster zones, internet connectivity is intermittent. Traditional digital payment systems (UPI, card terminals, mobile banking) fail completely without an active internet connection, forcing users back to cash.

## 💡 The OffPay Solution

OffPay bridges the connectivity gap through **asymmetric cryptographic vouchers**, **risk-based trust tiers**, and **store-and-forward mesh relaying**:

1. **Offline Signature Creation**: Payer generates a digitally signed JSON voucher using browser-native **Web Crypto API (RSA-SHA256)** stored in a local secure enclave.
2. **Device-to-Device Exchange**: Payer and Receiver exchange the signed voucher offline over simulated **Bluetooth Low Energy (BLE)** handshake ("Nearby Tap").
3. **Trust-Tier Risk Management**:
   - 🟢 **Tier Green (&lt; ₹500)**: Auto-approved instantly offline for micro-merchants, transit, and daily essentials.
   - 🟡 **Tier Yellow (₹500 – ₹2,000)**: Signed offline, marked as *Pending Verification* until online settlement.
   - 🔴 **Tier Red (&gt; ₹2,000)**: Blocked offline entirely; requires active online biometric/PIN verification to prevent high-value fraud.
4. **Mesh Relay Node (Device C)**: If both Payer and Receiver are offline, a nearby third-party device with internet connectivity can relay the cryptographically signed voucher to the NPCI gateway without needing access to private keys.
5. **Auto-Settlement Bridge**: When either device (or a mesh relay) comes online, the voucher is dispatched to the backend `/api/settle` endpoint.
6. **NPCI Gateway Validation**: The backend verifies the cryptographic signature with the payer's public key, checks for double spending, applies simulated NPCI bank delay (1.5s), debits/credits accounts, and issues an official mock UPI Reference ID (`UPI-NPCI-2026...`).

---

## 🏗️ Architecture & Security

```
+-----------------------------------------------------------------------------------+
|                                  BROWSER CLIENT                                   |
|                                                                                   |
|  [ Device A (Payer) ]                    [ Device C (Mesh Node) ]                 |
|  • Web Crypto RSA-256                    • In-Range / Online Check                |
|  • Local Storage Outbox                  • Packet Forwarder                       |
|           │                                      ▲                                |
|           │ (Simulated Bluetooth Beam)           │ (Mesh Relay)                   |
|           ▼                                      │                                |
|  [ Device B (Receiver) ]                         │                                |
|  • Local Storage Inbox ──────────────────────────┘                                |
|  • Auto-Settlement Trigger on Online                                              |
+────────────────────────────────────────┬──────────────────────────────────────────+
                                         │ POST /api/settle (JSON Voucher)
                                         ▼
+-----------------------------------------------------------------------------------+
|                                 EXPRESS BACKEND                                   |
|                                                                                   |
|  • RSA-SHA256 Signature Verification (`crypto.createVerify`)                      |
|  • Trust Tier Policy Enforcement (&lt; ₹2000 limit)                                 |
|  • Tamper & Anti-Fraud Detection                                                  |
|  • Simulated NPCI Payment Processing (1.5s gateway delay)                         |
|  • Mock UPI Reference Generation (`UPI-NPCI-YYYYMMDD-XXXXXX`)                     |
|  • JSON Persistence DB (`backend/data/db.json`)                                   |
+-----------------------------------------------------------------------------------+
```

---

## 🚀 Quickstart (Runs in 30 seconds!)

### Prerequisites
- **Node.js** (v16+ recommended)
- **npm**

### Installation & Run

1. Navigate to the project folder:
   ```bash
   cd offpay
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open your browser:
   👉 **`http://localhost:3000`**

---

## 🧪 Hackathon Demo Script (How to Test)

Follow these steps to demonstrate the end-to-end offline flow:

### 1. Test Offline Green Tier Payment (< ₹500)
1. In the UI, verify both **Device A** and **Device B** are toggled to **Offline**.
2. Click the **₹250** chip or enter `250` on Device A.
3. Click **"Generate Signed Voucher"**.
   - *Result*: A digitally signed voucher appears in Device A's Outbox with status `AUTO_APPROVED_OFFLINE`.
4. Click the central **📡 Bluetooth Beam button**.
   - *Result*: The beam animation triggers, transfer chime plays, and the voucher moves to Device B's Inbox.
5. Toggle **Device B to Online**.
   - *Result*: Device B automatically posts the voucher to the backend. The ledger displays `SETTLING (NPCI)` and then settles with a mock UPI Reference ID (`UPI-NPCI-...`). Balances update live!

### 2. Test Pending Yellow Tier Payment (₹500 – ₹2,000)
1. Switch both devices back to **Offline**.
2. Select **₹1,200 (Yellow)** and click **"Generate Signed Voucher"**.
   - *Result*: Voucher is marked `PENDING_OFFLINE`.
3. Beam the voucher to Device B.
4. Toggle **Device B Online** and watch it settle.

### 3. Test Blocked Red Tier Payment (> ₹2,000)
1. Enter `₹2,500`.
2. Click **"Generate Signed Voucher"**.
   - *Result*: High-value alert triggers and blocks voucher creation with a warning.

### 4. Test Mesh Relay via Device C
1. Set **Device A** and **Device B** to **Offline**.
2. Ensure **Device C (Mesh Relay)** has both **In BLE Range** and **Relay Online** checked.
3. Generate a `₹450` payment on Device A and beam it to Device B.
   - *Result*: Device B detects Mesh Relay C is online in range and immediately routes the voucher through Device C to the NPCI gateway without Device A or B ever needing internet connectivity!

### 5. Test Cryptographic Fraud & Tamper Detection
1. In the **Security & Tamper Lab** on the right, click **"Test Tamper Rejection (Fraud)"**.
2. This simulates an attacker modifying an offline voucher's amount from ₹100 to ₹10,000.
   - *Result*: The backend's cryptographic verifier catches the signature mismatch and flags the record in the ledger as `🚫 FRAUD (TAMPERED)`.

---

## 📁 Repository Structure

```
offpay/
├── backend/
│   ├── data/
│   │   └── db.json               # Auto-created JSON ledger & account database
│   ├── routes/
│   │   └── settlement.js         # /api/settle, /api/transactions, /api/reset
│   ├── utils/
│   │   └── crypto.js             # RSA-SHA256 signature verification
│   ├── db.js                     # File/in-memory persistent store
│   └── server.js                 # Express server on port 3000 & static file host
├── frontend/
│   ├── index.html                # Responsive dual-phone mockup & dashboard
│   ├── app.js                    # Web Crypto keys, BLE beam engine & poller
│   └── style.css                 # Dark glassmorphic aesthetic & animations
├── package.json
└── README.md
```

---

## 🛡️ License

MIT License. Built for hackathons & educational demonstrations.
