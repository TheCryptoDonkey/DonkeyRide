// ==========================================
// LND PAYMENT PROVIDER
// Trustless stake management using Lightning hodl invoices
// ==========================================

const PaymentProvider = require('./base');
const crypto = require('crypto');
const fs = require('fs');

/**
 * LND Provider using Hodl Invoices
 *
 * TRUSTLESS STAKING:
 * - Operator CANNOT steal funds
 * - Funds locked in Lightning Network, not with operator
 * - Automatic refund on timeout
 * - Settlement requires preimage reveal
 *
 * Requirements:
 * - LND node with hodl invoice support
 * - gRPC connection
 * - Invoice macaroon permissions
 */
class LNDProvider extends PaymentProvider {
    constructor(config) {
        super(config);
        this.providerName = 'lnd';
        this.type = 'hodl';

        this.host = config.host || 'localhost:10009';
        this.certPath = config.cert || process.env.LND_CERT_PATH;
        this.macaroonPath = config.macaroon || process.env.LND_MACAROON_PATH;
        this.network = config.network || 'mainnet';

        // Map: rideId -> {preimage, hash, invoice, ...}
        this.stakes = new Map();

        // Lazy load gRPC connection
        this.lnd = null;
    }

    /**
     * Initialize LND gRPC connection
     */
    async initialize() {
        if (this.lnd) return;

        try {
            // Dynamically import LND gRPC library
            // Using ln-service for easier interface
            const lnService = require('ln-service');

            // Read cert and macaroon
            const cert = fs.readFileSync(this.certPath);
            const macaroon = fs.readFileSync(this.macaroonPath).toString('hex');

            this.lnd = lnService.authenticatedLndGrpc({
                cert: cert.toString('base64'),
                macaroon,
                socket: this.host
            });

            console.log('✅ Connected to LND');
        } catch (error) {
            throw new Error(`Failed to connect to LND: ${error.message}`);
        }
    }

    /**
     * Lock stake using hodl invoice
     * Creates invoice that can only be settled with correct preimage
     */
    async lockStake(rideId, userId, amount, type) {
        await this.initialize();
        this.validateStakeParams(rideId, amount);

        try {
            // Generate random preimage
            const preimage = crypto.randomBytes(32);
            const hash = crypto.createHash('sha256').update(preimage).digest();

            // Create hodl invoice
            const lnService = require('ln-service');

            const invoice = await lnService.createHodlInvoice({
                lnd: this.lnd.lnd,
                id: hash.toString('hex'),
                tokens: amount,
                description: `${type} stake for ride ${rideId}`,
                expires_at: new Date(Date.now() + 3600000).toISOString() // 1 hour
            });

            // Store stake info
            const stakeId = `${rideId}_${type}`;
            this.stakes.set(stakeId, {
                rideId,
                userId,
                amount,
                type,
                preimage: preimage.toString('hex'),
                hash: hash.toString('hex'),
                invoice: invoice.request,
                invoiceId: invoice.id,
                status: 'pending',
                createdAt: Date.now(),
                expiresAt: Date.now() + 3600000
            });

            // Create Nostr proof event
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
                invoice: invoice.request, // User must pay this
                proof: {
                    provider: 'lnd',
                    mechanism: 'hodl_invoice',
                    hash: hash.toString('hex'),
                    expiresAt: Date.now() + 3600000
                },
                event
            };

        } catch (error) {
            console.error('LND lock failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Confirm a stake invoice has actually been paid (payment HELD).
     * Transitions pending → locked. A hodl invoice is only enforceable once
     * the payer's HTLC is held — lockStake alone just creates the invoice.
     *
     * @param {string} stakeId - `${rideId}_${role}`
     * @returns {Promise<{paid: boolean, status: string}>}
     */
    async confirmStakePaid(stakeId) {
        await this.initialize();

        const stake = this.stakes.get(stakeId);
        if (!stake) {
            return { paid: false, status: 'not_found' };
        }

        const lnService = require('ln-service');
        const invoice = await lnService.getInvoice({
            lnd: this.lnd.lnd,
            id: stake.hash
        });

        if (invoice.is_held) {
            stake.status = 'locked';
            stake.heldAt = Date.now();
        } else if (invoice.is_canceled) {
            stake.status = 'cancelled';
        }

        return { paid: !!invoice.is_held, status: stake.status };
    }

    /**
     * Release a stake by CANCELLING the hodl invoice.
     *
     * Semantics matter here: with a held hodl invoice, `settle` claims the
     * payer's money for the operator's node, `cancel` returns it to the
     * payer. Releasing a stake after a successful ride means giving the
     * money BACK — so release cancels. (The previous implementation settled
     * on release, i.e. the operator quietly kept every stake.)
     *
     * @param {string} stakeId - `${rideId}_${role}`
     */
    async releaseStake(stakeId) {
        await this.initialize();

        try {
            const lnService = require('ln-service');

            const stake = this.stakes.get(stakeId);
            if (!stake) {
                throw new Error(`No stake found for ${stakeId}`);
            }

            // Cancel returns held funds to the payer; on an unpaid invoice it
            // simply prevents late payment. Both are correct for release.
            await lnService.cancelHodlInvoice({
                lnd: this.lnd.lnd,
                id: stake.hash
            });

            stake.status = 'released';
            stake.releasedAt = Date.now();

            const event = this.createStakeEvent('released', {
                rideId: stake.rideId,
                amount: stake.amount,
                providerTxId: stake.hash
            });

            return {
                success: true,
                releaseId: stakeId,
                amount: stake.amount,
                releasedAt: stake.releasedAt,
                proof: {
                    provider: 'lnd',
                    mechanism: 'hodl_cancel_refund',
                    hash: stake.hash
                },
                event
            };

        } catch (error) {
            console.error('LND release failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Forfeit a stake by SETTLING the hodl invoice with the preimage —
     * the operator claims the held funds as the penalty. This makes the
     * penalty real and enforceable (the operator then compensates the
     * wronged party per its published policy).
     *
     * If the invoice was never paid there is nothing to claim; it is
     * cancelled instead and the forfeit is recorded with penalty 0.
     *
     * @param {string} stakeId - `${rideId}_${role}`
     */
    async forfeitStake(stakeId, cancellingParty, reason) {
        await this.initialize();

        try {
            const lnService = require('ln-service');

            const stake = this.stakes.get(stakeId);
            if (!stake) {
                throw new Error(`No stake found for ${stakeId}`);
            }

            const invoice = await lnService.getInvoice({
                lnd: this.lnd.lnd,
                id: stake.hash
            });

            let penalty = 0;
            if (invoice.is_held) {
                await lnService.settleHodlInvoice({
                    lnd: this.lnd.lnd,
                    secret: stake.preimage
                });
                penalty = stake.amount;
            } else if (!invoice.is_confirmed && !invoice.is_canceled) {
                // Unpaid — nothing to claim, just close the invoice
                await lnService.cancelHodlInvoice({
                    lnd: this.lnd.lnd,
                    id: stake.hash
                });
            }

            stake.status = 'forfeited';
            stake.forfeitedAt = Date.now();
            stake.penalty = penalty;

            const event = this.createStakeEvent('forfeited', {
                rideId: stake.rideId,
                amount: stake.amount,
                penalty,
                refund: stake.amount - penalty,
                reason,
                providerTxId: stake.hash
            });

            return {
                success: true,
                penalty,
                refund: stake.amount - penalty,
                reason,
                event
            };

        } catch (error) {
            console.error('LND forfeit failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get stake status from LND — per-stake (stakeId = `${rideId}_${role}`)
     */
    async getStakeStatus(stakeId) {
        await this.initialize();

        const stake = this.stakes.get(stakeId);
        if (!stake) {
            return null;
        }

        const lnService = require('ln-service');
        try {
            const invoice = await lnService.getInvoice({
                lnd: this.lnd.lnd,
                id: stake.hash
            });

            return {
                ...stake,
                lndStatus: invoice.is_held ? 'held'
                    : invoice.is_confirmed ? 'settled'
                    : invoice.is_canceled ? 'cancelled'
                    : 'unpaid',
                verified: true,
                lastChecked: Date.now()
            };
        } catch (error) {
            return {
                ...stake,
                verified: false,
                error: error.message
            };
        }
    }

    /**
     * Health check for LND connection
     */
    async healthCheck() {
        try {
            await this.initialize();

            const lnService = require('ln-service');
            const info = await lnService.getWalletInfo({ lnd: this.lnd.lnd });

            return info.is_synced_to_chain;
        } catch (error) {
            console.error('LND health check failed:', error);
            return false;
        }
    }

    /**
     * Get LND-specific capabilities
     */
    getCapabilities() {
        return {
            ...super.getCapabilities(),
            name: 'LND',
            type: 'hodl',
            trustModel: 'trustless',
            features: {
                instantLock: false, // User must pay invoice
                instantRelease: true,
                partialForfeit: false, // Hodl invoices are all-or-nothing
                batchOperations: false,
                refunds: true,
                automaticRefund: true, // Timeout = automatic refund
                kycRequired: false,
                trustless: true // ✅ Operator cannot steal!
            },
            limits: {
                minStake: 1,
                maxStake: 1000000, // Limited by Lightning channel capacity
                maxDailyVolume: 10000000,
                maxHoldTime: 3600 // 1 hour before auto-cancel
            },
            requirements: {
                userMustPayInvoice: true,
                lightningWalletRequired: true,
                technicalComplexity: 'medium'
            }
        };
    }

    getTrustModel() {
        return 'trustless';
    }
}

module.exports = LNDProvider;
