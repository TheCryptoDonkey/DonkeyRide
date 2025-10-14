// ==========================================
// CORE LIGHTNING PAYMENT PROVIDER
// Trustless stake management via Core Lightning hold invoices
// ==========================================

const PaymentProvider = require('./base');
const crypto = require('crypto');

/**
 * Core Lightning Provider
 *
 * Uses the `hold` plugin for Core Lightning
 * Similar to LND hodl invoices but for CLN
 *
 * Requirements:
 * - Core Lightning (CLN) node
 * - hold plugin installed
 * - RPC socket access
 */
class CoreLightningProvider extends PaymentProvider {
    constructor(config) {
        super(config);
        this.providerName = 'core-lightning';
        this.type = 'hodl';

        this.socket = config.socket || process.env.CLN_SOCKET || '~/.lightning/bitcoin/lightning-rpc';
        this.network = config.network || 'bitcoin';

        this.stakes = new Map();
        this.cln = null;
    }

    /**
     * Initialize CLN connection
     */
    async initialize() {
        if (this.cln) return;

        try {
            // Use clightning-client npm package
            const { LightningClient } = require('clightning-client');
            this.cln = new LightningClient(this.socket);

            console.log('✅ Connected to Core Lightning');
        } catch (error) {
            throw new Error(`Failed to connect to CLN: ${error.message}`);
        }
    }

    /**
     * Lock stake using hold invoice
     */
    async lockStake(rideId, userId, amount, type) {
        await this.initialize();
        this.validateStakeParams(rideId, amount);

        try {
            // Generate preimage and hash
            const preimage = crypto.randomBytes(32);
            const hash = crypto.createHash('sha256').update(preimage).digest();

            // Create hold invoice using CLN hold plugin
            const invoice = await this.cln.call('holdinvoice', {
                amount_msat: amount * 1000, // Convert sats to millisats
                payment_hash: hash.toString('hex'),
                description: `${type} stake for ride ${rideId}`,
                expiry: 3600
            });

            const stakeId = `${rideId}_${type}`;
            this.stakes.set(stakeId, {
                rideId,
                userId,
                amount,
                type,
                preimage: preimage.toString('hex'),
                hash: hash.toString('hex'),
                invoice: invoice.bolt11,
                status: 'pending',
                createdAt: Date.now()
            });

            const event = this.createStakeEvent('locked', {
                rideId,
                userId,
                amount,
                type,
                providerTxId: hash.toString('hex')
            });

            return {
                success: true,
                lockId: hash.toString('hex'),
                amount,
                lockedAt: Date.now(),
                invoice: invoice.bolt11,
                proof: {
                    provider: 'core-lightning',
                    mechanism: 'hold_invoice',
                    hash: hash.toString('hex')
                },
                event
            };

        } catch (error) {
            console.error('CLN lock failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Release stake by settling hold invoice
     */
    async releaseStake(rideId) {
        await this.initialize();

        try {
            const riderStake = this.stakes.get(`${rideId}_rider`);
            const driverStake = this.stakes.get(`${rideId}_driver`);

            if (!riderStake && !driverStake) {
                throw new Error('No stakes found');
            }

            // Settle invoices
            if (riderStake && riderStake.status === 'locked') {
                await this.cln.call('holdsettle', {
                    payment_preimage: riderStake.preimage
                });
                riderStake.status = 'released';
                riderStake.releasedAt = Date.now();
            }

            if (driverStake && driverStake.status === 'locked') {
                await this.cln.call('holdsettle', {
                    payment_preimage: driverStake.preimage
                });
                driverStake.status = 'released';
                driverStake.releasedAt = Date.now();
            }

            const totalAmount = (riderStake?.amount || 0) + (driverStake?.amount || 0);

            const event = this.createStakeEvent('released', {
                rideId,
                amount: totalAmount,
                providerTxId: rideId
            });

            return {
                success: true,
                releaseId: rideId,
                amount: totalAmount,
                releasedAt: Date.now(),
                event
            };

        } catch (error) {
            console.error('CLN release failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Forfeit stake by cancelling hold invoice
     */
    async forfeitStake(rideId, cancellingParty, reason) {
        await this.initialize();

        try {
            const riderStake = this.stakes.get(`${rideId}_rider`);
            const driverStake = this.stakes.get(`${rideId}_driver`);

            let forfeitingStake, innocentStake;

            if (cancellingParty === riderStake?.userId) {
                forfeitingStake = riderStake;
                innocentStake = driverStake;
            } else {
                forfeitingStake = driverStake;
                innocentStake = riderStake;
            }

            // Cancel forfeiting invoice
            await this.cln.call('holdcancel', {
                payment_hash: forfeitingStake.hash
            });

            forfeitingStake.status = 'forfeited';

            // Settle innocent party
            if (innocentStake && innocentStake.status === 'locked') {
                await this.cln.call('holdsettle', {
                    payment_preimage: innocentStake.preimage
                });
                innocentStake.status = 'released';
            }

            const event = this.createStakeEvent('forfeited', {
                rideId,
                amount: forfeitingStake.amount,
                penalty: 0,
                refund: forfeitingStake.amount,
                reason,
                providerTxId: forfeitingStake.hash
            });

            return {
                success: true,
                penalty: 0,
                refund: forfeitingStake.amount,
                reason,
                note: 'Hold invoices provide full refund on cancel',
                event
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getStakeStatus(rideId) {
        const riderStake = this.stakes.get(`${rideId}_rider`);
        const driverStake = this.stakes.get(`${rideId}_driver`);

        return {
            rider: riderStake || null,
            driver: driverStake || null
        };
    }

    async healthCheck() {
        try {
            await this.initialize();
            const info = await this.cln.call('getinfo');
            return info.network === this.network;
        } catch (error) {
            return false;
        }
    }

    getCapabilities() {
        return {
            ...super.getCapabilities(),
            name: 'Core Lightning',
            type: 'hodl',
            trustModel: 'trustless',
            features: {
                instantLock: false,
                instantRelease: true,
                partialForfeit: false,
                batchOperations: false,
                refunds: true,
                automaticRefund: true,
                trustless: true
            }
        };
    }

    getTrustModel() {
        return 'trustless';
    }
}

module.exports = CoreLightningProvider;
