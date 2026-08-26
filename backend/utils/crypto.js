const crypto = require('crypto');

/**
 * Normalizes an SPKI base64 string or public key into PEM format
 * @param {string} spkiBase64
 * @returns {string} PEM formatted public key
 */
function spkiToPem(spkiBase64) {
  if (spkiBase64.includes('-----BEGIN PUBLIC KEY-----')) {
    return spkiBase64;
  }
  const cleanKey = spkiBase64.replace(/\s+/g, '');
  const lines = cleanKey.match(/.{1,64}/g) || [];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----\n`;
}

/**
 * Creates canonical string representation of voucher for signing/verification
 * @param {Object} voucher
 * @returns {string} Canonical JSON payload string
 */
function getCanonicalPayload(voucher) {
  return JSON.stringify({
    voucherId: voucher.voucherId,
    payerId: voucher.payerId,
    receiverId: voucher.receiverId,
    amount: Number(voucher.amount),
    currency: voucher.currency || 'INR',
    tier: voucher.tier,
    nonce: voucher.nonce,
    timestamp: voucher.timestamp
  });
}

/**
 * Verifies the digital signature of a voucher
 * @param {Object} voucher
 * @returns {{ valid: boolean, error?: string }}
 */
function verifyVoucherSignature(voucher) {
  try {
    if (!voucher || !voucher.signature || !voucher.publicKey) {
      return { valid: false, error: 'Missing signature or public key' };
    }

    const payload = getCanonicalPayload(voucher);
    const pemKey = spkiToPem(voucher.publicKey);
    const signatureBuffer = Buffer.from(voucher.signature, 'base64');

    // Verify using RSA-SHA256
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(payload);
    const isVerified = verifier.verify(pemKey, signatureBuffer);

    if (!isVerified) {
      return { valid: false, error: 'Cryptographic signature mismatch (tampering detected)' };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, error: `Verification failed: ${err.message}` };
  }
}

module.exports = {
  verifyVoucherSignature,
  getCanonicalPayload,
  spkiToPem
};
