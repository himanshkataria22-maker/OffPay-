const express = require('express');
const cors = require('cors');
const path = require('path');
const settlementRoutes = require('./routes/settlement');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api', settlementRoutes);

// Serve Frontend static assets
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// Fallback to index.html for SPA routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(frontendPath, 'index.html'));
  }
});

app.listen(PORT, () => {
  console.log('====================================================');
  console.log(`  🚀 OffPay Server running at: http://localhost:${PORT}`);
  console.log(`  📱 Dual-Device Simulator:   http://localhost:${PORT}`);
  console.log(`  ⚡ API Health Check:        http://localhost:${PORT}/api/transactions`);
  console.log('====================================================');
});
