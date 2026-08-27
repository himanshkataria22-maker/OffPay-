/**
 * OffPay Frontend Application Engine
 * Web Crypto API Signatures + Bluetooth/Mesh Simulator + Auto-Settlement Poller + Live Chart.js Dashboard
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

  playTone(freq, type = 'sine', duration = 0.15, gainVal = 0.08) {
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
      // Audio context might be restricted before user gesture
    }
  }

  playTap() {
    this.playTone(520, 'sine', 0.06, 0.08);
  }

  playBeam() {
    this.playTone(380, 'triangle', 0.1, 0.1);
    setTimeout(() => this.playTone(580, 'triangle', 0.12, 0.1), 80);
    setTimeout(() => this.playTone(880, 'sine', 0.2, 0.12), 160);
  }

  playSuccess() {
    this.playTone(523.25, 'sine', 0.1, 0.08);
    setTimeout(() => this.playTone(659.25, 'sine', 0.1, 0.08), 100);
    setTimeout(() => this.playTone(783.99, 'sine', 0.22, 0.12), 200);
  }

  playError() {
    this.playTone(220, 'sawtooth', 0.18, 0.12);
    setTimeout(() => this.playTone(180, 'sawtooth', 0.25, 0.12), 140);
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

// Global Application State
const state = {
  currentUserA: 'rahul@offpay',
  currentUserB: 'priya@offpay',
  deviceA: {
    id: 'rahul@offpay',
    name: 'Rahul Sharma',
    network: 'none', // 'strong' | 'weak' | 'none'
    balance: 10000,
    dailySpent: 0,
    dailyCap: 2000,
    keys: null,
    outbox: []
  },
  deviceB: {
    id: 'priya@offpay',
    name: 'Priya Patel',
    network: 'none',
    balance: 5000,
    keys: null,
    inbox: []
  },
  deviceC: {
    id: 'chetan@offpay',
    name: 'Chetan (Mesh Relay)',
    inRange: true,
    online: true
  },
  transactions: [],
  accounts: {},
  stats: null,
  chartRange: 'day'
};

// Chart instances
let volumeChartInstance = null;
let breakdownChartInstance = null;

// UI Element Bindings
const el = {
  // Device A
  deviceACard: document.getElementById('device-a-card'),
  userSelectA: document.getElementById('user-select-a'),
  balanceA: document.getElementById('balance-a'),
  bankNameA: document.getElementById('bank-name-a'),
  vpaA: document.getElementById('vpa-a'),
  keyBadgeA: document.getElementById('key-badge-a'),
  islandTextA: document.getElementById('island-text-a'),
  signalIconA: document.getElementById('signal-icon-a'),
  spendingText: document.getElementById('spending-limit-text'),
  spendingFill: document.getElementById('spending-bar-fill'),
  amountInput: document.getElementById('amount-input'),
  payBtn: document.getElementById('pay-btn'),
  outboxListA: document.getElementById('outbox-list-a'),
  outboxCountBadge: document.getElementById('outbox-count-badge'),

  // Device B
  deviceBCard: document.getElementById('device-b-card'),
  userSelectB: document.getElementById('user-select-b'),
  balanceB: document.getElementById('balance-b'),
  bankNameB: document.getElementById('bank-name-b'),
  vpaB: document.getElementById('vpa-b'),
  keyBadgeB: document.getElementById('key-badge-b'),
  islandTextB: document.getElementById('island-text-b'),
  signalIconB: document.getElementById('signal-icon-b'),
  inboxListB: document.getElementById('inbox-list-b'),
  inboxCountBadge: document.getElementById('inbox-count-badge'),

  // Device C (Mesh Relay)
  toggleCOnline: document.getElementById('toggle-c-online'),
  toggleCRange: document.getElementById('toggle-c-range'),
  relayStatusDot: document.getElementById('relay-status-dot'),
  meshRelayBadge: document.getElementById('mesh-relay-badge'),

  // Handshake & Actions
  tapBeamBtn: document.getElementById('tap-beam-btn'),
  beamLine: document.getElementById('beam-line'),
  meshBeamLine: document.getElementById('mesh-beam-line'),
  tamperBtn: document.getElementById('tamper-btn'),
  doublespendBtn: document.getElementById('doublespend-btn'),
  resetBtn: document.getElementById('reset-btn'),

  // Stat cards & Insights
  statTotalTx: document.getElementById('stat-total-tx'),
  statSettledAmount: document.getElementById('stat-settled-amount'),
  statOfflineRatio: document.getElementById('stat-offline-ratio'),
  ratioFill: document.getElementById('ratio-fill'),
  statAvgLatency: document.getElementById('stat-avg-latency'),
  insightTamper: document.getElementById('insight-tamper-text'),
  insightRelay: document.getElementById('insight-relay-text'),
  insightTier: document.getElementById('insight-tier-text'),
  insightDoublespend: document.getElementById('insight-doublespend-text'),

  // Ledger & Toasts
  ledgerBody: document.getElementById('ledger-tbody'),
  ledgerCount: document.getElementById('ledger-count'),
  toastContainer: document.getElementById('toast-container'),
  clockA: document.getElementById('clock-a'),
  clockB: document.getElementById('clock-b')
};

// Toast Notifications
function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'warning') icon = '⚠️';
  if (type === 'error') icon = '🚫';

  toast.innerHTML = `<span>${icon}</span><div style="line-height:1.3;">${msg}</div>`;
  el.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

// Live Clocks
function updateClocks() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (el.clockA) el.clockA.textContent = timeStr;
  if (el.clockB) el.clockB.textContent = timeStr;
}
setInterval(updateClocks, 1000);
updateClocks();

// Initialize Cryptographic RSA Keys for selected users
async function initKeys() {
  try {
    state.deviceA.keys = await CryptoEngine.generateKeyPair();
    state.deviceB.keys = await CryptoEngine.generateKeyPair();

    const shortKeyA = state.deviceA.keys.publicKeyBase64.substring(0, 16) + '...';
    const shortKeyB = state.deviceB.keys.publicKeyBase64.substring(0, 16) + '...';

    if (el.keyBadgeA) el.keyBadgeA.textContent = `RSA-256 Enclave Key: ${shortKeyA}`;
    if (el.keyBadgeB) el.keyBadgeB.textContent = `RSA-256 Enclave Key: ${shortKeyB}`;

    console.log('[CRYPTO] RSA-256 Enclave Keypairs Generated for Device A & Device B');
  } catch (err) {
    console.error('Failed to initialize keys:', err);
    showToast('Failed to generate crypto keys', 'error');
  }
}

// Trust Tier Strategy Classifier
function getTrustTier(amount) {
  const num = Number(amount);
  if (num < 500) {
    return {
      tier: 'GREEN',
      label: 'Tier 1: Green (< ₹500)',
      badgeClass: 'green'
    };
  } else if (num <= 2000) {
    return {
      tier: 'YELLOW',
      label: 'Tier 2: Yellow (₹500 - ₹2,000)',
      badgeClass: 'yellow'
    };
  } else {
    return {
      tier: 'RED',
      label: 'Tier 3: Red (> ₹2,000)',
      badgeClass: 'red'
    };
  }
}

// Offline Spending-Limit Meter Updater
function updateSpendingMeter() {
  const used = state.deviceA.dailySpent;
  const cap = state.deviceA.dailyCap;
  const percentage = Math.min(100, Math.round((used / cap) * 100));

  if (el.spendingText) {
    el.spendingText.textContent = `₹${used.toLocaleString('en-IN')} / ₹${cap.toLocaleString('en-IN')} used (${percentage}%)`;
  }
  if (el.spendingFill) {
    el.spendingFill.style.width = `${percentage}%`;
    if (percentage > 85) {
      el.spendingFill.style.background = 'var(--tier-red)';
    } else if (percentage > 50) {
      el.spendingFill.style.background = 'linear-gradient(90deg, var(--tier-green), var(--tier-yellow))';
    } else {
      el.spendingFill.style.background = 'var(--tier-green)';
    }
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

  // 1. Red Tier Policy Enforcement (Blocked offline)
  if (tierInfo.tier === 'RED') {
    audio.playError();
    showToast('❌ Payment Blocked: Amounts over ₹2,000 (Tier Red) require an active online connection.', 'error');
    
    // Track blocked attempt locally in ledger
    fetchLedger();
    return;
  }

  // 2. Daily Offline Cap Check
  if (state.deviceA.dailySpent + numAmount > state.deviceA.dailyCap) {
    audio.playError();
    showToast(`⚠️ Daily Offline Spending Cap Exceeded (Limit: ₹${state.deviceA.dailyCap}). Switch online to proceed.`, 'warning');
    return;
  }

  // 3. Generate Cryptographic Voucher Payload
  const voucherId = 'VOUCH-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(100 + Math.random() * 900);
  const nonce = 'NONCE-' + Math.random().toString(36).substring(2, 12);
  const timestamp = new Date().toISOString();

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

  // Digital Signature using RSA Private Key
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

  state.deviceA.dailySpent += numAmount;
  state.deviceA.outbox.unshift(voucher);
  audio.playTap();

  updateSpendingMeter();
  renderDeviceA();

  showToast(`✍️ Signed ₹${numAmount} voucher generated! (${tierInfo.tier} Tier)`, 'success');

  // Auto-settle immediately if Device A is online
  if (state.deviceA.network !== 'none') {
    settleVoucher(voucher);
  }
}

// Render Device A
function renderDeviceA() {
  if (el.balanceA) el.balanceA.textContent = `₹${state.deviceA.balance.toLocaleString('en-IN')}`;
  if (el.outboxCountBadge) el.outboxCountBadge.textContent = `${state.deviceA.outbox.length} Queued`;
  el.outboxListA.innerHTML = '';

  if (state.deviceA.outbox.length === 0) {
    el.outboxListA.innerHTML = `<div style="color:var(--text-dim);font-size:0.75rem;padding:12px 0;text-align:center;">No vouchers queued in local outbox</div>`;
    return;
  }

  state.deviceA.outbox.forEach(v => {
    const card = document.createElement('div');
    card.className = `queue-card`;
    card.innerHTML = `
      <div class="queue-card-top">
        <span>₹${v.amount}</span>
        <span class="tier-badge ${v.tier.toLowerCase()}" style="font-size:0.65rem;">
          ${v.status}
        </span>
      </div>
      <div class="queue-card-sig">Sig: ${v.signature.substring(0, 24)}...</div>
      <div style="font-size:0.68rem;color:var(--text-dim);display:flex;justify-content:space-between;margin-top:2px;">
        <span>${v.transferredToB ? '✓ Beamed via BLE' : '⏳ Ready to Tap/Beam'}</span>
        <span>${new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
      </div>
    `;
    el.outboxListA.appendChild(card);
  });
}

// Render Device B
function renderDeviceB() {
  if (el.balanceB) el.balanceB.textContent = `₹${state.deviceB.balance.toLocaleString('en-IN')}`;
  if (el.inboxCountBadge) el.inboxCountBadge.textContent = `${state.deviceB.inbox.length} Received`;
  el.inboxListB.innerHTML = '';

  if (state.deviceB.inbox.length === 0) {
    el.inboxListB.innerHTML = `<div style="color:var(--text-dim);font-size:0.75rem;padding:12px 0;text-align:center;">No received vouchers yet</div>`;
    return;
  }

  state.deviceB.inbox.forEach(v => {
    const card = document.createElement('div');
    card.className = `queue-card`;
    card.innerHTML = `
      <div class="queue-card-top">
        <span>₹${v.amount}</span>
        <span class="status-pill ${v.settled ? 'settled' : 'queued'}" style="font-size:0.65rem;">
          ${v.settled ? '✓ SETTLED' : (v.status || 'RECEIVED_OFFLINE')}
        </span>
      </div>
      <div class="queue-card-sig">From: ${v.payerId}</div>
      <div style="font-size:0.68rem;color:var(--text-dim);margin-top:2px;">
        ${v.upiRef ? `UPI: <strong style="color:var(--accent-teal)">${v.upiRef}</strong>` : (state.deviceB.network !== 'none' ? '⚡ Settling via UPI gateway...' : '⏳ Queued until internet connects')}
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
  el.tapBeamBtn.classList.add('pulse-active');

  // Transfer vouchers to Device B
  pendingVouchers.forEach(v => {
    v.transferredToB = true;
    if (!state.deviceB.inbox.some(b => b.voucherId === v.voucherId)) {
      state.deviceB.inbox.unshift({ ...v });
    }
  });

  renderDeviceA();
  renderDeviceB();

  showToast(`⚡ Bluetooth Beam: ${pendingVouchers.length} encrypted voucher(s) securely exchanged offline!`, 'success');

  // Check auto-settlement triggers
  triggerAutoSettlementCheck();
}

// Auto-Settlement Trigger Logic (Device B Online, Device A Online, or Device C Mesh Relay)
function triggerAutoSettlementCheck() {
  // Scenario 1: Device B is online
  if (state.deviceB.network !== 'none') {
    state.deviceB.inbox.forEach(v => {
      if (!v.settled && v.status !== 'SETTLING_NPCI') {
        settleVoucher(v);
      }
    });
    return;
  }

  // Scenario 2: Device A is online
  if (state.deviceA.network !== 'none') {
    state.deviceA.outbox.forEach(v => {
      if (!v.settled && v.status !== 'SETTLING_NPCI') {
        settleVoucher(v);
      }
    });
    return;
  }

  // Scenario 3: Device C (Mesh Relay Node) is In-Range and Online!
  if (state.deviceC.inRange && state.deviceC.online) {
    const unsettled = state.deviceB.inbox.filter(v => !v.settled && v.status !== 'SETTLING_NPCI');
    if (unsettled.length > 0) {
      showToast('🌐 Mesh Relay Active: Forwarding offline vouchers to NPCI via Chetan node!', 'info');
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

      // Update collections
      const outIdx = state.deviceA.outbox.findIndex(x => x.voucherId === voucher.voucherId);
      if (outIdx >= 0) state.deviceA.outbox[outIdx] = voucher;

      const inIdx = state.deviceB.inbox.findIndex(x => x.voucherId === voucher.voucherId);
      if (inIdx >= 0) state.deviceB.inbox[inIdx] = voucher;

      audio.playSuccess();
      showToast(`🎉 Settled via NPCI! UPI Ref: ${data.upiRef}`, 'success');

      fetchLedger();
      fetchStats();
    } else {
      audio.playError();
      voucher.status = data.transaction?.status || 'REJECTED';
      showToast(`Settlement alert: ${data.error}`, 'error');
      fetchLedger();
      fetchStats();
    }
  } catch (err) {
    console.warn('Gateway connection error during settlement:', err.message);
  } finally {
    renderDeviceA();
    renderDeviceB();
  }
}

// Fetch Global NPCI Ledger & Balances
async function fetchLedger() {
  try {
    const res = await fetch('/api/transactions');
    if (!res.ok) return;
    const data = await res.json();

    state.transactions = data.transactions || [];
    state.accounts = data.accounts || {};

    // Sync active account balances
    if (state.accounts[state.deviceA.id]) {
      state.deviceA.balance = state.accounts[state.deviceA.id].balance;
    }
    if (state.accounts[state.deviceB.id]) {
      state.deviceB.balance = state.accounts[state.deviceB.id].balance;
    }

    renderDeviceA();
    renderDeviceB();
    renderLedgerTable();
  } catch (e) {
    // Backend loading
  }
}

// Fetch Live Analytics Stats for Chart.js and Stat Cards
async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) return;
    const data = await res.json();

    if (data.success && data.stats) {
      state.stats = data.stats;
      updateStatCards(data.stats);
      updateCharts(data.stats);
      updateInsights(data.stats);
    }
  } catch (e) {
    console.warn('Failed to fetch analytics stats:', e);
  }
}

// Update Top 4 Stat Cards
function updateStatCards(stats) {
  if (el.statTotalTx) el.statTotalTx.textContent = stats.totalTransactions;
  if (el.statSettledAmount) el.statSettledAmount.textContent = `₹${stats.totalSettledAmount.toLocaleString('en-IN')}`;
  if (el.statOfflineRatio) el.statOfflineRatio.textContent = `${stats.offlineRatio}%`;
  if (el.ratioFill) el.ratioFill.style.width = `${stats.offlineRatio}%`;
  if (el.statAvgLatency) el.statAvgLatency.textContent = stats.avgSettlementTime;
}

// Update Session Insights Panel
function updateInsights(stats) {
  const metrics = stats.metrics || {};
  
  if (el.insightTamper) {
    el.insightTamper.textContent = `${metrics.fraudAttempts || 0} tampered vouchers intercepted. 100% cryptographic integrity guaranteed.`;
  }
  if (el.insightRelay) {
    el.insightRelay.textContent = `Mesh relay utilized ${metrics.relayForwardCount || 0} times. Decentralized hop routing active.`;
  }
  if (el.insightDoublespend) {
    el.insightDoublespend.textContent = `${metrics.doubleSpendAttempts || 0} double-spend replay attempts intercepted & blocked by Nonce engine.`;
  }
}

// Render Real-Time NPCI Ledger Table
function renderLedgerTable() {
  if (el.ledgerCount) el.ledgerCount.textContent = `${state.transactions.length} record(s)`;
  el.ledgerBody.innerHTML = '';

  if (state.transactions.length === 0) {
    el.ledgerBody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-dim);padding:24px;">No transactions recorded in NPCI ledger yet. Create an offline voucher above!</td></tr>`;
    return;
  }

  state.transactions.forEach(tx => {
    const tr = document.createElement('tr');

    let statusBadge = `<span class="status-pill queued">QUEUED</span>`;
    if (tx.status === 'SETTLED') {
      statusBadge = `<span class="status-pill settled">✓ SETTLED</span>`;
    } else if (tx.status === 'SETTLING_NPCI') {
      statusBadge = `<span class="status-pill settling">⚡ SETTLING</span>`;
    } else if (tx.status === 'BLOCKED') {
      statusBadge = `<span class="status-pill blocked">✕ BLOCKED (>₹2k)</span>`;
    } else if (tx.status === 'FAILED_FRAUD') {
      statusBadge = `<span class="status-pill fraud">🚫 FRAUD (TAMPERED)</span>`;
    } else if (tx.status === 'DUPLICATE_DOUBLE_SPEND') {
      statusBadge = `<span class="status-pill fraud">⚠️ REPLAY BLOCKED</span>`;
    }

    const timeFormatted = new Date(tx.settledAt || tx.createdAt || tx.timestamp).toLocaleTimeString();
    const payerName = (tx.payerId || 'unknown').split('@')[0];
    const receiverName = (tx.receiverId || 'unknown').split('@')[0];

    tr.innerHTML = `
      <td style="font-family:var(--font-mono);font-size:0.75rem;color:var(--accent-teal);">${tx.voucherId}</td>
      <td style="font-size:0.78rem;">${payerName} → ${receiverName}</td>
      <td style="font-weight:700;">₹${Number(tx.amount).toLocaleString('en-IN')}</td>
      <td>
        <span class="tier-badge ${tx.tier ? tx.tier.toLowerCase() : 'green'}" style="font-size:0.65rem;">
          ${tx.tier || 'GREEN'}
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

// Chart.js Live Graphs Initialization & Updates
function initCharts() {
  if (typeof Chart === 'undefined') return;

  // Chart 1: Volume Over Time (Line / Area Chart)
  const ctxVolume = document.getElementById('volumeChart');
  if (ctxVolume) {
    volumeChartInstance = new Chart(ctxVolume, {
      type: 'line',
      data: {
        labels: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'],
        datasets: [
          {
            label: 'Queued Offline',
            data: [2, 4, 3, 5, 4, 6, 4],
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 3
          },
          {
            label: 'Settled via UPI',
            data: [1, 3, 2, 4, 4, 5, 3],
            borderColor: '#00D9B5',
            backgroundColor: 'rgba(0, 217, 181, 0.15)',
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#64748b', font: { family: 'Inter', size: 10 } }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#64748b', font: { family: 'Inter', size: 10 } }
          }
        }
      }
    });
  }

  // Chart 2: Status Breakdown (Doughnut Chart)
  const ctxBreakdown = document.getElementById('breakdownChart');
  if (ctxBreakdown) {
    breakdownChartInstance = new Chart(ctxBreakdown, {
      type: 'doughnut',
      data: {
        labels: ['Settled', 'Pending', 'Blocked (>₹2k)', 'Fraud/Replay'],
        datasets: [{
          data: [4, 1, 1, 0],
          backgroundColor: ['#00D9B5', '#f59e0b', '#ef4444', '#8b5cf6'],
          borderWidth: 0,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#94a3b8', font: { family: 'Inter', size: 10 } }
          }
        },
        cutout: '70%'
      }
    });
  }

  // Mini Sparkline Initializations
  initSparklines();
}

function initSparklines() {
  const createMiniSparkline = (id, data, color) => {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.map((_, i) => i),
        datasets: [{
          data,
          borderColor: color,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4,
          fill: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } }
      }
    });
  };

  createMiniSparkline('sparkline-1', [3, 5, 4, 7, 8, 6, 9], '#00D9B5');
  createMiniSparkline('sparkline-2', [1000, 2500, 2000, 3500, 4800, 6000], '#38bdf8');
  createMiniSparkline('sparkline-3', [1.8, 1.6, 1.5, 1.4, 1.4], '#a855f7');
}

function updateCharts(stats) {
  if (volumeChartInstance && stats.chartVolume) {
    volumeChartInstance.data.labels = stats.chartVolume.labels;
    volumeChartInstance.data.datasets[0].data = stats.chartVolume.queued;
    volumeChartInstance.data.datasets[1].data = stats.chartVolume.settled;
    volumeChartInstance.update();
  }

  if (breakdownChartInstance && stats.chartBreakdown) {
    breakdownChartInstance.data.datasets[0].data = [
      stats.chartBreakdown.settled,
      stats.chartBreakdown.pending,
      stats.chartBreakdown.blocked,
      stats.chartBreakdown.fraud
    ];
    breakdownChartInstance.update();
  }
}

// Tamper Attack Simulation Trigger
async function simulateTamperedVoucher() {
  audio.playTap();
  showToast('🛠️ Injecting altered voucher payload (₹100 -> ₹10,000) to test NPCI tamper defense...', 'warning');

  const fraudulentVoucher = {
    voucherId: 'TAMPER-' + Date.now().toString(36).toUpperCase(),
    payerId: state.deviceA.id,
    receiverId: state.deviceB.id,
    amount: 10000, // Altered amount
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
    showToast(`🚨 Security Guard Intercepted Fraud: ${result.error}`, 'error');
    fetchLedger();
    fetchStats();
  } catch (err) {
    showToast('Failed to connect to backend endpoint', 'error');
  }
}

// Double-Spend Attack Simulation Trigger
async function simulateDoubleSpendAttack() {
  audio.playTap();
  showToast('🛠️ Simulating Double-Spend Replay: Re-submitting an already-settled voucher...', 'warning');

  const settledTx = state.transactions.find(t => t.status === 'SETTLED') || state.deviceA.outbox[0];

  if (!settledTx) {
    showToast('Generate and settle at least 1 voucher first before running double-spend test.', 'info');
    return;
  }

  try {
    const res = await fetch('/api/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settledTx)
    });
    const result = await res.json();
    
    if (res.status === 409) {
      audio.playError();
      showToast(`⚠️ Replay Attack Blocked: Nonce verification caught duplicate spend!`, 'warning');
    } else {
      showToast(`Response: ${result.message || result.error}`, 'info');
    }
    fetchLedger();
    fetchStats();
  } catch (e) {
    showToast('Failed to connect to backend', 'error');
  }
}

// Reset Demo State
async function resetDemo() {
  audio.playTap();
  try {
    await fetch('/api/reset', { method: 'POST' });
    state.deviceA.outbox = [];
    state.deviceB.inbox = [];
    state.deviceA.dailySpent = 0;
    updateSpendingMeter();
    renderDeviceA();
    renderDeviceB();
    fetchLedger();
    fetchStats();
    showToast('Demo accounts & ledger reset successfully', 'info');
  } catch (e) {
    showToast('Failed to reset demo', 'error');
  }
}

// Event Listeners Setup
function setupEvents() {
  // 3-State Network Signal Controls for Device A
  document.querySelectorAll('.sig-btn[data-device="a"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sig-btn[data-device="a"]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const sig = btn.getAttribute('data-signal');
      state.deviceA.network = sig;
      audio.playTap();

      if (sig === 'strong' || sig === 'weak') {
        el.deviceACard.classList.remove('offline-mode');
        el.deviceACard.classList.add('online-mode');
        el.islandTextA.textContent = sig === 'strong' ? 'Online (5G)' : 'Online (2G Edge)';
        el.signalIconA.textContent = sig === 'strong' ? '📶 5G' : '📶 2G';
        showToast(`Device A connected to network (${sig.toUpperCase()})`, 'success');
        triggerAutoSettlementCheck();
      } else {
        el.deviceACard.classList.add('offline-mode');
        el.deviceACard.classList.remove('online-mode');
        el.islandTextA.textContent = 'Offline Safe';
        el.signalIconA.textContent = '📵 Off';
        showToast('Device A switched to Offline / Airplane mode', 'info');
      }
    });
  });

  // 3-State Network Signal Controls for Device B
  document.querySelectorAll('.sig-btn[data-device="b"]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sig-btn[data-device="b"]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const sig = btn.getAttribute('data-signal');
      state.deviceB.network = sig;
      audio.playTap();

      if (sig === 'strong' || sig === 'weak') {
        el.deviceBCard.classList.remove('offline-mode');
        el.deviceBCard.classList.add('online-mode');
        el.islandTextB.textContent = sig === 'strong' ? 'Online (5G)' : 'Online (2G Edge)';
        el.signalIconB.textContent = sig === 'strong' ? '📶 5G' : '📶 2G';
        showToast(`Device B connected to network (${sig.toUpperCase()})`, 'success');
        triggerAutoSettlementCheck();
      } else {
        el.deviceBCard.classList.add('offline-mode');
        el.deviceBCard.classList.remove('online-mode');
        el.islandTextB.textContent = 'Offline Safe';
        el.signalIconB.textContent = '📵 Off';
        showToast('Device B switched to Offline / Airplane mode', 'info');
      }
    });
  });

  // User Selection Dropdowns
  el.userSelectA.addEventListener('change', (e) => {
    state.deviceA.id = e.target.value;
    const name = e.target.options[e.target.selectedIndex].text.split('(')[0].trim();
    state.deviceA.name = name;
    el.vpaA.textContent = state.deviceA.id.replace('@offpay', '@okaxis');
    initKeys();
    fetchLedger();
    showToast(`Switched Device A user to ${name}`, 'info');
  });

  el.userSelectB.addEventListener('change', (e) => {
    state.deviceB.id = e.target.value;
    const name = e.target.options[e.target.selectedIndex].text.split('(')[0].trim();
    state.deviceB.name = name;
    el.vpaB.textContent = state.deviceB.id.replace('@offpay', '@okhdfc');
    initKeys();
    fetchLedger();
    showToast(`Switched Device B user to ${name}`, 'info');
  });

  // Toggle C (Mesh Relay)
  el.toggleCOnline.addEventListener('change', (e) => {
    state.deviceC.online = e.target.checked;
    audio.playTap();
    el.relayStatusDot.className = `mesh-status-indicator ${state.deviceC.online && state.deviceC.inRange ? 'active' : ''}`;
    el.meshRelayBadge.innerHTML = state.deviceC.online && state.deviceC.inRange ? '<span>✓ Ready to relay packets</span>' : '<span style="color:var(--text-dim)">Relay node disconnected</span>';
    triggerAutoSettlementCheck();
  });

  el.toggleCRange.addEventListener('change', (e) => {
    state.deviceC.inRange = e.target.checked;
    audio.playTap();
    el.relayStatusDot.className = `mesh-status-indicator ${state.deviceC.online && state.deviceC.inRange ? 'active' : ''}`;
    el.meshRelayBadge.innerHTML = state.deviceC.online && state.deviceC.inRange ? '<span>✓ Ready to relay packets</span>' : '<span style="color:var(--text-dim)">Relay node out of range</span>';
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

  // Security Attack Triggers
  el.tamperBtn.addEventListener('click', simulateTamperedVoucher);
  el.doublespendBtn.addEventListener('click', simulateDoubleSpendAttack);

  // Reset Demo
  el.resetBtn.addEventListener('click', resetDemo);
}

// Initial Boot
async function startApp() {
  await initKeys();
  setupEvents();
  initCharts();
  updateSpendingMeter();
  renderDeviceA();
  renderDeviceB();
  fetchLedger();
  fetchStats();

  // Poll ledger and analytics every 1.5s
  setInterval(() => {
    fetchLedger();
    fetchStats();
  }, 1500);
}

window.addEventListener('DOMContentLoaded', startApp);
