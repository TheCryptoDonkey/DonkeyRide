// ==========================================
// STRIKE API STAKE IMPLEMENTATION
// Production-ready staking using Strike custodial service
// ==========================================

class StrikeStakeManager {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.strike.me/v1';
        this.stakes = new Map(); // Track local stake state
    }

    // ==========================================
    // INITIALIZE STAKE ACCOUNTS
    // ==========================================
    
    async initializeStakeAccount(userId, type) {
        try {
            // Create a dedicated Strike account for stakes
            const response = await fetch(`${this.baseUrl}/accounts`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    handle: `${type}_stakes_${userId}`,
                    currency: 'BTC',
                    description: `${type} stake escrow account`
                })
            });
            
            return await response.json();
        } catch (error) {
            console.error('Strike account creation failed:', error);
            throw error;
        }
    }

    // ==========================================
    // LOCK STAKE FOR RIDE
    // ==========================================
    
    async lockStake(rideId, userId, amount, type = 'rider') {
        try {
            // Create a hold on funds (not actually sent yet)
            const holdRequest = {
                amount: amount,
                currency: 'SAT',
                description: `Stake for ride ${rideId}`,
                metadata: {
                    rideId: rideId,
                    userId: userId,
                    type: type,
                    lockedAt: Date.now()
                }
            };
            
            // Strike API call to create payment hold
            const response = await fetch(`${this.baseUrl}/payment-quotes`, {
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
                    description: holdRequest.description
                })
            });
            
            const quote = await response.json();
            
            // Execute the hold
            const executeResponse = await fetch(`${this.baseUrl}/payment-quotes/${quote.id}/execute`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });
            
            const hold = await executeResponse.json();
            
            // Store stake locally
            this.stakes.set(rideId, {
                userId: userId,
                amount: amount,
                type: type,
                strikeHoldId: hold.id,
                status: 'locked',
                lockedAt: Date.now()
            });
            
            // Create Nostr event for stake proof
            const stakeEvent = {
                kind: 30502,
                pubkey: userId,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ['e', rideId],
                    ['amount', amount.toString()],
                    ['type', `${type}_stake`],
                    ['status', 'locked'],
                    ['mechanism', 'custodial'],
                    ['provider', 'strike'],
                    ['proof', hold.id],
                    ['timeout', (Date.now() + 3600000).toString()]
                ],
                content: `Stake locked via Strike: ${hold.id}`
            };
            
            return {
                success: true,
                holdId: hold.id,
                event: stakeEvent
            };
            
        } catch (error) {
            console.error('Stake lock failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ==========================================
    // RELEASE STAKE (RIDE COMPLETED)
    // ==========================================
    
    async releaseStakes(rideId) {
        try {
            const stake = this.stakes.get(rideId);
            if (!stake) throw new Error('Stake not found');
            
            // Strike API to reverse the hold
            const response = await fetch(`${this.baseUrl}/payments/${stake.strikeHoldId}/reverse`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    amount: stake.amount,
                    description: `Stake released for completed ride ${rideId}`
                })
            });
            
            const release = await response.json();
            
            // Update local state
            stake.status = 'released';
            stake.releasedAt = Date.now();
            
            // Create release event
            const releaseEvent = {
                kind: 30520,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ['e', rideId],
                    ['action', 'release'],
                    ['amount', stake.amount.toString()],
                    ['strike_tx', release.id]
                ],
                content: 'Stake released - ride completed successfully'
            };
            
            return {
                success: true,
                releaseId: release.id,
                event: releaseEvent
            };
            
        } catch (error) {
            console.error('Stake release failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ==========================================
    // FORFEIT STAKE (CANCELLATION)
    // ==========================================
    
    async forfeitStake(rideId, cancellingParty, reason) {
        try {
            const stake = this.stakes.get(rideId);
            if (!stake) throw new Error('Stake not found');
            
            // Calculate penalty distribution
            const penalty = Math.floor(stake.amount * 0.8); // 80% to other party
            const refund = stake.amount - penalty; // 20% back
            
            // Strike API to split the held funds
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
                    destinationHandle: `${stake.type === 'rider' ? 'driver' : 'rider'}_${rideId}`,
                    description: `Penalty for ${reason}`,
                    reference: stake.strikeHoldId
                })
            });
            
            const transfer = await response.json();
            
            // Refund remaining to cancelling party
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
            stake.status = 'forfeited';
            stake.forfeitedAt = Date.now();
            stake.penalty = penalty;
            
            // Create penalty event
            const penaltyEvent = {
                kind: 30521,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ['e', rideId],
                    ['reason', reason],
                    ['penalty', penalty.toString()],
                    ['refund', refund.toString()],
                    ['strike_tx', transfer.id]
                ],
                content: `Stake forfeited: ${reason}`
            };
            
            return {
                success: true,
                penalty: penalty,
                refund: refund,
                event: penaltyEvent
            };
            
        } catch (error) {
            console.error('Stake forfeit failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ==========================================
    // CHECK STAKE STATUS
    // ==========================================
    
    async getStakeStatus(rideId) {
        const stake = this.stakes.get(rideId);
        if (!stake) return null;
        
        // Verify with Strike API
        try {
            const response = await fetch(`${this.baseUrl}/payments/${stake.strikeHoldId}`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });
            
            const strikeStatus = await response.json();
            
            return {
                ...stake,
                strikeStatus: strikeStatus.state,
                lastChecked: Date.now()
            };
        } catch (error) {
            return stake;
        }
    }

    // ==========================================
    // BATCH OPERATIONS FOR EFFICIENCY
    // ==========================================
    
    async lockBothStakes(rideId, riderInfo, driverInfo) {
        try {
            // Create batch payment quote for both stakes
            const batchResponse = await fetch(`${this.baseUrl}/batch-payments`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    payments: [
                        {
                            sourceAccount: riderInfo.accountId,
                            amount: { amount: riderInfo.stake.toString(), currency: 'SAT' },
                            destinationAccount: 'escrow',
                            reference: `${rideId}_rider`
                        },
                        {
                            sourceAccount: driverInfo.accountId,
                            amount: { amount: driverInfo.stake.toString(), currency: 'SAT' },
                            destinationAccount: 'escrow',
                            reference: `${rideId}_driver`
                        }
                    ]
                })
            });
            
            const batch = await batchResponse.json();
            
            // Store both stakes
            this.stakes.set(`${rideId}_rider`, {
                ...riderInfo,
                strikeHoldId: batch.payments[0].id,
                status: 'locked'
            });
            
            this.stakes.set(`${rideId}_driver`, {
                ...driverInfo,
                strikeHoldId: batch.payments[1].id,
                status: 'locked'
            });
            
            return {
                success: true,
                batchId: batch.id,
                riderHold: batch.payments[0].id,
                driverHold: batch.payments[1].id
            };
            
        } catch (error) {
            console.error('Batch stake lock failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// ==========================================
// USAGE EXAMPLE
// ==========================================

async function handleRideWithStrike() {
    const stakeManager = new StrikeStakeManager(process.env.STRIKE_API_KEY);
    
    // 1. Rider requests ride and locks stake
    const riderStake = await stakeManager.lockStake(
        'ride_123',
        'rider_pubkey',
        100, // 100 sats
        'rider'
    );
    
    console.log('Rider stake locked:', riderStake.holdId);
    
    // 2. Driver accepts and locks stake
    const driverStake = await stakeManager.lockStake(
        'ride_123',
        'driver_pubkey',
        150, // 150 sats
        'driver'
    );
    
    console.log('Driver stake locked:', driverStake.holdId);
    
    // 3. Ride completes successfully
    const release = await stakeManager.releaseStakes('ride_123');
    console.log('Stakes released:', release);
    
    // OR: Driver cancels
    // const penalty = await stakeManager.forfeitStake('ride_123', 'driver_pubkey', 'driver_cancelled');
    // console.log('Driver penalized:', penalty.penalty, 'sats to rider');
}

// ==========================================
// MIGRATION PATH TO DECENTRALIZED
// ==========================================

class StakeManagerFactory {
    static async create(userPreference, fallbackOrder = ['custodial', 'federated', 'smart_contract']) {
        // Try user preference first
        try {
            switch(userPreference) {
                case 'custodial':
                    return new StrikeStakeManager(process.env.STRIKE_API_KEY);
                case 'federated':
                    return new FedimintStakeManager(process.env.FEDIMINT_URL);
                case 'smart_contract':
                    return new PolygonStakeManager(process.env.POLYGON_RPC);
                case 'lightning_hodl':
                    return new LightningHodlManager(process.env.LND_URL);
                default:
                    throw new Error('Unknown preference');
            }
        } catch (error) {
            console.log(`Preferred mechanism ${userPreference} unavailable, trying fallbacks`);
            
            // Try fallbacks in order
            for (const fallback of fallbackOrder) {
                try {
                    return await this.create(fallback, []);
                } catch (e) {
                    continue;
                }
            }
            
            throw new Error('No stake mechanisms available');
        }
    }
}

module.exports = { StrikeStakeManager, StakeManagerFactory };