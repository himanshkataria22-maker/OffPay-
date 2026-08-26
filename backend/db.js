const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data', 'db.json');

// Default initial state
const defaultState = {
  accounts: {
    'user-a@offpay': { name: 'Aarav Sharma (Device A)', balance: 10000, upiVpa: 'aarav@okaxis' },
    'user-b@offpay': { name: 'Bhavna Patel (Device B)', balance: 3500, upiVpa: 'bhavna@okhdfc' },
    'relay-c@offpay': { name: 'Chetan (Mesh Relay C)', balance: 1200, upiVpa: 'chetan@oksbi' }
  },
  transactions: [],
  settlementLog: []
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
    return [...db.transactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  getTransactionById(voucherId) {
    return db.transactions.find(t => t.voucherId === voucherId);
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

  resetAll() {
    db = JSON.parse(JSON.stringify(defaultState));
    saveDB();
    return db;
  }
};
