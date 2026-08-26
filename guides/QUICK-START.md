# DonkeyRide reference operator quick start

Most people use the hosted rider or provider PWA. This guide is for an
operator running the optional coordination server.

## Install

```bash
git clone https://github.com/TheCryptoDonkey/DonkeyRide.git
cd DonkeyRide
npm install
cp .env.example .env
```

Minimum configuration:

```env
OPERATOR_PUBKEY=npub1...
OPERATOR_NSEC=nsec1...
PAYMENT_PROVIDER=cash
DOMAIN=ridesharing
```

Start and verify:

```bash
npm test
npm start
curl http://localhost:3000/info
```

## Immutable payment boundary

The reference operator accepts only:

- `cash`: record-only commitments and direct peer-to-peer settlement;
- `demo`: virtual test records, and never under `NODE_ENV=production`.

It refuses `lnd`, `btcpay`, `alby`, `cln` and every unknown provider. There is
no licence environment override. The provider classes remain as archived
integration research; selecting one cannot turn this server into a custodian.

Cancellation is reputation-only. Every active record-only commitment is
released, the operator moves zero money, and the other party may receive a
late-cancellation fact it can choose to report. Dispute arbiters can publish
signed findings but cannot forfeit, retain or reallocate participant money.

## Domains

```bash
DOMAIN=ridesharing npm start
DOMAIN=locksmith npm start
DOMAIN=delivery npm start
```

The domain profile changes labels, states and pricing. It does not expand the
payment authority of the reference operator.

## Before a real deployment

- Read [REGULATORY-POSTURE.md](../docs/REGULATORY-POSTURE.md).
- Read [IMPLEMENTER-BOUNDARY.md](../docs/IMPLEMENTER-BOUNDARY.md) and assess the
  actual deployment rather than treating protocol publication as service operation.
- Configure NIP-98, rate limiting, operator keys, Nostr relays, routing,
  retention and a DPIA appropriate to the actual deployment.
- Keep the fare and any tip directly between requester and provider.

`PAYMENT_PROVIDER=cash` does not mean the fare must be paper cash. The modern
PWA can hand the requester a provider-owned Lightning, Tando, M-Pesa or cash
instruction. The operator may resolve and record that instruction; it must not
pay from an operator float or keep a participant wallet secret.
