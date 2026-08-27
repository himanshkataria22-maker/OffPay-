const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data', 'db.json');

// Default initial state with multiple hardcoded users
const defaultState = {
  accounts: {
    'rahul@offpay': { name: 'Rahul Sharma (Device A)', balance: 10000, upiVpa: 'rahul@okaxis', avatar: 'RS' },
    'priya@offpay': { name: 'Priya Patel (Device B)', balance: 5000, upiVpa: 'priya@okhdfc', avatar: 'PP' },
    'aarav@offpay': { name: 'Aarav Verma (Device A/B)', balance: 7500, upiVpa: 'aarav@okicici', avatar: 'AV' },
    'chetan@offpay': { name: 'Chetan (Mesh Relay C)', balance: 1500, upiVpa: 'chetan@oksbi', avatar: 'CR' }
  },
  transactions: [],
  settledNonces: {}, // Map of nonce -> voucherId for double-spend detection
  metrics: {
    totalSettledAmount: 0,
    blockedAttempts: 0,
    fraudAttempts: 0,
    doubleSpendAttempts: 0,
    relayForwardCount: 0
  }
};

let db = { ...defaultState };

function initDB() {
  try {
    const dataDir = path.dirname(DB_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf8');
      db = JSON.parse(content);
      // Ensure accounts format is up to date
      if (!db.accounts || !db.accounts['rahul@offpay']) {
        db.accounts = { ...defaultState.accounts, ...(db.accounts || {}) };
      }
      if (!db.settledNonces) db.settledNonces = {};
      if (!db.metrics) db.metrics = { ...defaultState.metrics };
    } else {
      saveDB();
    }
  } catch (err) {
    console.warn('[DB] Using in-memory store due to file access note:', err.message);
  }
}

function saveDB() {
  try {
    const dataDir = path.dirname(DB_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('[DB] Failed to persist:', err.message);
  }
}

initDB();

module.exports = {
  getTransactions() {
    return [...db.transactions].sort((a, b) => new Date(b.createdAt || b.timestamp) - new Date(a.createdAt || a.timestamp));
  },

  getTransactionById(voucherId) {
    return db.transactions.find(t => t.voucherId === voucherId);
  },

  isNonceUsed(nonce) {
    return !!db.settledNonces[nonce];
  },

  recordNonce(nonce, voucherId) {
    db.settledNonces[nonce] = { voucherId, settledAt: new Date().toISOString() };
    saveDB();
  },

  saveTransaction(tx) {
    const existingIndex = db.transactions.findIndex(t => t.voucherId === tx.voucherId);
    if (existingIndex >= 0) {
      db.transactions[existingIndex] = { ...db.transactions[existingIndex], ...tx, updatedAt: new Date().toISOString() };
    } else {
      db.transactions.push({
        ...tx,
        createdAt: tx.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    saveDB();
    return tx;
  },

  updateTransactionStatus(voucherId, status, extra = {}) {
    const tx = db.transactions.find(t => t.voucherId === voucherId);
    if (tx) {
      tx.status = status;
      Object.assign(tx, extra);
      tx.updatedAt = new Date().toISOString();
      saveDB();
      return tx;
    }
    return null;
  },

  getAccounts() {
    return db.accounts;
  },

  getAccount(id) {
    return db.accounts[id] || null;
  },

  updateAccountBalance(id, delta) {
    if (db.accounts[id]) {
      db.accounts[id].balance += delta;
      saveDB();
      return db.accounts[id];
    }
    return null;
  },

  getMetrics() {
    return db.metrics;
  },

  incrementMetric(metricName) {
    if (db.metrics[metricName] !== undefined) {
      db.metrics[metricName]++;
      saveDB();
    }
  },

  resetAll() {
    db = JSON.parse(JSON.stringify(defaultState));
    saveDB();
    return db;
  }
};

