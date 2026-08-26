/**
 * OffPay Frontend Application Engine
 * Web Crypto API Signatures + Bluetooth/Mesh Simulator + Auto-Settlement Poller
 */

// Sound Synthesizer via Web Audio API
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) this.ctx = new AudioContext();
    }
  }

  playTone(freq, type = 'sine', duration = 0.15, gainVal = 0.1) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  playTap() {
    this.playTone(520, 'sine', 0.08, 0.1);
  }

  playBeam() {
    this.playTone(380, 'triangle', 0.1, 0.12);
    setTimeout(() => this.playTone(580, 'triangle', 0.12, 0.12), 80);
    setTimeout(() => this.playTone(880, 'sine', 0.2, 0.15), 160);
  }

  playSuccess() {
    this.playTone(523.25, 'sine', 0.1, 0.1); // C5
    setTimeout(() => this.playTone(659.25, 'sine', 0.1, 0.1), 100); // E5
    setTimeout(() => this.playTone(783.99, 'sine', 0.25, 0.15), 200); // G5
  }

  playError() {
    this.playTone(220, 'sawtooth', 0.2, 0.15);
    setTimeout(() => this.playTone(180, 'sawtooth', 0.3, 0.15), 150);
  }
}

const audio = new SoundEngine();

// Cryptographic Web Crypto Helper
class CryptoEngine {
  static async generateKeyPair() {
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256'
      },
      true,
      ['sign', 'verify']
    );

    const exportedPublic = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
    const pubBase64 = CryptoEngine.arrayBufferToBase64(exportedPublic);

    return {
      keyPair,
      publicKeyBase64: pubBase64
    };
  }

  static arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  static async signPayload(privateKey, payloadString) {
    const encoder = new TextEncoder();
    const data = encoder.encode(payloadString);
    const signatureBuffer = await window.crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      privateKey,
      data
    );
    return CryptoEngine.arrayBufferToBase64(signatureBuffer);
  }
}

// OffPay Main State
const state = {
  deviceA: {
    id: 'user-a@offpay',
    name: 'Aarav (Device A - Payer)',
    online: false,
    balance: 10000,
    keys: null,
    outbox: []
  },
  deviceB: {
    id: 'user-b@offpay',
    name: 'Bhavna (Device B - Receiver)',
    online: false,
    balance: 3500,
    keys: null,
    inbox: []
  },
  deviceC: {
    id: 'relay-c@offpay',
    name: 'Mesh Relay C',
    inRange: true,
    online: true
  },
  transactions: []
};

// UI Element References
const el = {
  // Device A
  deviceACard: document.getElementById('device-a-card'),
  toggleA: document.getElementById('toggle-a'),
  balanceA: document.getElementById('balance-a'),
  keyBadgeA: document.getElementById('key-badge-a'),
  amountInput: document.getElementById('amount-input'),
  payBtn: document.getElementById('pay-btn'),
  outboxListA: document.getElementById('outbox-list-a'),

  // Device B
  deviceBCard: document.getElementById('device-b-card'),
  toggleB: document.getElementById('toggle-b'),
  balanceB: document.getElementById('balance-b'),
  keyBadgeB: document.getElementById('key-badge-b'),
  inboxListB: document.getElementById('inbox-list-b'),

  // Device C (Mesh Relay)
  toggleCOnline: document.getElementById('toggle-c-online'),
  toggleCRange: document.getElementById('toggle-c-range'),
  relayStatusDot: document.getElementById('relay-status-dot'),

  // Beam & Actions
  tapBeamBtn: document.getElementById('tap-beam-btn'),
  beamLine: document.getElementById('beam-line'),
  tamperBtn: document.getElementById('tamper-btn'),
  resetBtn: document.getElementById('reset-btn'),

  // Ledger & Toasts
  ledgerBody: document.getElementById('ledger-tbody'),
  ledgerCount: document.getElementById('ledger-count'),
  toastContainer: document.getElementById('toast-container'),
  liveClockA: document.getElementById('clock-a'),
  liveClockB: document.getElementById('clock-b')
};

// Toast Notifications
function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'warning') icon = '⚠️';
  if (type === 'error') icon = '🚫';

  toast.innerHTML = `<span>${icon}</span><div>${msg}</div>`;
  el.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Live Clocks
function updateClocks() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (el.liveClockA) el.liveClockA.textContent = timeStr;
  if (el.liveClockB) el.liveClockB.textContent = timeStr;
}
setInterval(updateClocks, 1000);
updateClocks();

// Initialize Cryptographic Keys
async function initKeys() {
  try {
    state.deviceA.keys = await CryptoEngine.generateKeyPair();
    state.deviceB.keys = await CryptoEngine.generateKeyPair();

    const shortKeyA = state.deviceA.keys.publicKeyBase64.substring(0, 16) + '...';
    const shortKeyB = state.deviceB.keys.publicKeyBase64.substring(0, 16) + '...';

    if (el.keyBadgeA) el.keyBadgeA.textContent = `RSA Key: ${shortKeyA}`;
    if (el.keyBadgeB) el.keyBadgeB.textContent = `RSA Key: ${shortKeyB}`;

    console.log('[CRYPTO] RSA-256 Key Pairs Generated for Device A & B');
  } catch (err) {
    console.error('Failed to initialize keys:', err);
    showToast('Failed to generate crypto keys', 'error');
  }
}

// Trust Tier Classifier
function getTrustTier(amount) {
  const num = Number(amount);
  if (num <= 500) {
    return {
      tier: 'GREEN',
      label: 'Auto-Approved (Offline)',
      badgeClass: 'tier-green'
    };
  } else if (num <= 2000) {
    return {
      tier: 'YELLOW',
      label: 'Pending Online Verification',
      badgeClass: 'tier-yellow'
    };
  } else {
    return {
      tier: 'RED',
      label: 'Blocked Offline (> ₹2,000)',
      badgeClass: 'tier-red'
    };
  }
}

// Create Signed Offline Voucher
async function createVoucher(amount) {
  const numAmount = Number(amount);
  if (!numAmount || numAmount <= 0) {
    showToast('Please enter a valid payment amount', 'warning');
    return;
  }

  const tierInfo = getTrustTier(numAmount);

  // Red Tier Check
  if (tierInfo.tier === 'RED') {
    audio.playError();
    showToast('❌ Payment Blocked: Amounts over ₹2,000 require an active online connection (Red Tier).', 'error');
    return;
  }

  const voucherId = 'VOUCH-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(100 + Math.random() * 900);
  const nonce = 'NONCE-' + Math.random().toString(36).substring(2, 10);
  const timestamp = new Date().toISOString();

  // Canonical payload for signing
  const canonicalPayload = JSON.stringify({
    voucherId,
    payerId: state.deviceA.id,
    receiverId: state.deviceB.id,
    amount: numAmount,
    currency: 'INR',
    tier: tierInfo.tier,
    nonce,
    timestamp
  });

  // Digital Signature
  const signature = await CryptoEngine.signPayload(state.deviceA.keys.keyPair.privateKey, canonicalPayload);

  const voucher = {
    voucherId,
    payerId: state.deviceA.id,
    receiverId: state.deviceB.id,
    amount: numAmount,
    currency: 'INR',
    tier: tierInfo.tier,
    tierLabel: tierInfo.label,
    nonce,
    timestamp,
    signature,
    publicKey: state.deviceA.keys.publicKeyBase64,
    status: tierInfo.tier === 'GREEN' ? 'AUTO_APPROVED_OFFLINE' : 'PENDING_OFFLINE',
    transferredToB: false
  };

  state.deviceA.outbox.unshift(voucher);
  audio.playTap();
  renderDeviceA();

  showToast(`Signed ₹${numAmount} voucher generated! (${tierInfo.tier} Tier)`, 'success');

  // If Device A is online, auto-settle immediately
  if (state.deviceA.online) {
    settleVoucher(voucher);
  }
}

// Render Device A Outbox
function renderDeviceA() {
  el.balanceA.textContent = `₹${state.deviceA.balance.toLocaleString('en-IN')}`;
  el.outboxListA.innerHTML = '';

  if (state.deviceA.outbox.length === 0) {
    el.outboxListA.innerHTML = `<div style="color:var(--text-dim);font-size:0.75rem;padding:8px 0;">No queued vouchers</div>`;
    return;
  }

  state.deviceA.outbox.forEach(v => {
    const card = document.createElement('div');
    card.className = `queue-card tier-${v.tier.toLowerCase()}-card`;
    card.innerHTML = `
      <div class="queue-card-top">
        <span>₹${v.amount}</span>
        <span style="font-size:0.7rem;color:${v.tier === 'GREEN' ? 'var(--tier-green)' : 'var(--tier-yellow)'}">
          ${v.status}
        </span>
      </div>
      <div class="queue-card-sig">Sig: ${v.signature.substring(0, 24)}...</div>
      <div style="font-size:0.68rem;color:var(--text-dim);">
        ${v.transferredToB ? '✓ Transferred via Bluetooth' : '⏳ Ready to Tap/Beam'}
      </div>
    `;
    el.outboxListA.appendChild(card);
  });
}

// Render Device B Inbox
function renderDeviceB() {
  el.balanceB.textContent = `₹${state.deviceB.balance.toLocaleString('en-IN')}`;
  el.inboxListB.innerHTML = '';

  if (state.deviceB.inbox.length === 0) {
    el.inboxListB.innerHTML = `<div style="color:var(--text-dim);font-size:0.75rem;padding:8px 0;">No received vouchers yet</div>`;
    return;
  }

  state.deviceB.inbox.forEach(v => {
    const card = document.createElement('div');
    card.className = `queue-card tier-${v.tier.toLowerCase()}-card`;
    card.innerHTML = `
      <div class="queue-card-top">
        <span>₹${v.amount}</span>
        <span style="font-size:0.7rem;color:${v.settled ? 'var(--tier-green)' : 'var(--tier-yellow)'}">
          ${v.settled ? 'SETTLED' : (v.status || 'RECEIVED_OFFLINE')}
        </span>
      </div>
      <div class="queue-card-sig">From: ${v.payerId}</div>
      <div style="font-size:0.68rem;color:var(--text-dim);">
        ${v.upiRef ? `UPI: ${v.upiRef}` : (state.deviceB.online ? 'Settling...' : 'Awaiting internet to settle')}
      </div>
    `;
    el.inboxListB.appendChild(card);
  });
}

// Simulate Bluetooth / Near Tap Handshake
async function triggerNearbyTap() {
  const pendingVouchers = state.deviceA.outbox.filter(v => !v.transferredToB);

  if (pendingVouchers.length === 0) {
    showToast('No pending vouchers in Device A outbox to beam.', 'info');
    return;
  }

  // Visual & Audio animation
  audio.playBeam();
  el.tapBeamBtn.classList.add('pulsing');
  el.beamLine.classList.add('active');

  setTimeout(() => {
    el.tapBeamBtn.classList.remove('pulsing');
    el.beamLine.classList.remove('active');
  }, 1200);

  // Transfer vouchers
  pendingVouchers.forEach(v => {
    v.transferredToB = true;
    // Check if already in inbox
    if (!state.deviceB.inbox.some(b => b.voucherId === v.voucherId)) {
      state.deviceB.inbox.unshift({ ...v });
    }
  });

  renderDeviceA();
  renderDeviceB();

  showToast(`⚡ Bluetooth Beam: ${pendingVouchers.length} voucher(s) securely exchanged offline!`, 'success');

  // Check if Device B is online OR if Mesh Relay C can relay it
  triggerAutoSettlementCheck();
}

// Auto-Settlement Trigger Check (Device B Online or Device C Mesh Relay)
function triggerAutoSettlementCheck() {
  // Scenario 1: Device B is online
  if (state.deviceB.online) {
    state.deviceB.inbox.forEach(v => {
      if (!v.settled && v.status !== 'SETTLING_NPCI') {
        settleVoucher(v);
      }
    });
    return;
  }

  // Scenario 2: Device A is online
  if (state.deviceA.online) {
    state.deviceA.outbox.forEach(v => {
      if (!v.settled && v.status !== 'SETTLING_NPCI') {
        settleVoucher(v);
      }
    });
    return;
  }

  // Scenario 3: Device C (Mesh Relay) is In-Range and Online!
  if (state.deviceC.inRange && state.deviceC.online) {
    const unsettled = state.deviceB.inbox.filter(v => !v.settled && v.status !== 'SETTLING_NPCI');
    if (unsettled.length > 0) {
      showToast('📡 Mesh Relay Active: Forwarding offline vouchers via Device C node!', 'info');
      unsettled.forEach(v => {
        settleVoucher({ ...v, relayNode: state.deviceC.id });
      });
    }
  }
}

// POST Voucher to Backend /api/settle
async function settleVoucher(voucher) {
  voucher.status = 'SETTLING_NPCI';
  renderDeviceA();
  renderDeviceB();

  try {
    const response = await fetch('/api/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(voucher)
    });

    const data = await response.json();

    if (data.success) {
      voucher.settled = true;
      voucher.status = 'SETTLED';
      voucher.upiRef = data.upiRef;

      // Update in state collections
      const outIdx = state.deviceA.outbox.findIndex(x => x.voucherId === voucher.voucherId);
      if (outIdx >= 0) state.deviceA.outbox[outIdx] = voucher;

      const inIdx = state.deviceB.inbox.findIndex(x => x.voucherId === voucher.voucherId);
      if (inIdx >= 0) state.deviceB.inbox[inIdx] = voucher;

      audio.playSuccess();
      showToast(`🎉 Settled via NPCI! UPI Ref: ${data.upiRef}`, 'success');

      fetchLedger();
    } else {
      audio.playError();
      voucher.status = data.transaction?.status || 'REJECTED';
      showToast(`Settlement error: ${data.error}`, 'error');
      fetchLedger();
    }
  } catch (err) {
    console.warn('Network unreachable for settlement:', err.message);
  } finally {
    renderDeviceA();
    renderDeviceB();
  }
}

// Fetch Global NPCI Ledger & Server Balances
async function fetchLedger() {
  try {
    const res = await fetch('/api/transactions');
    if (!res.ok) return;
    const data = await res.json();

    state.transactions = data.transactions || [];

    // Sync balances from server truth
    if (data.accounts) {
      if (data.accounts[state.deviceA.id]) {
        state.deviceA.balance = data.accounts[state.deviceA.id].balance;
      }
      if (data.accounts[state.deviceB.id]) {
        state.deviceB.balance = data.accounts[state.deviceB.id].balance;
      }
      renderDeviceA();
      renderDeviceB();
    }

    renderLedgerTable();
  } catch (e) {
    // Backend may be starting or offline
  }
}

// Render Ledger Table
function renderLedgerTable() {
  if (el.ledgerCount) el.ledgerCount.textContent = `${state.transactions.length} record(s)`;
  el.ledgerBody.innerHTML = '';

  if (state.transactions.length === 0) {
    el.ledgerBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:24px;">No transactions recorded in NPCI ledger yet. Create an offline voucher above!</td></tr>`;
    return;
  }

  state.transactions.forEach(tx => {
    const tr = document.createElement('tr');

    let statusBadge = `<span class="status-pill queued">QUEUED</span>`;
    if (tx.status === 'SETTLED') {
      statusBadge = `<span class="status-pill settled">✓ SETTLED</span>`;
    } else if (tx.status === 'SETTLING_NPCI') {
      statusBadge = `<span class="status-pill settling">⚡ SETTLING (NPCI)</span>`;
    } else if (tx.status === 'BLOCKED') {
      statusBadge = `<span class="status-pill blocked">✕ BLOCKED (>₹2k)</span>`;
    } else if (tx.status === 'FAILED_FRAUD') {
      statusBadge = `<span class="status-pill fraud">🚫 FRAUD (TAMPERED)</span>`;
    }

    const timeFormatted = new Date(tx.createdAt || tx.timestamp).toLocaleTimeString();

    tr.innerHTML = `
      <td style="font-family:var(--font-mono);font-size:0.75rem;color:var(--accent-cyan);">${tx.voucherId}</td>
      <td style="font-weight:700;">₹${Number(tx.amount).toLocaleString('en-IN')}</td>
      <td>
        <span class="tier-badge" style="font-size:0.65rem;background:${tx.tier === 'GREEN' ? 'rgba(16,185,129,0.15)' : (tx.tier === 'YELLOW' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)')};color:${tx.tier === 'GREEN' ? 'var(--tier-green)' : (tx.tier === 'YELLOW' ? 'var(--tier-yellow)' : 'var(--tier-red)')};">
          ${tx.tier || 'OFFLINE'}
        </span>
      </td>
      <td>${statusBadge}</td>
      <td style="font-family:var(--font-mono);font-size:0.75rem;color:#a5b4fc;">
        ${tx.upiRef || '<span style="color:var(--text-dim)">—</span>'}
      </td>
      <td style="font-size:0.75rem;color:var(--text-muted);">${timeFormatted}</td>
    `;
    el.ledgerBody.appendChild(tr);
  });
}

// Tamper Attack Simulation for Demo/Judges
async function simulateTamperedVoucher() {
  audio.playTap();
  showToast('🛠️ Simulating Tamper Attack: Modifying ₹100 voucher to ₹10,000 without valid signature...', 'warning');

  const fraudulentVoucher = {
    voucherId: 'TAMPER-' + Date.now().toString(36).toUpperCase(),
    payerId: state.deviceA.id,
    receiverId: state.deviceB.id,
    amount: 10000, // Altered amount!
    currency: 'INR',
    tier: 'GREEN',
    nonce: 'FAKE-NONCE-123',
    timestamp: new Date().toISOString(),
    signature: 'MOCK_FORGED_SIGNATURE_BASE64_99999999999999999999999999999999',
    publicKey: state.deviceA.keys.publicKeyBase64
  };

  try {
    const res = await fetch('/api/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fraudulentVoucher)
    });
    const result = await res.json();
    audio.playError();
    showToast(`🚨 Security Guard Caught Fraud: ${result.error}`, 'error');
    fetchLedger();
  } catch (err) {
    showToast('Failed to connect to backend verification endpoint', 'error');
  }
}

// Reset Demo State
async function resetDemo() {
  audio.playTap();
  try {
    await fetch('/api/reset', { method: 'POST' });
    state.deviceA.outbox = [];
    state.deviceB.inbox = [];
    state.deviceA.balance = 10000;
    state.deviceB.balance = 3500;
    renderDeviceA();
    renderDeviceB();
    fetchLedger();
    showToast('Demo environment reset successfully', 'info');
  } catch (e) {
    showToast('Failed to reset demo', 'error');
  }
}

// Event Listeners Setup
function setupEvents() {
  // Toggle A Network
  el.toggleA.addEventListener('change', (e) => {
    state.deviceA.online = e.target.checked;
    audio.playTap();
    if (state.deviceA.online) {
      el.deviceACard.classList.remove('offline-mode');
      el.deviceACard.classList.add('online-mode');
      showToast('Device A connected to internet (Online)', 'success');
      triggerAutoSettlementCheck();
    } else {
      el.deviceACard.classList.add('offline-mode');
      el.deviceACard.classList.remove('online-mode');
      showToast('Device A switched to Offline / Airplane mode', 'info');
    }
  });

  // Toggle B Network
  el.toggleB.addEventListener('change', (e) => {
    state.deviceB.online = e.target.checked;
    audio.playTap();
    if (state.deviceB.online) {
      el.deviceBCard.classList.remove('offline-mode');
      el.deviceBCard.classList.add('online-mode');
      showToast('Device B connected to internet (Online)', 'success');
      triggerAutoSettlementCheck();
    } else {
      el.deviceBCard.classList.add('offline-mode');
      el.deviceBCard.classList.remove('online-mode');
      showToast('Device B switched to Offline / Airplane mode', 'info');
    }
  });

  // Toggle C (Mesh Relay)
  el.toggleCOnline.addEventListener('change', (e) => {
    state.deviceC.online = e.target.checked;
    audio.playTap();
    el.relayStatusDot.className = `mesh-status-indicator ${state.deviceC.online && state.deviceC.inRange ? '' : 'offline'}`;
    triggerAutoSettlementCheck();
  });

  el.toggleCRange.addEventListener('change', (e) => {
    state.deviceC.inRange = e.target.checked;
    audio.playTap();
    el.relayStatusDot.className = `mesh-status-indicator ${state.deviceC.online && state.deviceC.inRange ? '' : 'offline'}`;
    triggerAutoSettlementCheck();
  });

  // Pay Button
  el.payBtn.addEventListener('click', () => {
    const val = el.amountInput.value;
    createVoucher(val);
  });

  // Quick Amount Chips
  document.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const amount = btn.getAttribute('data-amount');
      el.amountInput.value = amount;
      audio.playTap();
    });
  });

  // Nearby Tap / Bluetooth Beam
  el.tapBeamBtn.addEventListener('click', triggerNearbyTap);

  // Tamper Demo
  el.tamperBtn.addEventListener('click', simulateTamperedVoucher);

  // Reset Demo
  el.resetBtn.addEventListener('click', resetDemo);
}

// Initial Boot
async function startApp() {
  await initKeys();
  setupEvents();
  renderDeviceA();
  renderDeviceB();
  fetchLedger();
  // Poll ledger every 1.5s
  setInterval(fetchLedger, 1500);
}

window.addEventListener('DOMContentLoaded', startApp);
