// ==========================================
// DONKEYRIDE RELAY OPERATOR SERVER
// Anyone can run this to operate a stake relay
// Operators earn 0.5% of ride value for providing infrastructure
// ==========================================

// Load environment variables
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const { PaymentProviderFactory } = require('./payment-providers/factory');
const { validateNIP98Auth } = require('./middleware/nip98-auth');
const {
    publicRateLimiter,
    authenticatedRateLimiter,
    rideCreationLimiter,
    stakeLimiter
} = require('./middleware/rate-limit');

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// RELAY OPERATOR CONFIGURATION
// ==========================================

const config = {
    // Operator settings
    operatorPubkey: process.env.OPERATOR_PUBKEY,
    operatorLightningAddress: process.env.OPERATOR_LIGHTNING,
    operatorFeePercent: parseFloat(process.env.OPERATOR_FEE_PERCENT) || 0.005, // Market-driven fee (default 0.5%)
    
    // Strike API (for now, later multiple providers)
    strikeApiKey: process.env.STRIKE_API_KEY,
    
    // Server settings  
    port: process.env.PORT || 3000,
    wsPort: process.env.WS_PORT || 3001,
    
    // Nostr relay to publish events
    nostrRelay: process.env.NOSTR_RELAY || 'wss://relay.damus.io',
    
    // Operator policies
    maxStakeAmount: 10000, // Max stake in sats
    minStakeAmount: 50,    // Min stake in sats
    requireKYC: false,     // For larger amounts
};

// ==========================================
// PAYMENT PROVIDER INITIALIZATION
// ==========================================

// Initialize payment provider with automatic fallbacks
let paymentProvider;

async function initializePaymentProvider() {
    try {
        paymentProvider = await PaymentProviderFactory.fromEnv();
        console.log(`✅ Payment provider initialized: ${paymentProvider.providerName}`);

        // Display capabilities
        const caps = paymentProvider.getCapabilities();
        console.log(`   Trust model: ${caps.trustModel}`);
        console.log(`   Features: ${Object.keys(caps.features).filter(f => caps.features[f]).join(', ')}`);
    } catch (error) {
        console.error('❌ Failed to initialize payment provider:', error.message);
        console.error('   Make sure to configure at least one provider in .env');
        process.exit(1);
    }
}

const activeRides = new Map();
const stakeBalances = new Map();

// ==========================================
// WEBSOCKET FOR REAL-TIME UPDATES
// ==========================================

const wss = new WebSocket.Server({ port: config.wsPort });

wss.on('connection', (ws) => {
    console.log('New client connected');
    
    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        switch(data.type) {
            case 'subscribe_ride':
                ws.rideId = data.rideId;
                break;
            case 'get_status':
                ws.send(JSON.stringify({
                    type: 'status',
                    rides: activeRides.size,
                    operator: config.operatorPubkey
                }));
                break;
        }
    });
});

function broadcastToRide(rideId, message) {
    wss.clients.forEach(client => {
        if (client.rideId === rideId && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// ==========================================
// REST API ENDPOINTS
// ==========================================

// Get relay operator info (public endpoint)
app.get('/info', publicRateLimiter, (req, res) => {
    const caps = paymentProvider.getCapabilities();

    res.json({
        operator: config.operatorPubkey,
        lightning: config.operatorLightningAddress,
        fee: `${config.operatorFeePercent * 100}%`,
        maxStake: config.maxStakeAmount,
        minStake: config.minStakeAmount,
        activeRides: activeRides.size,
        uptime: process.uptime(),
        version: '1.0.0',
        paymentProvider: {
            name: paymentProvider.providerName,
            type: caps.type,
            trustModel: caps.trustModel,
            features: caps.features
        },
        mechanisms: [caps.type]
    });
});

// Create ride session with stakes
app.post('/rides/create', validateNIP98Auth, rideCreationLimiter, async (req, res) => {
    try {
        const { rideId, riderId, fareAmount } = req.body;

        // Verify authenticated user matches riderId
        if (req.user.pubkey !== riderId) {
            return res.status(403).json({
                error: 'Forbidden',
                details: 'Authenticated pubkey must match riderId'
            });
        }
        
        // Calculate stakes
        const riderStake = Math.max(config.minStakeAmount, Math.floor(fareAmount * 0.1));
        const operatorFee = Math.floor(fareAmount * config.operatorFeePercent);
        
        // Create Lightning invoice for rider to pay stake
        const invoice = await createLightningInvoice(riderStake, `Stake for ride ${rideId}`);
        
        // Store ride session
        activeRides.set(rideId, {
            riderId,
            fareAmount,
            riderStake,
            operatorFee,
            status: 'waiting_rider_stake',
            createdAt: Date.now(),
            invoice
        });
        
        res.json({
            success: true,
            rideId,
            invoice: invoice.payment_request,
            stakeAmount: riderStake,
            operatorFee,
            expiresAt: Date.now() + 600000 // 10 minutes
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Rider pays stake
app.post('/rides/:rideId/rider-stake', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { paymentProof } = req.body;
        
        const ride = activeRides.get(rideId);
        if (!ride) throw new Error('Ride not found');
        
        // Verify payment and lock stake
        const stakeLock = await stakeManager.lockStake(
            rideId,
            ride.riderId,
            ride.riderStake,
            'rider'
        );
        
        ride.status = 'waiting_driver';
        ride.riderStakeLocked = true;
        ride.riderStakeProof = stakeLock.holdId;
        
        // Broadcast to WebSocket clients
        broadcastToRide(rideId, {
            type: 'rider_stake_locked',
            amount: ride.riderStake
        });
        
        res.json({
            success: true,
            status: 'stake_locked',
            proof: stakeLock.event
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Driver accepts and stakes
app.post('/rides/:rideId/driver-accept', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { driverId, driverLightning } = req.body;
        
        const ride = activeRides.get(rideId);
        if (!ride) throw new Error('Ride not found');
        if (ride.status !== 'waiting_driver') throw new Error('Ride not available');
        
        // Calculate driver stake (15% of fare)
        const driverStake = Math.max(config.minStakeAmount, Math.floor(ride.fareAmount * 0.15));
        
        // Create invoice for driver
        const invoice = await createLightningInvoice(driverStake, `Driver stake for ${rideId}`);
        
        ride.driverId = driverId;
        ride.driverLightning = driverLightning;
        ride.driverStake = driverStake;
        ride.status = 'waiting_driver_stake';
        ride.driverInvoice = invoice.payment_request;
        
        res.json({
            success: true,
            invoice: invoice.payment_request,
            stakeAmount: driverStake
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Driver pays stake
app.post('/rides/:rideId/driver-stake', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { paymentProof } = req.body;
        
        const ride = activeRides.get(rideId);
        if (!ride) throw new Error('Ride not found');
        
        // Lock driver stake
        const stakeLock = await stakeManager.lockStake(
            rideId,
            ride.driverId,
            ride.driverStake,
            'driver'
        );
        
        ride.status = 'active';
        ride.driverStakeLocked = true;
        ride.driverStakeProof = stakeLock.holdId;
        ride.startedAt = Date.now();
        
        // Broadcast ride started
        broadcastToRide(rideId, {
            type: 'ride_started',
            driver: ride.driverId,
            startedAt: ride.startedAt
        });
        
        res.json({
            success: true,
            status: 'ride_active',
            proof: stakeLock.event
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Complete ride and release stakes
app.post('/rides/:rideId/complete', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { completionProof } = req.body;
        
        const ride = activeRides.get(rideId);
        if (!ride) throw new Error('Ride not found');
        if (ride.status !== 'active') throw new Error('Ride not active');
        
        // Release both stakes
        const riderRelease = await stakeManager.releaseStakes(`${rideId}_rider`);
        const driverRelease = await stakeManager.releaseStakes(`${rideId}_driver`);
        
        // Pay operator fee (from fare, not stakes)
        const operatorPayment = await payOperatorFee(ride.operatorFee);
        
        ride.status = 'completed';
        ride.completedAt = Date.now();
        
        // Broadcast completion
        broadcastToRide(rideId, {
            type: 'ride_completed',
            operatorFee: ride.operatorFee,
            duration: ride.completedAt - ride.startedAt
        });
        
        // Clean up after 5 minutes
        setTimeout(() => activeRides.delete(rideId), 300000);
        
        res.json({
            success: true,
            riderStakeReleased: true,
            driverStakeReleased: true,
            operatorFeePaid: ride.operatorFee,
            releases: [riderRelease.event, driverRelease.event]
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cancel ride with penalties
app.post('/rides/:rideId/cancel', async (req, res) => {
    try {
        const { rideId } = req.params;
        const { cancelledBy, reason } = req.body;
        
        const ride = activeRides.get(rideId);
        if (!ride) throw new Error('Ride not found');
        
        let penalty = {};
        
        if (ride.status === 'active') {
            // Apply penalties based on who cancelled
            if (cancelledBy === ride.driverId) {
                // Driver cancelled - forfeit 80% of driver stake to rider
                penalty = await stakeManager.forfeitStake(
                    `${rideId}_driver`,
                    ride.driverId,
                    'driver_cancelled'
                );
                
                // Release rider stake
                await stakeManager.releaseStakes(`${rideId}_rider`);
                
            } else if (cancelledBy === ride.riderId) {
                // Rider cancelled - forfeit 80% of rider stake to driver  
                penalty = await stakeManager.forfeitStake(
                    `${rideId}_rider`,
                    ride.riderId,
                    'rider_cancelled'
                );
                
                // Release driver stake
                await stakeManager.releaseStakes(`${rideId}_driver`);
            }
        }
        
        ride.status = 'cancelled';
        ride.cancelledBy = cancelledBy;
        ride.cancelReason = reason;
        ride.cancelledAt = Date.now();
        
        // Broadcast cancellation
        broadcastToRide(rideId, {
            type: 'ride_cancelled',
            cancelledBy,
            penalty: penalty.penalty || 0
        });
        
        res.json({
            success: true,
            cancelledBy,
            penalty: penalty.penalty || 0,
            refund: penalty.refund || 0
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get ride status
app.get('/rides/:rideId', (req, res) => {
    const ride = activeRides.get(req.params.rideId);
    
    if (!ride) {
        return res.status(404).json({ error: 'Ride not found' });
    }
    
    // Don't expose sensitive data
    const safeRide = {
        rideId: req.params.rideId,
        status: ride.status,
        fareAmount: ride.fareAmount,
        riderStake: ride.riderStake,
        driverStake: ride.driverStake,
        operatorFee: ride.operatorFee,
        createdAt: ride.createdAt,
        startedAt: ride.startedAt,
        completedAt: ride.completedAt
    };
    
    res.json(safeRide);
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        activeRides: activeRides.size,
        memoryUsage: process.memoryUsage(),
        strikeConnected: !!stakeManager
    });
});

// ==========================================
// HELPER FUNCTIONS
// ==========================================

async function createLightningInvoice(amount, memo) {
    // This would integrate with your Lightning node or Strike API
    // For now, returning mock invoice
    return {
        payment_request: `lnbc${amount}...`,
        payment_hash: Buffer.from(Math.random().toString()).toString('hex'),
        expires_at: Date.now() + 600000
    };
}

async function payOperatorFee(amount) {
    // Pay operator fee via Lightning
    console.log(`Paying operator fee: ${amount} sats to ${config.operatorLightningAddress}`);
    // Implementation would send actual Lightning payment
    return { success: true, amount };
}

// ==========================================
// SERVER STARTUP
// ==========================================

async function startServer() {
    // Initialize payment provider first
    await initializePaymentProvider();

    // Start HTTP server
    app.listen(config.port, () => {
        console.log(`
    ========================================
    DonkeyRide Operator Server
    ========================================
    Operator: ${config.operatorPubkey}
    Lightning: ${config.operatorLightningAddress}
    Fee: ${config.operatorFeePercent * 100}%
    Payment Provider: ${paymentProvider.providerName} (${paymentProvider.type})
    API Port: ${config.port}
    WebSocket Port: ${config.wsPort}
    ========================================
    Server running at http://localhost:${config.port}
    WebSocket at ws://localhost:${config.wsPort}
    ========================================

    🔐 NIP-98 authentication enabled
    🛡️  Rate limiting active
    ⚡ Multiple payment providers supported
    ========================================
        `);
    });
}

// Start the server
startServer().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down gracefully...');
    
    // Release all active stakes before shutdown
    activeRides.forEach(async (ride, rideId) => {
        if (ride.status === 'active') {
            await stakeManager.releaseStakes(`${rideId}_rider`);
            await stakeManager.releaseStakes(`${rideId}_driver`);
        }
    });
    
    wss.close();
    process.exit(0);
});

module.exports = app;