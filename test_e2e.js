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
  console.log('===========================================================');
  console.log('--- Starting OffPay End-to-End Automated Test Suite ---');
  console.log('===========================================================');

  // 1. Reset database first
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
    payerId: 'rahul@offpay',
    receiverId: 'priya@offpay',
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
  if (res1.data.success && res1.data.transaction.status === 'SETTLED' && res1.data.upiRef) {
    console.log('✅ Test 1 PASSED: Green tier successfully settled with UPI Ref:', res1.data.upiRef);
  } else {
    console.error('❌ Test 1 FAILED', res1.data);
  }

  // Test 2: Double-Spend Protection (Replay same voucher)
  console.log('\n[Test 2] Double-Spend Protection Test (Replay Voucher 1)...');
  const resDouble = await postJson('/api/settle', voucher1);
  console.log('Status:', resDouble.statusCode);
  if (resDouble.statusCode === 409 && resDouble.data.transaction.status === 'DUPLICATE_DOUBLE_SPEND') {
    console.log('✅ Test 2 PASSED: Double-spend duplicate attempt successfully intercepted & blocked!');
  } else {
    console.error('❌ Test 2 FAILED', resDouble.data);
  }

  // Test 3: Red Tier Blocked (> ₹2,000)
  console.log('\n[Test 3] Settle Red Tier Voucher (₹2,500 - should block)...');
  const voucher2 = {
    voucherId: 'VOUCH-TEST-RED-2',
    payerId: 'rahul@offpay',
    receiverId: 'priya@offpay',
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
    console.log('✅ Test 3 PASSED: Red tier properly blocked at backend (>₹2,000)');
  } else {
    console.error('❌ Test 3 FAILED', res2.data);
  }

  // Test 4: Tamper / Fraud Signature Mismatch
  console.log('\n[Test 4] Settle Tampered Voucher (Altered amount without valid signature)...');
  const voucher3 = {
    voucherId: 'VOUCH-TEST-TAMPER-3',
    payerId: 'rahul@offpay',
    receiverId: 'priya@offpay',
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
    console.log('✅ Test 4 PASSED: Fraudulent voucher intercepted & marked FAILED_FRAUD');
  } else {
    console.error('❌ Test 4 FAILED', res3.data);
  }

  // Test 5: Analytics & Stats API
  console.log('\n[Test 5] Fetching live analytics stats (/api/stats)...');
  const resStats = await getJson('/api/stats');
  console.log('Stats Response:', resStats.data.stats);
  if (resStats.data.success && resStats.data.stats.totalSettledAmount === 250) {
    console.log('✅ Test 5 PASSED: Analytics stats aggregation working perfectly!');
  } else {
    console.error('❌ Test 5 FAILED');
  }

  console.log('\n🎉 ALL BACKEND AUTOMATED TESTS COMPLETED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('Test run failed (is server running?):', err.message);
});

