const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const { verifyVoucherSignature } = require('../utils/crypto');

/**
 * Generates a realistic mock UPI Reference ID formatted like NPCI gateway responses
 * e.g., UPI/523910283921/AXIS/OK
 */
function generateMockUpiRef(bank = 'AXIS') {
  const randomRrn = Math.floor(100000000000 + Math.random() * 900000000000);
  return `UPI/${randomRrn}/${bank}/OK`;
}

/**
 * GET /api/transactions
 * Returns the current ledger of all vouchers & accounts
 */
router.get('/transactions', (req, res) => {
  const transactions = db.getTransactions();
  const accounts = db.getAccounts();
  const metrics = db.getMetrics();
  res.json({
    success: true,
    count: transactions.length,
    transactions,
    accounts,
    metrics
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
 * GET /api/stats
 * Aggregated analytics for live fintech dashboard & Chart.js graphs
 */
router.get('/stats', (req, res) => {
  const txs = db.getTransactions();
  const metrics = db.getMetrics();
  
  const totalCount = txs.length;
  const settledTxs = txs.filter(t => t.status === 'SETTLED');
  const settledAmount = settledTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const blockedTxs = txs.filter(t => t.status === 'BLOCKED' || t.status === 'FAILED_FRAUD' || t.status === 'DUPLICATE_DOUBLE_SPEND');
  const pendingTxs = txs.filter(t => t.status === 'QUEUED' || t.status === 'SETTLING_NPCI' || t.status === 'PENDING_OFFLINE');

  // Time series data (last 7 intervals or mock trend if sparse)
  const timeBuckets = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'];
  const queuedSeries = [2, 4, 3, 5, 4, 6, txs.length];
  const settledSeries = [1, 3, 2, 4, 4, 5, settledTxs.length];

  res.json({
    success: true,
    stats: {
      totalTransactions: totalCount,
      totalSettledAmount: settledAmount,
      settledCount: settledTxs.length,
      blockedCount: blockedTxs.length,
      pendingCount: pendingTxs.length,
      avgSettlementTime: '1.4s',
      offlineRatio: totalCount > 0 ? Math.round(((txs.filter(t => t.offlineOrigin !== false).length) / totalCount) * 100) : 85,
      chartVolume: {
        labels: timeBuckets,
        queued: queuedSeries,
        settled: settledSeries
      },
      chartBreakdown: {
        settled: settledTxs.length,
        pending: pendingTxs.length,
        blocked: blockedTxs.length,
        fraud: metrics.fraudAttempts + metrics.doubleSpendAttempts
      },
      metrics
    }
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

  const { voucherId, payerId, receiverId, amount, tier, nonce, relayNode } = voucher;

  // 1. Double-Spend Protection (Check voucher ID and cryptographic nonce)
  const existing = db.getTransactionById(voucherId);
  const nonceUsed = nonce ? db.isNonceUsed(nonce) : false;

  if ((existing && existing.status === 'SETTLED') || (nonceUsed && db.settledNonces[nonce]?.voucherId !== voucherId)) {
    db.incrementMetric('doubleSpendAttempts');
    const doubleSpendAttempt = {
      ...voucher,
      originalVoucherId: voucherId,
      voucherId: `${voucherId}-REPLAY-${Date.now().toString(36)}`,
      status: 'DUPLICATE_DOUBLE_SPEND',
      rejectionReason: `⚠️ Double-spend attack blocked! Original Voucher ID '${voucherId}' was already executed and settled on the UPI ledger.`,
      settledAt: new Date().toISOString()
    };
    db.saveTransaction(doubleSpendAttempt);

    return res.status(409).json({
      success: false,
      error: `⚠️ Duplicate transaction blocked: Voucher ${voucherId} has already been settled on UPI ledger.`,
      transaction: doubleSpendAttempt
    });
  }

  // 2. Trust Tier Verification
  const numAmount = Number(amount);
  if (numAmount > 2000) {
    db.incrementMetric('blockedAttempts');
    const blockedTx = {
      ...voucher,
      status: 'BLOCKED',
      rejectionReason: 'Exceeds offline transaction limit (Tier Red > ₹2,000). Active online authentication required.',
      settledAt: new Date().toISOString()
    };
    db.saveTransaction(blockedTx);
    return res.status(403).json({
      success: false,
      error: 'Transaction blocked: Offline vouchers cannot exceed ₹2,000 (Red Tier policy)',
      transaction: blockedTx
    });
  }

  // 3. Cryptographic Signature Verification
  const verification = verifyVoucherSignature(voucher);
  if (!verification.valid) {
    db.incrementMetric('fraudAttempts');
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

  // Record mesh relay metric if relayed
  if (relayNode && relayNode !== 'DIRECT') {
    db.incrementMetric('relayForwardCount');
  }

  // 4. Record as processing in ledger
  db.saveTransaction({
    ...voucher,
    status: 'SETTLING_NPCI',
    receivedAt: new Date().toISOString(),
    relayNode: relayNode || 'DIRECT'
  });

  // 5. Simulate 1.2s NPCI payment gateway delay
  await new Promise(resolve => setTimeout(resolve, 1200));

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

  // Deduct & credit accounts
  db.updateAccountBalance(payerId, -numAmount);
  db.updateAccountBalance(receiverId, numAmount);

  // Record nonce to prevent replay
  if (nonce) {
    db.recordNonce(nonce, voucherId);
  }

  // Mark settled
  const settledTx = db.updateTransactionStatus(voucherId, 'SETTLED', {
    upiRef,
    settledAt: new Date().toISOString(),
    npciStatus: 'SUCCESS',
    relayPath: relayNode && relayNode !== 'DIRECT' ? `Payer (${payerId}) -> Mesh Relay (${relayNode}) -> NPCI Gateway` : `Payer (${payerId}) -> Receiver (${receiverId}) -> NPCI Gateway`
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
    transactions: freshDB.transactions,
    metrics: freshDB.metrics
  });
});

module.exports = router;

