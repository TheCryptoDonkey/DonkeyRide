// ==========================================
// CASH PAYMENT PROVIDER (record-only)
// The fare is settled face-to-face in cash between requester and provider.
// The operator NEVER touches the money — this provider keeps an auditable
// settlement record and emits stake events with an explicit trust model.
//
// This is the inDrive model, and the default for cash-first markets.
// "Stakes" under cash are commitments on record, not held funds: the
// deterrent is reputational: a late cancellation may be reported by the
// other party. A reference operator cannot honestly call that a forfeiture.
// ==========================================

const PaymentProvider = require('./base');

class CashProvider extends PaymentProvider {
    constructor(config = {}) {
        super(config);
        this.providerName = 'cash';
        this.type = 'record_only';
        this.records = new Map();
    }

    getTrustModel() {
        return 'social';
    }

    // Record-only: the fare settles face-to-face between the parties. The
    // operator never receives or holds a penny. Not a money transmitter.
    getCustodyModel() {
        return 'none';
    }

    async lockStake(rideId, userId, amount, type) {
        this.validateStakeParams(rideId, amount);
        const lockId = `${rideId}_${type}`;

        const record = {
            lockId,
            rideId,
            userId,
            amount,
            type,
            status: 'committed',
            lockedAt: Date.now()
        };
        this.records.set(lockId, record);

        console.log(`💷 CASH: ${type} commitment recorded for ${rideId} (${amount} — no funds held)`);

        return {
            success: true,
            lockId,
            amount,
            lockedAt: record.lockedAt,
            proof: { note: 'cash commitment — no funds held by the operator', record: lockId },
            event: this.createStakeEvent('locked', {
                rideId,
                userId,
                amount,
                type,
                providerTxId: lockId
            })
        };
    }

    async releaseStake(lockId) {
        const record = this.records.get(lockId);
        if (!record) {
            return { success: false, error: `No cash commitment found for ${lockId}` };
        }

        record.status = 'released';
        record.releasedAt = Date.now();

        return {
            success: true,
            releaseId: lockId,
            amount: record.amount,
            releasedAt: record.releasedAt,
            proof: { note: 'cash commitment released — nothing to move' },
            event: this.createStakeEvent('released', {
                rideId: record.rideId,
                amount: record.amount,
                providerTxId: lockId
            })
        };
    }

    async forfeitStake(lockId, cancellingParty, reason) {
        const record = this.records.get(lockId);
        if (!record) {
            return { success: false, error: `No cash commitment found for ${lockId}` };
        }

        record.status = 'late_cancellation_recorded';
        record.lateCancellationRecordedAt = Date.now();
        record.cancellationReason = reason;
        record.cancellingParty = cancellingParty;

        // Compatibility method only. No funds move, no amount is forfeited and
        // the recorded reference exposure is not a debt or entitlement.
        return {
            success: true,
            penalty: 0,
            refund: 0,
            moneyMoved: 0,
            recordedExposure: record.amount,
            reason,
            settled: 'reputation_only',
            event: this.createStakeEvent('late_cancellation_recorded', {
                rideId: record.rideId,
                amount: 0,
                penalty: 0,
                refund: 0,
                reason,
                providerTxId: lockId
            })
        };
    }

    async getStakeStatus(lockId) {
        const record = this.records.get(lockId);
        if (!record) {
            return { rideId: null, status: 'not_found' };
        }
        return {
            rideId: record.rideId,
            status: record.status,
            amount: record.amount,
            lockedAt: record.lockedAt,
            expiresAt: null,
            providerData: { trustModel: this.getTrustModel(), custody: 'none' }
        };
    }

    /**
     * Record a declared cash settlement for a completed task.
     * Amount is in the smallest unit of the given currency.
     */
    async recordSettlement(rideId, amount, currency = 'GBP') {
        const record = {
            rideId,
            amount,
            currency,
            method: 'cash',
            status: 'declared',
            declaredAt: Date.now()
        };
        this.records.set(`settlement_${rideId}`, record);
        console.log(`💷 CASH: settlement declared for ${rideId} (${amount} ${currency})`); // amount is the smallest unit of `currency` — see recordSettlement
        return record;
    }

    async healthCheck() {
        return true;
    }

    getCapabilities() {
        return {
            name: this.providerName,
            type: this.type,
            trustModel: this.getTrustModel(),
            features: {
                instantLock: true,
                instantRelease: true,
                partialForfeit: false,
                batchOperations: false,
                refunds: true,
                custody: 'none'
            },
            limits: {
                minStake: 1,
                maxStake: Number.MAX_SAFE_INTEGER,
                maxDailyVolume: Number.MAX_SAFE_INTEGER
            }
        };
    }
}

module.exports = CashProvider;
