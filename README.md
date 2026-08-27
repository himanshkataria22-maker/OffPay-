# ⚡ OffPay — Offline-First Peer-to-Peer Payment Demo with Auto-Settling UPI Gateway

> **Hackathon Prototype**: A lightweight, zero-external-dependency simulator demonstrating peer-to-peer offline payments over simulated Bluetooth Low Energy (BLE) and Mesh Relay, with automatic cryptographic settlement into a mock NPCI/UPI banking gateway once connectivity is restored.

---

## 🎯 The Problem

In developing economies and disaster zones, internet connectivity is intermittent. Traditional digital payment systems (UPI, card terminals, mobile banking) fail completely without an active internet connection, forcing users back to cash.

---

## 💡 The OffPay Solution

OffPay bridges the connectivity gap through **asymmetric cryptographic vouchers**, **risk-based trust tiers**, and **store-and-forward mesh relaying**:

1. **Offline Signature Creation**: Payer generates a digitally signed JSON voucher using browser-native **Web Crypto API (RSA-SHA256)** stored in a local secure enclave.
2. **Device-to-Device Exchange**: Payer and Receiver exchange the signed voucher offline over simulated **Bluetooth Low Energy (BLE)** handshake ("Nearby Tap").
3. **Trust-Tier Risk Management**:
   - 🟢 **Tier Green (< ₹500)**: Auto-approved instantly offline for micro-merchants, transit, and daily essentials.
   - 🟡 **Tier Yellow (₹500 – ₹2,000)**: Signed offline, marked as *Pending Verification* until online settlement.
   - 🔴 **Tier Red (> ₹2,000)**: Blocked offline entirely; requires active online biometric/PIN verification to prevent high-value fraud.
4. **Offline Spending-Limit Gauge**: Visual limit meter enforces a daily offline cap (₹2,000) per device.
5. **3-State Network Control**: Simulates **Strong 5G / Fiber**, **Weak 2G / Edge**, and **No Signal (Airplane Mode)**.
6. **Mesh Relay Node (Device C - Chetan)**: If both Payer and Receiver are offline, a nearby third-party bystander device with internet connectivity relays the encrypted voucher to the NPCI gateway without needing private key access.
7. **Double-Spend & Tamper Protection**: Nonce verification and cryptographic signature checks prevent replay attacks and token forgery.
8. **Auto-Settlement Bridge**: When connectivity restores, vouchers automatically submit to `/api/settle`, verifying signatures and generating realistic mock UPI reference IDs (`UPI/523910283921/AXIS/OK`).
9. **Live Fintech Dashboard**: 4 top stat cards with mini sparklines, 2 reactive Chart.js graphs, dynamic session insights, and real-time NPCI ledger.

---

## 🏗️ Architecture & Security

```
+-----------------------------------------------------------------------------------+
|                                  BROWSER CLIENT                                   |
|                                                                                   |
|  [ Device A (Payer) ]                    [ Device C (Mesh Node) ]                 |
|  • Web Crypto RSA-256                    • In-Range / Online Check                |
|  • Local Storage Outbox                  • Packet Forwarder                       |
|  • Spending Limit Meter (₹2k Cap)        • Bystander Relay                        |
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
|  • Nonce Ledger (Anti-Double-Spend Protection)                                    |
|  • Trust Tier Policy Enforcement (< ₹2,000 limit)                                 |
|  • Simulated NPCI Payment Processing (1.2s gateway delay)                         |
|  • Mock UPI Reference Generation (`UPI/523910283921/AXIS/OK`)                     |
|  • Live Analytics Aggregation (`/api/stats`)                                      |
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

## 🧪 Hackathon Demo Script (How to Test for Judges)

Follow these steps to demonstrate the end-to-end offline flow:

### 1. Test Offline Green Tier Payment (< ₹500)
1. Verify both **Device A** and **Device B** are set to **Off (No Signal)**.
2. Click the **₹250** quick chip on Device A (Rahul).
3. Click **"Generate Signed Voucher"**.
   - *Result*: A digitally signed voucher appears in Device A's Outbox and the offline spending meter updates.
4. Click the central **🤝 Bluetooth BLE Beam button**.
   - *Result*: Transfer chime plays, radar rings pulse, and the voucher beams to Device B's Inbox.
5. Click **5G** on Device B (Priya).
   - *Result*: Device B automatically posts the voucher to the backend. It transitions to `SETTLING` and settles with a mock UPI Reference ID (`UPI/XXXX/AXIS/OK`). Balances and Chart.js graphs update live!

### 2. Test Double-Spend Protection (Replay Attack)
1. In the **Security & Attack Simulator** panel, click **"Test Double-Spend Replay"**.
2. *Result*: The backend detects the duplicate nonce and rejects the attempt with `409 Conflict`, alerting **"⚠️ Duplicate transaction blocked"**.

### 3. Test Cryptographic Tamper Defense (Fraud Attack)
1. Click **"Test Tamper Rejection (Fraud)"**.
2. *Result*: Injects an altered ₹10,000 voucher with an invalid signature. The backend catches the cryptographic hash mismatch and records `FAILED_FRAUD`.

### 4. Test Mesh Relay Forwarding (Device C - Chetan)
1. Set both Device A and Device B to **Off (No Signal)**.
2. Generate a ₹450 Green voucher and beam it to Device B.
3. Ensure **Device C (Mesh Relay)** has both *In BLE Range* and *Relay Online* active.
4. *Result*: Device C detects the offline voucher and immediately relays it to NPCI on behalf of the offline peers!

---

## 📁 Repository Structure

```
offpay/
├── backend/
│   ├── server.js               # Express application server
│   ├── routes/
│   │   └── settlement.js       # Settle, Stats, Transactions, and Reset APIs
│   ├── utils/
│   │   └── crypto.js           # RSA-256 SPKI normalization & signature verification
│   ├── db.js                   # JSON/SQLite persistent store & nonce tracking
│   └── data/
│       └── db.json             # File-backed storage
├── frontend/
│   ├── index.html              # Dark fintech simulator UI & analytics dashboard
│   ├── style.css               # Responsive dark theme, sparklines, gauges, animations
│   └── app.js                  # WebCrypto RSA engine, Chart.js integrations, BLE beam
├── test_e2e.js                 # Automated backend test suite
├── package.json
└── README.md
```

---

## 👥 Demo Users Preloaded
- **Rahul Sharma** (`rahul@offpay` / `rahul@okaxis`) - Device A
- **Priya Patel** (`priya@offpay` / `priya@okhdfc`) - Device B
- **Aarav Verma** (`aarav@offpay` / `aarav@okicici`) - Device A / B
- **Chetan** (`chetan@offpay` / `chetan@oksbi`) - Mesh Relay Node C


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
