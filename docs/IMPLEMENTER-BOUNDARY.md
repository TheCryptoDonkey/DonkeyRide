# Protocol publisher and implementer boundary

Status: **protocol and reference source**.

DonkeyRide publishes a protocol, applications and a reference server. The
project is not operating a ride, payment or escrow service merely by publishing
that source. No rider or driver contracts with the source repository, and the
repository cannot hold money, impose a cancellation charge or decide a dispute.

Someone who deploys the software may become an operator. That operator is
responsible for the service it actually provides, including its jurisdiction,
customer terms, transport obligations, privacy and safety processes, payment
controls and any authorisation or registration it needs.

## Reference-source boundary

The default reference configuration is deliberately record-only:

- participant commitments are social and reputational records, not deposits;
- cancellation and dispute routes move zero money;
- fares settle directly between rider and driver;
- the server does not hold wallet connection secrets or participant funds; and
- no environment flag enables custody, escrow or automatic forfeiture.

Those are engineering properties, not a declaration of the legal status of
every future deployment.

## When an implementation becomes a different product

An implementer creates a materially different product if it adds custody,
conditional bonds or automatic forfeiture. That needs a separate adapter and
release because somebody may then be able to hold, redirect or retain
participant value. The implementation should make that authority explicit,
fail safely on timeout and ambiguity, and undergo a funded security assessment.

The entity operating such a deployment must also assess its own business model,
customer contracts and legal perimeter. Those obligations attach to the chosen
deployment and operator; they are not a blanket restriction on protocol
research, example code or developer demonstrations.

## UK sources behind the distinction

The UK Payment Services Regulations exclude technical service providers that
support payment services without ever possessing the funds, subject to the
scope and exceptions in the Regulations. FCA perimeter guidance distinguishes
technical processing and infrastructure from a business that holds funds in
escrow pending specified conditions.

- [Payment Services Regulations 2017, Schedule 1 Part 2 paragraph (j)](https://www.legislation.gov.uk/uksi/2017/752/pdfs/uksi_20170752_en.pdf)
- [FCA PERG 15.3: acquiring and technical services](https://handbook.fca.org.uk/handbook/perg15/perg15s3?timeline=true)
- [FCA PERG 15.5: technical providers and escrow](https://handbook.fca.org.uk/handbook/perg15/perg15s5?timeline=true)
- [Consumer Rights Act 2015](https://www.legislation.gov.uk/ukpga/2015/15/contents)

This document describes the software and intended publisher role. It is not
legal advice and does not decide the position of an operator or deployment.
