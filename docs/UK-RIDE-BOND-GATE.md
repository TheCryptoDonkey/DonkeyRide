# UK commercial ride-bond gate

Status: **blocked**.

The DonkeyRide reference operator is record-only. It cannot hold either
party's money, impose a monetary cancellation penalty or execute a dispute
award. Do not ship a UK commercial ride-bond feature until all of these exist:

1. A written UK financial-services perimeter opinion for the exact asset,
   custody, operator, fee and customer journey.
2. Consumer-law review of the full cancellation schedule, evidence standard,
   safety and force-majeure exceptions, appeals, complaints and ADR.
3. A mint-enforced or authorised-third-party settlement mechanism in which the
   DonkeyRide operator cannot move participant funds unilaterally.
4. Automatic, enforceable refunds after the agreed deadline.
5. Independent security review and a funded field test approved under the
   written opinion.

A cap, demo label, hodl invoice or `OPERATOR_LICENSED_CUSTODIAN` environment
flag does not satisfy this gate. The latter is deliberately unsupported.

Current official sources to review with counsel:

- [FCA: cryptoasset services that require registration](https://www.fca.org.uk/firms/cryptoassets/who-needs-register)
- [FCA: new cryptoasset regime](https://www.fca.org.uk/firms/new-regime-cryptoasset-regulation)
- [FCA PERG 15.5: escrow and payment services](https://handbook.fca.org.uk/handbook/PERG/15/5.html)
- [Consumer Rights Act 2015](https://www.legislation.gov.uk/ukpga/2015/15/contents)
- [CMA: fair contracts](https://www.gov.uk/guidance/writing-a-fair-contract-for-customers)

This is a product/release constraint, not legal advice.
