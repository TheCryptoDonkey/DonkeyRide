# Payment providers

## Reference operator support

| Provider | Reference status | Custody | Meaning |
| --- | --- | --- | --- |
| `cash` | production default | none | record-only commitment; fare settles directly between participants |
| `demo` | non-production only | none | virtual test records |
| `lnd` | refused | operator custody | archived integration research |
| `btcpay` | refused | operator custody | archived integration research |
| `alby` | refused | operator custody | archived integration research |
| `cln` | refused | operator custody | archived integration research |
| unknown/custom | refused | fail-closed | separate review required |

`src/payment-policy.js` enforces this allowlist. A provider's own custody claim
is not sufficient: its name must also be one of the two reviewed reference
providers. There is no `OPERATOR_LICENSED_CUSTODIAN` override.

## What record-only means

`lockStake()` records that a participant made a social commitment. It does not
lock money. `releaseStake()` closes that record and moves nothing.
`forfeitStake()` remains on the legacy provider interface for compatibility,
but the cash implementation records a late cancellation with `penalty: 0`,
`refund: 0` and `moneyMoved: 0`. Active reference routes do not call it.

The fare uses provider-owned settlement instructions such as Lightning
Address, Tando, direct M-Pesa or cash. The requester pays the provider. The
operator may resolve an invoice or record/verify a receipt but cannot pay from
an operator float, hold an NWC connection secret or deduct its fee from the
fare.

## Adding a monetary provider

Do not add one to the reference allowlist. A custody, escrow, conditional bond
or automatic forfeiture rail requires:

1. a separate adapter and release;
2. written jurisdiction-specific financial-services and consumer-law advice;
3. an operator-control analysis proving who can move funds;
4. safeguarding, insolvency, complaints and recovery design;
5. independent security review and approved funded acceptance.

For the UK, [UK-RIDE-BOND-GATE.md](UK-RIDE-BOND-GATE.md) is blocking. A hodl
invoice is not “trustless” merely because it may refund on timeout: whoever
controls settlement or cancellation still has material payment authority.
