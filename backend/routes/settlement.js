const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const { verifyVoucherSignature } = require('../utils/crypto');

/**
 * Generates a mock UPI Reference ID formatted like NPCI gateway responses
 * e.g., UPI-TXN-20260826998241
 */
function generateMockUpiRef() {
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 12);
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  return `UPI-NPCI-${timestamp}-${randomSuffix}`;
}

/**
 * GET /api/transactions
 * Returns the current ledger of all vouchers
 */
router.get('/transactions', (req, res) => {
  const transactions = db.getTransactions();
  const accounts = db.getAccounts();
  res.json({
    success: true,
    count: transactions.length,
    transactions,
    accounts
  });
});

/**
 * GET /api/accounts
 * Returns mock bank balances
 */
router.get('/accounts', (req, res) => {
  res.json({
    success: true,
    accounts: db.getAccounts()
  });
});

/**
 * POST /api/settle
 * Settles an offline voucher once connectivity is available
 */
router.post('/settle', async (req, res) => {
  const voucher = req.body;

  if (!voucher || !voucher.voucherId || !voucher.amount) {
    return res.status(400).json({
      success: false,
      error: 'Invalid voucher payload format'
    });
  }

  const { voucherId, payerId, receiverId, amount, tier, relayNode } = voucher;

  // 1. Check if already settled
  const existing = db.getTransactionById(voucherId);
  if (existing && existing.status === 'SETTLED') {
    return res.json({
      success: true,
      message: 'Voucher was already settled',
      transaction: existing
    });
  }

  // 2. Trust Tier Verification
  const numAmount = Number(amount);
  if (numAmount > 2000) {
    // Red tier - Should never be generated offline
    const blockedTx = {
      ...voucher,
      status: 'BLOCKED',
      rejectionReason: 'Exceeds offline transaction limit (Tier Red > ₹2,000). Must be executed online.',
      settledAt: new Date().toISOString()
    };
    db.saveTransaction(blockedTx);
    return res.status(403).json({
      success: false,
      error: 'Transaction blocked: Offline vouchers cannot exceed ₹2,000',
      transaction: blockedTx
    });
  }

  // 3. Cryptographic Signature Verification
  const verification = verifyVoucherSignature(voucher);
  if (!verification.valid) {
    const fraudTx = {
      ...voucher,
      status: 'FAILED_FRAUD',
      rejectionReason: `Security verification failed: ${verification.error}`,
      settledAt: new Date().toISOString()
    };
    db.saveTransaction(fraudTx);
    return res.status(401).json({
      success: false,
      error: `Cryptographic Signature Invalid: ${verification.error}`,
      transaction: fraudTx
    });
  }

  // 4. Record as processing in ledger
  db.saveTransaction({
    ...voucher,
    status: 'SETTLING_NPCI',
    receivedAt: new Date().toISOString(),
    relayNode: relayNode || 'DIRECT'
  });

  // 5. Simulate 1.5s NPCI payment gateway delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  // 6. Generate UPI Reference & Update Balances
  const upiRef = generateMockUpiRef();
  const payerAccount = db.getAccount(payerId);

  // Check balance
  if (payerAccount && payerAccount.balance < numAmount) {
    const failedTx = db.updateTransactionStatus(voucherId, 'FAILED_INSUFFICIENT_FUNDS', {
      rejectionReason: 'Insufficient account balance at bank during settlement',
      settledAt: new Date().toISOString()
    });
    return res.status(400).json({
      success: false,
      error: 'Insufficient funds during NPCI settlement',
      transaction: failedTx
    });
  }

  // Deduct & credit
  db.updateAccountBalance(payerId, -numAmount);
  db.updateAccountBalance(receiverId, numAmount);

  // Mark settled
  const settledTx = db.updateTransactionStatus(voucherId, 'SETTLED', {
    upiRef,
    settledAt: new Date().toISOString(),
    npciStatus: 'SUCCESS',
    relayPath: relayNode ? `Payer (${payerId}) -> Mesh Relay (${relayNode}) -> NPCI Gateway` : `Payer (${payerId}) -> Receiver (${receiverId}) -> NPCI Gateway`
  });

  console.log(`[SETTLEMENT] Voucher ${voucherId} settled with UPI Ref: ${upiRef} for ₹${amount}`);

  return res.json({
    success: true,
    message: 'Voucher successfully settled via UPI Gateway',
    upiRef,
    transaction: settledTx,
    accounts: db.getAccounts()
  });
});

/**
 * POST /api/reset
 * Resets the demo ledger and bank balances
 */
router.post('/reset', (req, res) => {
  const freshDB = db.resetAll();
  res.json({
    success: true,
    message: 'Ledger and account balances reset to initial state',
    accounts: freshDB.accounts,
    transactions: freshDB.transactions
  });
});

module.exports = router;
