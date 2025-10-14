// ==========================================
// STRIKE PAYMENT PROVIDER
// Custodial stake management via Strike API
// ==========================================

const PaymentProvider = require('./base');

class StrikeProvider extends PaymentProvider {
    constructor(config) {
        super(config);
        this.providerName = 'strike';
        this.type = 'custodial';
        this.apiKey = config.apiKey || process.env.STRIKE_API_KEY;
        this.baseUrl = config.baseUrl || 'https://api.strike.me/v1';
        this.stakes = new Map(); // Track local stake state

        if (!this.apiKey) {
            throw new Error('Strike API key is required');
        }
    }

    /**
     * Lock a stake using Strike's payment quote system
     */
    async lockStake(rideId, userId, amount, type) {
        this.validateStakeParams(rideId, amount);

        try {
            // Create payment quote for the hold
            const quoteResponse = await fetch(`${this.baseUrl}/payment-quotes`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sourceAmount: {
                        amount: amount.toString(),
                        currency: 'SAT'
                    },
                    destinationAccount: 'escrow', // Internal escrow account
                    description: `${type} stake for ride ${rideId}`
                })
            });

            if (!quoteResponse.ok) {
                throw new Error(`Strike API error: ${quoteResponse.statusText}`);
            }

            const quote = await quoteResponse.json();

            // Execute the hold
            const executeResponse = await fetch(`${this.baseUrl}/payment-quotes/${quote.id}/execute`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            if (!executeResponse.ok) {
                throw new Error(`Failed to execute quote: ${executeResponse.statusText}`);
            }

            const hold = await executeResponse.json();

            // Store stake locally
            const stakeId = `${rideId}_${type}`;
            this.stakes.set(stakeId, {
                rideId,
                userId,
                amount,
                type,
                strikeHoldId: hold.id,
                status: 'locked',
                lockedAt: Date.now()
            });

            // Create Nostr proof event
            const event = this.createStakeEvent('locked', {
                rideId,
                userId,
                amount,
                type,
                providerTxId: hold.id
            });

            return {
                success: true,
                lockId: hold.id,
                amount,
                lockedAt: Date.now(),
                proof: {
                    provider: 'strike',
                    holdId: hold.id,
                    quote: quote.id
                },
                event
            };

        } catch (error) {
            console.error('Strike lock failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Release a stake after successful ride completion
     */
    async releaseStake(rideId) {
        try {
            // Get rider and driver stakes
            const riderStake = this.stakes.get(`${rideId}_rider`);
            const driverStake = this.stakes.get(`${rideId}_driver`);

            if (!riderStake && !driverStake) {
                throw new Error('No stakes found for ride');
            }

            const releases = [];

            // Release rider stake
            if (riderStake) {
                const release = await this.releaseStakeInternal(riderStake);
                releases.push(release);
                riderStake.status = 'released';
                riderStake.releasedAt = Date.now();
            }

            // Release driver stake
            if (driverStake) {
                const release = await this.releaseStakeInternal(driverStake);
                releases.push(release);
                driverStake.status = 'released';
                driverStake.releasedAt = Date.now();
            }

            // Create Nostr event
            const totalAmount = (riderStake?.amount || 0) + (driverStake?.amount || 0);
            const event = this.createStakeEvent('released', {
                rideId,
                amount: totalAmount,
                providerTxId: releases.map(r => r.id).join(',')
            });

            return {
                success: true,
                releaseId: releases[0].id,
                amount: totalAmount,
                releasedAt: Date.now(),
                proof: {
                    provider: 'strike',
                    releases: releases.map(r => r.id)
                },
                event
            };

        } catch (error) {
            console.error('Strike release failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Internal method to reverse a Strike hold
     */
    async releaseStakeInternal(stake) {
        const response = await fetch(`${this.baseUrl}/payments/${stake.strikeHoldId}/reverse`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: stake.amount,
                description: `Stake released for ride ${stake.rideId}`
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to release: ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * Forfeit a stake with penalty distribution
     */
    async forfeitStake(rideId, cancellingParty, reason) {
        try {
            // Determine which stake to forfeit
            const riderStake = this.stakes.get(`${rideId}_rider`);
            const driverStake = this.stakes.get(`${rideId}_driver`);

            let forfeitingStake;
            let beneficiaryType;

            // Determine who cancelled
            if (cancellingParty === riderStake?.userId) {
                forfeitingStake = riderStake;
                beneficiaryType = 'driver';
            } else if (cancellingParty === driverStake?.userId) {
                forfeitingStake = driverStake;
                beneficiaryType = 'rider';
            } else {
                throw new Error('Cancelling party does not match any stake');
            }

            // Calculate penalty (80% to other party, 20% refund)
            const penalty = Math.floor(forfeitingStake.amount * 0.8);
            const refund = forfeitingStake.amount - penalty;

            // Transfer penalty to other party
            const transferResponse = await fetch(`${this.baseUrl}/payments`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    amount: {
                        amount: penalty.toString(),
                        currency: 'SAT'
                    },
                    destinationHandle: `${beneficiaryType}_${rideId}`,
                    description: `Penalty for ${reason}`,
                    reference: forfeitingStake.strikeHoldId
                })
            });

            if (!transferResponse.ok) {
                throw new Error(`Penalty transfer failed: ${transferResponse.statusText}`);
            }

            const transfer = await transferResponse.json();

            // Refund partial amount to cancelling party
            if (refund > 0) {
                await fetch(`${this.baseUrl}/payments`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        amount: {
                            amount: refund.toString(),
                            currency: 'SAT'
                        },
                        destinationHandle: cancellingParty,
                        description: 'Partial stake refund'
                    })
                });
            }

            // Update state
            forfeitingStake.status = 'forfeited';
            forfeitingStake.forfeitedAt = Date.now();
            forfeitingStake.penalty = penalty;

            // Release other party's stake
            const otherStake = beneficiaryType === 'driver' ? driverStake : riderStake;
            if (otherStake) {
                await this.releaseStakeInternal(otherStake);
                otherStake.status = 'released';
            }

            // Create Nostr event
            const event = this.createStakeEvent('forfeited', {
                rideId,
                amount: forfeitingStake.amount,
                penalty,
                refund,
                reason,
                providerTxId: transfer.id
            });

            return {
                success: true,
                penalty,
                refund,
                reason,
                event
            };

        } catch (error) {
            console.error('Strike forfeit failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get current status of a stake
     */
    async getStakeStatus(rideId) {
        const riderStake = this.stakes.get(`${rideId}_rider`);
        const driverStake = this.stakes.get(`${rideId}_driver`);

        if (!riderStake && !driverStake) {
            return null;
        }

        // Verify with Strike API
        const status = {};

        if (riderStake) {
            status.rider = await this.verifyWithStripe(riderStake);
        }

        if (driverStake) {
            status.driver = await this.verifyWithStripe(driverStake);
        }

        return status;
    }

    /**
     * Verify stake status with Strike API
     */
    async verifyWithStripe(stake) {
        try {
            const response = await fetch(`${this.baseUrl}/payments/${stake.strikeHoldId}`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            if (!response.ok) {
                return {
                    ...stake,
                    verified: false,
                    lastChecked: Date.now()
                };
            }

            const strikeStatus = await response.json();

            return {
                ...stake,
                strikeStatus: strikeStatus.state,
                verified: true,
                lastChecked: Date.now()
            };
        } catch (error) {
            return {
                ...stake,
                verified: false,
                error: error.message,
                lastChecked: Date.now()
            };
        }
    }

    /**
     * Health check for Strike API
     */
    async healthCheck() {
        try {
            const response = await fetch(`${this.baseUrl}/rates/ticker`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            return response.ok;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get Strike-specific capabilities
     */
    getCapabilities() {
        return {
            ...super.getCapabilities(),
            name: 'Strike',
            type: 'custodial',
            trustModel: 'custodial',
            features: {
                instantLock: true,
                instantRelease: true,
                partialForfeit: true,
                batchOperations: true,
                refunds: true,
                kycRequired: true // Strike requires KYC for larger amounts
            },
            limits: {
                minStake: 1,
                maxStake: 10000, // 10k sats without enhanced verification
                maxDailyVolume: 100000
            }
        };
    }

    getTrustModel() {
        return 'custodial';
    }
}

module.exports = StrikeProvider;
