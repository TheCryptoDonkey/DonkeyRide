# DonkeyRide reference operator deployment

The reference operator coordinates tasks. It is not a relay, wallet, escrow or
custodian.

## Production invariants

1. `PAYMENT_PROVIDER=cash`.
2. `OPERATOR_FEE_PERCENT=0` unless a separately reviewed direct service charge
   is implemented without intercepting the fare.
3. NIP-98 authentication and rate limiting enabled.
4. Operator signing key held outside source control and logs.
5. Exact route points exchanged directly between participant devices in blind
   mode; the operator receives only the documented coarse data.
6. Cancellation and dispute responses move zero participant money.
7. No environment flag may enable a custodial provider.

The server exits if production selects `demo`, any archived custodial provider
or an unknown provider.

## Install and start

```bash
npm ci
npm test
npm run web:build
NODE_ENV=production PAYMENT_PROVIDER=cash npm start
```

After startup, inspect `/info`. It must report coordinator role, custody none,
peer-to-peer settlement and zero operator transmission. Exercise a cancellation
and verify the response reports `cancellationModel: reputation-only` or the
modern equivalent, `money_moved: 0` and no monetary penalty.

## Data and operational work

Running a real market still creates obligations. Complete the DPIA, privacy
notice, retention policy, incident plan, safety workflow and appropriate
operator due diligence for the chosen jurisdiction. The coordinator processes
IP addresses, timestamps, pubkeys and coarse location even in blind mode.

A regulated custody or ride-bond product is a separate deployment, code path
and legal/security review. It is not an environment configuration of this
reference server. UK operators must treat
[UK-RIDE-BOND-GATE.md](../docs/UK-RIDE-BOND-GATE.md) as blocking.
