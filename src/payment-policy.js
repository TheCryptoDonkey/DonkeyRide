'use strict';

const REFERENCE_PROVIDER_NAMES = Object.freeze(['cash', 'demo']);

function assertReferenceProviderNames(names, options = {}) {
    if (!Array.isArray(names) || names.length === 0) {
        throw new Error('The reference operator needs at least one explicit payment provider.');
    }
    const normalized = names.map(name => String(name || '').trim().toLowerCase());
    const rejected = normalized.find(name => !REFERENCE_PROVIDER_NAMES.includes(name));
    if (rejected !== undefined) {
        throw new Error(
            `Payment provider '${rejected || 'unknown'}' is not available in the reference operator. `
            + 'Primary and fallback rails must all be record-only.'
        );
    }
    if (options.production === true && normalized.includes('demo')) {
        throw new Error('The demo payment provider is not available in production. Use record-only cash.');
    }
    return Object.freeze(normalized);
}

function assertReferencePaymentProvider(provider, options = {}) {
    if (!provider || typeof provider !== 'object') {
        throw new Error('The reference operator needs an explicit payment provider.');
    }
    const name = String(provider.providerName || '').toLowerCase();
    const custody = typeof provider.getCustodyModel === 'function'
        ? provider.getCustodyModel()
        : 'custodial';
    assertReferenceProviderNames([name], options);
    if (custody !== 'none') {
        throw new Error(
            `Payment provider '${name || 'unknown'}' is not available in the reference operator. `
            + 'Only record-only cash is allowed here; custodial rails belong in a separately designed and reviewed integration.'
        );
    }
    return Object.freeze({name, custody, operatorCanMoveFunds: false});
}

function referenceCancellationOutcome({lateCancellation = false, protectedReason = false} = {}) {
    return Object.freeze({
        model: 'reputation-only',
        lateCancellation: Boolean(lateCancellation && !protectedReason),
        compensationRecommendation: 0,
        penalty: 0,
        refund: 0,
        moneyMoved: 0,
        requiresIndependentLegalBasisForMoney: true
    });
}

function assertEvidenceOnlyDispute({accusedStake, complainantStake, forfeitAmount} = {}) {
    const monetaryStakeAction = [accusedStake, complainantStake]
        .filter(Boolean)
        .some(value => value !== 'released');
    if (monetaryStakeAction || Number(forfeitAmount || 0) !== 0) {
        throw new Error('The reference operator records dispute evidence but cannot forfeit, retain or reallocate participant money.');
    }
}

module.exports = {
    REFERENCE_PROVIDER_NAMES,
    assertReferenceProviderNames,
    assertReferencePaymentProvider,
    referenceCancellationOutcome,
    assertEvidenceOnlyDispute
};
