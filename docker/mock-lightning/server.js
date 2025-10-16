/**
 * Mock Lightning Network Node
 * For development and testing only
 * Simulates Lightning payments without real Bitcoin
 */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// State
const invoices = new Map();
const payments = new Map();
let balance = parseInt(process.env.INITIAL_BALANCE || '10000000'); // 10M sats default

// =====================================================
// Utility Functions
// =====================================================

function generatePaymentHash() {
    return crypto.randomBytes(32).toString('hex');
}

function generatePreimage() {
    return crypto.randomBytes(32).toString('hex');
}

function generateInvoice(amountSats, memo = '') {
    const paymentHash = generatePaymentHash();
    const preimage = generatePreimage();
    const invoice = `lnbc${amountSats}n1mock${paymentHash.slice(0, 20)}`;

    invoices.set(paymentHash, {
        invoice,
        paymentHash,
        preimage,
        amountSats,
        memo,
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000, // 1 hour
    });

    return { invoice, paymentHash, preimage };
}

// =====================================================
// Health Check
// =====================================================

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'mock-lightning',
        network: process.env.NETWORK || 'regtest',
        balance,
        activeInvoices: invoices.size,
        completedPayments: payments.size,
    });
});

// =====================================================
// Node Info
// =====================================================

app.get('/info', (req, res) => {
    res.json({
        alias: 'Mock Lightning Node',
        identity_pubkey: '02' + crypto.randomBytes(32).toString('hex'),
        color: '#ff9900',
        num_active_channels: 5,
        num_peers: 3,
        block_height: 800000,
        block_hash: crypto.randomBytes(32).toString('hex'),
        synced_to_chain: true,
        synced_to_graph: true,
        testnet: true,
        chains: [{ chain: 'bitcoin', network: process.env.NETWORK || 'regtest' }],
        uris: [`02${crypto.randomBytes(32).toString('hex')}@localhost:9735`],
        version: '0.17.0-mock',
        commit_hash: 'mock',
        features: {},
    });
});

// =====================================================
// Balance
// =====================================================

app.get('/balance', (req, res) => {
    res.json({
        balance,
        pending_balance: 0,
        unit: 'sats',
    });
});

// =====================================================
// Create Invoice
// =====================================================

app.post('/invoice', (req, res) => {
    const { amount, memo, expiry } = req.body;

    if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
    }

    const { invoice, paymentHash, preimage } = generateInvoice(amount, memo);

    console.log(`[Mock Lightning] Created invoice: ${paymentHash.slice(0, 8)}... for ${amount} sats`);

    res.json({
        invoice,
        payment_hash: paymentHash,
        payment_request: invoice,
        expires_at: Date.now() + (expiry || 3600) * 1000,
    });
});

// =====================================================
// Create Hodl Invoice (for trustless streaming)
// =====================================================

app.post('/invoice/hodl', (req, res) => {
    const { amount, hash, memo } = req.body;

    if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
    }

    const paymentHash = hash || generatePaymentHash();
    const invoice = `lnbc${amount}n1hodl${paymentHash.slice(0, 20)}`;

    invoices.set(paymentHash, {
        invoice,
        paymentHash,
        preimage: null, // Hodl invoice - preimage provided later
        amountSats: amount,
        memo,
        status: 'pending',
        type: 'hodl',
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
    });

    console.log(`[Mock Lightning] Created hodl invoice: ${paymentHash.slice(0, 8)}... for ${amount} sats`);

    res.json({
        invoice,
        payment_hash: paymentHash,
        payment_request: invoice,
    });
});

// =====================================================
// Settle Hodl Invoice
// =====================================================

app.post('/invoice/settle', (req, res) => {
    const { payment_hash, preimage } = req.body;

    const invoice = invoices.get(payment_hash);
    if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.status !== 'pending') {
        return res.status(400).json({ error: 'Invoice already settled or cancelled' });
    }

    invoice.status = 'settled';
    invoice.preimage = preimage || generatePreimage();
    invoice.settledAt = Date.now();

    balance += invoice.amountSats;

    console.log(`[Mock Lightning] Settled hodl invoice: ${payment_hash.slice(0, 8)}...`);

    res.json({
        settled: true,
        preimage: invoice.preimage,
        amount: invoice.amountSats,
    });
});

// =====================================================
// Cancel Hodl Invoice
// =====================================================

app.post('/invoice/cancel', (req, res) => {
    const { payment_hash } = req.body;

    const invoice = invoices.get(payment_hash);
    if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.status !== 'pending') {
        return res.status(400).json({ error: 'Invoice already settled or cancelled' });
    }

    invoice.status = 'cancelled';
    invoice.cancelledAt = Date.now();

    console.log(`[Mock Lightning] Cancelled hodl invoice: ${payment_hash.slice(0, 8)}...`);

    res.json({
        cancelled: true,
    });
});

// =====================================================
// Check Invoice Status
// =====================================================

app.get('/invoice/:payment_hash', (req, res) => {
    const { payment_hash } = req.params;

    const invoice = invoices.get(payment_hash);
    if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json({
        payment_hash: invoice.paymentHash,
        invoice: invoice.invoice,
        amount: invoice.amountSats,
        memo: invoice.memo,
        status: invoice.status,
        settled: invoice.status === 'settled',
        preimage: invoice.preimage,
        created_at: invoice.createdAt,
        expires_at: invoice.expiresAt,
        settled_at: invoice.settledAt,
    });
});

// =====================================================
// Pay Invoice (Simulate outgoing payment)
// =====================================================

app.post('/pay', (req, res) => {
    const { invoice, amount } = req.body;

    if (!invoice) {
        return res.status(400).json({ error: 'Invoice required' });
    }

    // Extract amount from invoice or use provided amount
    const paymentAmount = amount || 1000; // Default 1000 sats for mock

    if (balance < paymentAmount) {
        return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Simulate payment
    const paymentHash = generatePaymentHash();
    const preimage = generatePreimage();

    balance -= paymentAmount;

    payments.set(paymentHash, {
        invoice,
        paymentHash,
        preimage,
        amount: paymentAmount,
        status: 'succeeded',
        paidAt: Date.now(),
    });

    console.log(`[Mock Lightning] Paid invoice for ${paymentAmount} sats`);

    res.json({
        success: true,
        payment_hash: paymentHash,
        preimage,
        amount: paymentAmount,
        fee: 0, // No fees in mock
        status: 'succeeded',
    });
});

// =====================================================
// Payment Status
// =====================================================

app.get('/payment/:payment_hash', (req, res) => {
    const { payment_hash } = req.params;

    const payment = payments.get(payment_hash);
    if (!payment) {
        return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(payment);
});

// =====================================================
// List Invoices
// =====================================================

app.get('/invoices', (req, res) => {
    const { status, limit = 100 } = req.query;

    let invoiceList = Array.from(invoices.values());

    if (status) {
        invoiceList = invoiceList.filter(inv => inv.status === status);
    }

    invoiceList = invoiceList
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, parseInt(limit));

    res.json({
        invoices: invoiceList,
        total: invoiceList.length,
    });
});

// =====================================================
// List Payments
// =====================================================

app.get('/payments', (req, res) => {
    const { limit = 100 } = req.query;

    const paymentList = Array.from(payments.values())
        .sort((a, b) => b.paidAt - a.paidAt)
        .slice(0, parseInt(limit));

    res.json({
        payments: paymentList,
        total: paymentList.length,
    });
});

// =====================================================
// Reset (Development Helper)
// =====================================================

app.post('/reset', (req, res) => {
    invoices.clear();
    payments.clear();
    balance = parseInt(process.env.INITIAL_BALANCE || '10000000');

    console.log('[Mock Lightning] State reset');

    res.json({
        reset: true,
        balance,
    });
});

// =====================================================
// Start Server
// =====================================================

const PORT = process.env.PORT || 8080;

app.listen(PORT, '0.0.0.0', () => {
    console.log('========================================');
    console.log('Mock Lightning Network Node');
    console.log('========================================');
    console.log(`Network: ${process.env.NETWORK || 'regtest'}`);
    console.log(`Balance: ${balance.toLocaleString()} sats`);
    console.log(`REST API: http://localhost:${PORT}`);
    console.log('========================================');
    console.log('⚠️  FOR DEVELOPMENT USE ONLY');
    console.log('⚠️  NOT FOR PRODUCTION');
    console.log('========================================\n');
});

// =====================================================
// Cleanup on exit
// =====================================================

process.on('SIGTERM', () => {
    console.log('[Mock Lightning] Shutting down gracefully...');
    process.exit(0);
});
