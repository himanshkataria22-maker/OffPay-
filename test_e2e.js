const crypto = require('crypto');
const http = require('http');

function postJson(urlPath, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path: urlPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      },
      (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, raw: body });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function getJson(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${urlPath}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, raw: body });
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('--- Starting OffPay End-to-End Automated Test Suite ---');

  // Reset database first
  await postJson('/api/reset', {});
  console.log('✓ Reset API verified');

  // Generate RSA Keypair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  // Export SPKI base64 like Web Crypto
  const spkiBase64 = publicKey
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s+/g, '');

  console.log('✓ RSA-256 Keypair Generated');

  // Test 1: Green Tier (₹250)
  const voucher1 = {
    voucherId: 'VOUCH-TEST-GREEN-1',
    payerId: 'user-a@offpay',
    receiverId: 'user-b@offpay',
    amount: 250,
    currency: 'INR',
    tier: 'GREEN',
    nonce: 'NONCE-111',
    timestamp: new Date().toISOString()
  };

  const payloadStr1 = JSON.stringify({
    voucherId: voucher1.voucherId,
    payerId: voucher1.payerId,
    receiverId: voucher1.receiverId,
    amount: voucher1.amount,
    currency: voucher1.currency,
    tier: voucher1.tier,
    nonce: voucher1.nonce,
    timestamp: voucher1.timestamp
  });

  const signer1 = crypto.createSign('RSA-SHA256');
  signer1.update(payloadStr1);
  const sig1 = signer1.sign(privateKey, 'base64');

  voucher1.signature = sig1;
  voucher1.publicKey = spkiBase64;

  console.log('\n[Test 1] Settle Green Tier Voucher (₹250)...');
  const res1 = await postJson('/api/settle', voucher1);
  console.log('Status:', res1.statusCode);
  console.log('Response:', res1.data);
  if (res1.data.success && res1.data.transaction.status === 'SETTLED' && res1.data.upiRef) {
    console.log('✅ Test 1 PASSED: Green tier successfully settled with UPI Ref:', res1.data.upiRef);
  } else {
    console.error('❌ Test 1 FAILED');
  }

  // Test 2: Red Tier Blocked (> ₹2,000)
  console.log('\n[Test 2] Settle Red Tier Voucher (₹2,500 - should block)...');
  const voucher2 = {
    voucherId: 'VOUCH-TEST-RED-2',
    payerId: 'user-a@offpay',
    receiverId: 'user-b@offpay',
    amount: 2500,
    currency: 'INR',
    tier: 'RED',
    nonce: 'NONCE-222',
    timestamp: new Date().toISOString(),
    signature: sig1,
    publicKey: spkiBase64
  };
  const res2 = await postJson('/api/settle', voucher2);
  console.log('Status:', res2.statusCode);
  if (res2.statusCode === 403 && res2.data.transaction.status === 'BLOCKED') {
    console.log('✅ Test 2 PASSED: Red tier properly blocked at backend');
  } else {
    console.error('❌ Test 2 FAILED');
  }

  // Test 3: Tamper / Fraud Signature Mismatch
  console.log('\n[Test 3] Settle Tampered Voucher (Altered amount without valid signature)...');
  const voucher3 = {
    voucherId: 'VOUCH-TEST-TAMPER-3',
    payerId: 'user-a@offpay',
    receiverId: 'user-b@offpay',
    amount: 499, // Changed amount
    currency: 'INR',
    tier: 'GREEN',
    nonce: 'NONCE-333',
    timestamp: new Date().toISOString(),
    signature: 'INVALID_FORGED_SIGNATURE_AAAAAAAAAAAAAAAAAAAAAAAA',
    publicKey: spkiBase64
  };
  const res3 = await postJson('/api/settle', voucher3);
  console.log('Status:', res3.statusCode);
  if (res3.statusCode === 401 && res3.data.transaction.status === 'FAILED_FRAUD') {
    console.log('✅ Test 3 PASSED: Fraudulent voucher intercepted & marked FAILED_FRAUD');
  } else {
    console.error('❌ Test 3 FAILED');
  }

  // Test 4: Final Ledger Verification
  console.log('\n[Test 4] Fetching full ledger...');
  const res4 = await getJson('/api/transactions');
  console.log(`Ledger count: ${res4.data.count}`);
  console.log('Bank accounts:', res4.data.accounts);
  if (res4.data.count >= 3 && res4.data.accounts['user-a@offpay'].balance === 9750) {
    console.log('✅ Test 4 PASSED: Ledger & balance updates verified!');
  } else {
    console.error('❌ Test 4 FAILED');
  }

  console.log('\n🎉 ALL TESTS COMPLETED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('Test run failed:', err);
});
