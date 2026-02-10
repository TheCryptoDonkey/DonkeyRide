# Documentation Rewrite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite all project documentation to reflect payment agnosticism, modular NIP structure, expanded decentralisation, GDPR compliance, and 10 use case state machines.

**Architecture:** Documents are grouped into 4 phases: (1) foundation specs, (2) core documentation, (3) new documents, (4) cleanup. Each task produces one committed file. Tasks within a phase are independent and can be parallelised.

**Tech Stack:** Markdown, Mermaid diagrams. No code changes.

**Design document:** `docs/plans/2026-02-08-protocol-redesign-design.md` — the source of truth for all content decisions.

---

## Phase 1: NIP Specifications (specs/)

The specs/ directory already has a partial split. We need to update the core spec for payment agnosticism and create the missing modular NIPs.

### Task 1: Update specs/NIP-XX-core.md — Payment Agnosticism

**Files:**
- Modify: `specs/NIP-XX-core.md`

**Step 1: Read the current file**

Read `specs/NIP-XX-core.md` in full. Also read the design document section 2 (Payment Agnosticism) and section 4 (NIP Ecosystem Audit).

**Step 2: Update the spec**

Make these changes throughout the file:
- Replace "Lightning Network payments" in the abstract with "cryptographic commitment stakes and flexible payment settlement"
- Add `currency` and `trust_model` tags to all event schemas that reference amounts. Format: `["amount", "1500"], ["currency", "GBP"], ["trust_model", "custodial-escrow"]`
- Replace all `["expiry", ...]` tags with `["expiration", ...]` per NIP-40
- Add a "Referenced NIPs" section listing: NIP-33 (parameterised replaceable), NIP-40 (expiration), NIP-44 (encryption), NIP-17/NIP-59 (private messages), NIP-47 (wallet connect), NIP-57 (zaps for tips), NIP-58 (badges for verification), NIP-89 (app handlers), NIP-85 (reputation assertions)
- Add a "Payment Agnosticism" section explaining currency-neutral design, trust model transparency, and that Lightning is one option among many
- Add `no_show` as a terminal state in the core state machine alongside `completed` and `cancelled`
- Add `["linked_task", "<task_id>", "<relationship>"]` tag definition for follow-up/guarantee/escalation tasks
- Keep all existing kind definitions intact — this is additive, not destructive
- Use British English throughout

**Step 3: Verify**

Read back the modified file. Check: no references to "satoshis" as the only unit, expiration tags use NIP-40 format, trust_model tags present on stake events.

**Step 4: Commit**

```bash
git add specs/NIP-XX-core.md
git commit -m "Update core NIP spec for payment agnosticism and NIP-40 compliance"
```

---

### Task 2: Create specs/NIP-XX-stakes.md

**Files:**
- Create: `specs/NIP-XX-stakes.md`

**Step 1: Read source material**

Read design document section 2 (Payment Agnosticism — trust model table), section 8.2 (Milestone-Based Escrow), and the stake-related kinds from `specs/QUICK-REFERENCE.md` (kinds 30502, 30503, 30509, 30520, 30540).

Read the existing stake content from `specs/NIP-XX-core.md` to understand current schema.

**Step 2: Write the spec**

Create `specs/NIP-XX-stakes.md` with:
- Abstract: commitment stakes as a payment-agnostic escrow mechanism
- Event kinds: 30502 (Stake Lock), 30503 (Stake Negotiation), 30509 (Commitment Stake), 30520 (Stake Release), 30540 (Operator Bond)
- Each event kind: full JSON example with `amount`, `currency`, `trust_model` tags
- Trust model taxonomy: `trustless`, `custodial`, `custodial-escrow`, `custodial-third-party`, `federated`, `smart-contract`
- NIP-47 integration: how hold invoices map to lock/release/forfeit
- Milestone escrow: new kind 30506 (Milestone Completion) with partial release semantics
- No-show forfeiture: how `no_show` terminal state triggers automatic forfeiture
- Operator bonds: kind 30540 with slashing mechanism overview
- Guardian voting reference (kinds 30553-30554, detailed in disputes spec)
- British English throughout

**Step 3: Verify**

Read back. Check: all event kinds have JSON examples, trust_model tag present, currency tag present, NIP-47 referenced.

**Step 4: Commit**

```bash
git add specs/NIP-XX-stakes.md
git commit -m "Add modular stakes NIP specification"
```

---

### Task 3: Create specs/NIP-XX-reputation.md

**Files:**
- Create: `specs/NIP-XX-reputation.md`

**Step 1: Read source material**

Read design document section 4 (NIP-85 for reputation assertions, NIP-58 for badges). Read kinds 30517-30519, 30521, 30528, 30530 from `specs/QUICK-REFERENCE.md`. Read `src/nostr/reputation.js` for current implementation context.

**Step 2: Write the spec**

Create `specs/NIP-XX-reputation.md` with:
- Abstract: domain-agnostic reputation system using cryptographically signed ratings
- Event kinds: 30517 (Provider Rating), 30518 (Requester Rating), 30519 (Reputation Summary), 30521 (Reputation Export/Import), 30528 (Operator Reputation), 30530 (Reputation Rating)
- Rating criteria are defined by domain profiles, not hardcoded. The `tag` field on rating events is arbitrary — e.g. `["rating", "safety", "4"]`, `["rating", "punctuality", "5"]`
- Cross-domain portability: a provider's reputation follows them across operators and domains
- NIP-85 integration: operators SHOULD publish computed reputation summaries as kind 30382 events
- NIP-58 integration: verification badges (background check, insurance, licensing) as kind 30009/kind 8 events
- Anti-gaming: ratings are append-only, signed by the rater's pubkey, and cannot be modified by operators
- Crypto-shredding for GDPR: destroy key pair to make rating events unlinkable
- British English throughout

**Step 3: Commit**

```bash
git add specs/NIP-XX-reputation.md
git commit -m "Add modular reputation NIP specification"
```

---

### Task 4: Create specs/NIP-XX-disputes.md

**Files:**
- Create: `specs/NIP-XX-disputes.md`

**Step 1: Read source material**

Read kinds 30522-30524 (disputes), 30525-30527 (operator trust/slashing), 30549-30551 (abuse) from `specs/QUICK-REFERENCE.md`. Read `OPERATOR-MISBEHAVIOR-PROTOCOL.md` and `WATCHDOG-INCENTIVES.md` for guardian/watchdog mechanics.

**Step 2: Write the spec**

Create `specs/NIP-XX-disputes.md` with:
- Abstract: dispute resolution, guardian voting, operator accountability
- Event kinds: 30522 (Dispute Filing), 30523 (Arbiter Assignment), 30524 (Dispute Resolution), 30525 (Theft Report), 30526 (Watchdog Claim), 30527 (Operator Slashing), 30549 (Suspicious Activity), 30550 (Account Suspension), 30551 (Appeal)
- Dispute lifecycle: filing → evidence → arbiter assignment → resolution
- Guardian voting mechanism: how guardians vote on operator slashing proposals
- Evidence types: text, photo, GPS trace, signed event chain, price quotes
- Resolution outcomes: refund, penalty, mutual cancellation, escalation
- NIP-56 integration: standard Nostr reporting for cross-ecosystem visibility
- British English throughout

**Step 3: Commit**

```bash
git add specs/NIP-XX-disputes.md
git commit -m "Add modular disputes NIP specification"
```

---

### Task 5: Create specs/NIP-XX-discovery.md

**Files:**
- Create: `specs/NIP-XX-discovery.md`

**Step 1: Read source material**

Read design document section 4 (NIP-89 for app handlers, NIP-99 for service advertising). Read kind 30565 (Service Area) from `specs/QUICK-REFERENCE.md`. Read `ARCHITECTURE.md` for the discovery layer.

**Step 2: Write the spec**

Create `specs/NIP-XX-discovery.md` with:
- Abstract: geohash-based provider discovery and operator advertising
- Event kinds: 30565 (Service Area Definition), 30540 (Operator Bond — cross-ref to stakes spec)
- Geohash precision levels: precision 5 (~5km) for public discovery, exact coordinates only via NIP-17 encrypted messages
- Provider availability broadcasting: ephemeral events (kind 20xxx range) for real-time "I'm available at geohash X"
- NIP-89 integration: operators publish kind 31990 handler events declaring support for kinds 30500-30599
- NIP-99 integration: operators MAY publish kind 30402 classified listings for service advertising
- Multi-operator discovery: how clients find and choose between competing operators in a geohash area
- Privacy considerations: obfuscated locations, no exact addresses on public Nostr
- British English throughout

**Step 3: Commit**

```bash
git add specs/NIP-XX-discovery.md
git commit -m "Add modular discovery NIP specification"
```

---

### Task 6: Create specs/NIP-XX-safety.md

**Files:**
- Create: `specs/NIP-XX-safety.md`

**Step 1: Read source material**

Read kinds 30559-30564 from `specs/QUICK-REFERENCE.md`. Read design document section 8.4 (Session-Based Heartbeat). Read the security guard use case (section 7.10) for heartbeat requirements.

**Step 2: Write the spec**

Create `specs/NIP-XX-safety.md` with:
- Abstract: safety infrastructure for service coordination — emergency alerts, trip sharing, check-ins
- Event kinds: 30559 (Emergency Alert), 30560 (Task Sharing), 30561 (Safety Check-In Request), 30562 (Safety Check-In Response), 30563 (Safety Check-In Escalation), 30564 (Harassment Report)
- Heartbeat protocol: configurable check-in intervals, missed check-in thresholds, automatic escalation
- Emergency alert flow: panic button → operator safety team → emergency services (if needed)
- Trip sharing: how requesters share live task progress with trusted contacts
- NIP-17 integration: emergency contacts receive gift-wrapped live location
- Operator requirements: 24/7 safety monitoring, sub-60-second response time
- British English throughout

**Step 3: Commit**

```bash
git add specs/NIP-XX-safety.md
git commit -m "Add modular safety NIP specification"
```

---

### Task 7: Create specs/NIP-XX-navigation.md

**Files:**
- Create: `specs/NIP-XX-navigation.md`

**Step 1: Read source material**

Read kinds 30583-30587 from `specs/QUICK-REFERENCE.md`. Read `implementation/NAVIGATION-README.md` for provider context.

**Step 2: Write the spec**

Create `specs/NIP-XX-navigation.md` with:
- Abstract: navigation and routing events for location-based service coordination
- Event kinds: 30583 (Route Suggestion), 30584 (Turn-by-Turn Navigation), 30585 (Traffic Alert), 30586 (Reroute Request), 30587 (Navigation Feedback)
- Route encoding: GeoJSON LineString for route geometry
- ETA calculation: provider-agnostic (OSRM, ORS, or any routing engine)
- Privacy: route data is ephemeral or NIP-44 encrypted, never stored permanently
- British English throughout

**Step 3: Commit**

```bash
git add specs/NIP-XX-navigation.md
git commit -m "Add modular navigation NIP specification"
```

---

### Task 8: Create specs/NIP-XX-payments.md

**Files:**
- Create: `specs/NIP-XX-payments.md`

**Step 1: Read source material**

Read design document section 2 (Payment Agnosticism). Read kinds 30510-30511, 30513-30516, 30538 from `specs/QUICK-REFERENCE.md`. Read `payment-providers/base.js` for current interface.

**Step 2: Write the spec**

Create `specs/NIP-XX-payments.md` with:
- Abstract: currency-neutral payment events for service coordination
- Event kinds: 30510 (Streaming Payment), 30511 (Payment Confirmation), 30513 (Provider Tip), 30514 (Wait Time Charge), 30515 (No-Show Fee), 30516 (Additional Charge), 30538 (Payment Failure)
- All events include `amount`, `currency`, `trust_model` tags
- Streaming payments: per-second or per-metre increments, currency-neutral
- NIP-47 integration: how Nostr Wallet Connect enables direct wallet-to-wallet payments
- NIP-57 integration: tips MAY be implemented as standard Nostr zaps on completion events
- Payment provider trust model taxonomy (table from design document appendix C)
- British English throughout

**Step 3: Commit**

```bash
git add specs/NIP-XX-payments.md
git commit -m "Add modular payments NIP specification"
```

---

### Task 9: Update specs/QUICK-REFERENCE.md

**Files:**
- Modify: `specs/QUICK-REFERENCE.md`

**Step 1: Read current file and design doc**

Read full `specs/QUICK-REFERENCE.md`. Read design document section 3 (Modular NIP structure).

**Step 2: Update the reference**

- Update the specification structure table to list all 8 modular NIPs (core, stakes, reputation, disputes, discovery, safety, navigation, payments)
- Fix kind range from 30500-30699 to 30500-30599 (primary) + 30600-30639 (domain extensions)
- Add new kinds: 30506 (Milestone Completion)
- Add `no_show` to the core state machine
- Add currency/trust_model tags to the common tags section
- Add NIP-40 expiration tag to common tags
- Reference all modular spec files
- British English throughout

**Step 3: Commit**

```bash
git add specs/QUICK-REFERENCE.md
git commit -m "Update quick reference for modular NIP structure"
```

---

## Phase 2: Core Documentation Rewrites

These documents exist and need updating. Each is independent and can be parallelised.

### Task 10: Rewrite README.md

**Files:**
- Modify: `README.md`

**Step 1: Read current file**

Read full `README.md` (399 lines).

**Step 2: Rewrite**

The README should lead with "service coordination protocol" not "ridesharing". Key changes:
- Title: "DonkeyRide — Open Protocol for Trust-Minimised Service Coordination"
- Lead paragraph: protocol like HTTP/SMTP, not a company. Mention ridesharing, locksmith, delivery, and 7 more use cases
- Payment section: currency-neutral, trust model transparency. Bitcoin rails with fiat UX. Strike for fiat, NIP-47 for sovereignty
- Architecture summary: updated three-layer diagram with thin operator
- Use case showcase: table of 10 use cases with status (3 implemented, 7 designed)
- Feature comparison table: update for payment agnosticism
- Getting started: unchanged (npm, Nix, Docker commands)
- Modular NIP structure: link to specs/ directory
- British English throughout

**Step 3: Commit**

```bash
git add README.md
git commit -m "Rewrite README for service coordination protocol vision"
```

---

### Task 11: Rewrite ARCHITECTURE.md

**Files:**
- Modify: `ARCHITECTURE.md`

**Step 1: Read current file**

Read full `ARCHITECTURE.md` (500 lines).

**Step 2: Rewrite**

Key changes:
- Update architecture diagram: NIP-47 for stakes, NIP-17 for PII, NIP-44 for coordination
- Replace NIP-04 references with NIP-44 (NIP-04 is deprecated)
- Update decentralisation scorecard with new column showing proposed improvements
- Add "What Moved Off the Operator" section from design document section 5
- Update "Could We Be MORE Decentralised?" section — some of those "attempts" are now happening
- Thin operator description: safety + background checks + insurance only
- Payment layer: no longer "100% decentralised (Lightning)" — now "flexible (multiple providers with trust model transparency)"
- Keep the honest "we are federated" framing — it's still true and still the right answer
- British English throughout

**Step 3: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "Rewrite architecture for thin operator and payment agnosticism"
```

---

### Task 12: Rewrite TRUST-MECHANISMS.md

**Files:**
- Modify: `TRUST-MECHANISMS.md`

**Step 1: Read current file**

Read full `TRUST-MECHANISMS.md` (489 lines).

**Step 2: Rewrite**

Key changes:
- Keep the 6-layer structure — it's solid
- Layer 1 (Reputation): add NIP-85 computed summaries, NIP-58 badges
- Layer 2 (Operator Bonds): unchanged, still Nostr-published
- Layer 3 (Insurance Pool): unchanged
- Layer 4 (Progressive Limits): generalise from sats to currency-neutral amounts
- Layer 5 (Multi-Sig): generalise, mention Fedimint as an option
- Layer 6 (Trustless): generalise from Lightning hodl invoices to NIP-47 + any trustless provider
- Add trust model transparency section: table of providers with trust models (from design doc appendix C)
- Update real-world scenarios to use currency-neutral amounts
- British English throughout

**Step 3: Commit**

```bash
git add TRUST-MECHANISMS.md
git commit -m "Rewrite trust mechanisms for payment-agnostic trust profiles"
```

---

### Task 13: Rewrite STAKING-EXPLAINED.md

**Files:**
- Modify: `STAKING-EXPLAINED.md`

**Step 1: Read current file**

Read full `STAKING-EXPLAINED.md` (249 lines).

**Step 2: Rewrite**

Key changes:
- Currency-neutral: amounts as value+currency, not sats-only
- Trust model per provider: explain what trustless vs custodial means for stakes
- NIP-47 flow: how hold invoices work directly between wallets
- Strike flow: how fiat users get stakes via Strike
- Milestone escrow: explain partial release at milestones
- No-show forfeiture: automatic stake penalty when no_show state is reached
- Keep the simple explanations — this is a user-facing document
- British English throughout

**Step 3: Commit**

```bash
git add STAKING-EXPLAINED.md
git commit -m "Rewrite staking guide for currency-neutral stakes and milestone escrow"
```

---

### Task 14: Rewrite FAQ.md

**Files:**
- Modify: `FAQ.md`

**Step 1: Read current file**

Read full `FAQ.md` (742 lines).

**Step 2: Rewrite**

Key changes:
- Broaden from ridesharing to all use cases
- Add payment method FAQ: "Do I need Bitcoin?", "What payment methods are supported?", "What is a trust model?"
- Add GDPR FAQ: "What data is stored where?", "Can I delete my data?", "What is crypto-shredding?"
- Add use case FAQ: "What services does DonkeyRide support?", "How do I add a new domain?"
- Update technical FAQ for modular NIP structure
- Remove ridesharing-specific assumptions from generic questions
- British English throughout

**Step 3: Commit**

```bash
git add FAQ.md
git commit -m "Rewrite FAQ for multi-domain protocol and payment agnosticism"
```

---

### Task 15: Rewrite PLATFORM-COMPARISON.md

**Files:**
- Modify: `PLATFORM-COMPARISON.md`

**Step 1: Read current file**

Read full `PLATFORM-COMPARISON.md` (340 lines).

**Step 2: Rewrite**

Key changes:
- Update comparison for payment agnosticism — no longer Lightning-only
- Add payment method comparison row
- Add trust model comparison row
- Broaden from ridesharing to service coordination
- Add comparison with TaskRabbit, Deliveroo, AA (cover multiple domains)
- British English throughout

**Step 3: Commit**

```bash
git add PLATFORM-COMPARISON.md
git commit -m "Update platform comparison for multi-domain and payment agnosticism"
```

---

## Phase 3: New Documents

These don't exist yet and need creating. All are independent.

### Task 16: Create docs/GDPR-COMPLIANCE.md

**Files:**
- Create: `docs/GDPR-COMPLIANCE.md`

**Step 1: Read design document section 6**

Read design document section 6 (GDPR Compliance Strategy) in full.

**Step 2: Write the document**

Create `docs/GDPR-COMPLIANCE.md` covering:
- Three-layer compliance architecture (Nostr public/pseudonymous, Operator private/compliant, Payment providers third-party)
- What data goes where: table of data types with storage layer and GDPR basis
- Crypto-shredding: how it works, regulatory position (CNIL, EDPB, ICO)
- NIP-62 (Request to Vanish): relay-side deletion
- Right to erasure implementation: step-by-step for operators
- Pseudonymous identifiers: Nostr pubkeys are personal data (Breyer ruling)
- Encrypted data on relays: NIP-44 ciphertext, relay operator's GDPR status
- Data controller analysis: who is controller for what
- Operator checklist: DPIA, ROPA, DPO, privacy notice, retention policies
- UK GDPR / Data (Use and Access) Act 2025 notes
- British English throughout

**Step 3: Commit**

```bash
git add docs/GDPR-COMPLIANCE.md
git commit -m "Add GDPR compliance guide for operators"
```

---

### Task 17: Create docs/USE-CASE-STATE-MACHINES.md

**Files:**
- Create: `docs/USE-CASE-STATE-MACHINES.md`

**Step 1: Read design document section 7**

Read design document section 7 (Use Case State Machines) in full — all 10 use cases.

**Step 2: Write the document**

Create `docs/USE-CASE-STATE-MACHINES.md` containing all 10 use case state machines from the design document:
1. Ridesharing (DonkeyRide) — with gaps noted
2. Locksmith (DonkeyKnock) — with gaps noted
3. Parcel Delivery (DonkeyPack) — with gaps noted
4. Man with Van (DonkeyHaul)
5. Mobile Car Wash (DonkeyShine)
6. Court Process Serving (DonkeyServe)
7. Roadside Assistance (DonkeyRescue)
8. Food Delivery (DonkeyEats)
9. Emergency Trades (DonkeyFix)
10. Security Guard Dispatch (DonkeyGuard)

For each: Mermaid state diagram, roles, pricing model, discovery method, real-world edge cases, rating criteria, regulatory requirements, protocol gaps identified.

Include the pattern summary table (Linear dispatch, Dispatch+quote, Pickup→deliver, Attempt loop, Continuous session).

Include appendix B (Mandatory Regulatory Checks by Domain) from design document.

- British English throughout

**Step 3: Commit**

```bash
git add docs/USE-CASE-STATE-MACHINES.md
git commit -m "Add detailed state machines for 10 use cases"
```

---

### Task 18: Create docs/PAYMENT-PROVIDERS.md

**Files:**
- Create: `docs/PAYMENT-PROVIDERS.md`

**Step 1: Read design document sections 2 and appendix C**

Read design document section 2 (Payment Agnosticism) and appendix C (Payment Provider Trust Model Matrix). Also read `payment-providers/base.js` and `payment-providers/factory.js`.

**Step 2: Write the document**

Create `docs/PAYMENT-PROVIDERS.md` covering:
- Payment agnosticism overview: Bitcoin rails with fiat UX
- Trust model taxonomy: trustless, custodial, custodial-escrow, custodial-third-party, federated, smart-contract
- Full provider matrix (appendix C from design document)
- Provider interface: lockStake, releaseStake, forfeitStake with currency-neutral amounts
- NIP-47 (Nostr Wallet Connect): detailed integration guide for hold invoices
- Strike integration: fiat UX with Lightning rails
- Stripe integration: pure fiat with escrow
- Adding a new payment provider: implement the base interface, declare trust model and currencies
- Milestone escrow: partialRelease interface for trades/services
- Configuration: PAYMENT_PROVIDER, PAYMENT_FALLBACKS env vars
- British English throughout

**Step 3: Commit**

```bash
git add docs/PAYMENT-PROVIDERS.md
git commit -m "Add payment providers integration guide"
```

---

### Task 19: Update docs/USE-CASES.md

**Files:**
- Modify: `docs/USE-CASES.md`

**Step 1: Read current file**

Read full `docs/USE-CASES.md` (567 lines).

**Step 2: Update**

- Add state machine references: for each of the top 10 use cases, link to the detailed state machine in `docs/USE-CASE-STATE-MACHINES.md`
- Update protocol fit scores if any changed during sense-checking
- Add any new use cases identified during brainstorming
- Add "Protocol Gaps" column noting which gaps each use case surfaced
- Update payment references for currency-neutral language
- British English throughout

**Step 3: Commit**

```bash
git add docs/USE-CASES.md
git commit -m "Update use cases with state machine cross-references"
```

---

### Task 20: Update guides/OPERATOR-DEPLOYMENT.md

**Files:**
- Modify: `guides/OPERATOR-DEPLOYMENT.md`

**Step 1: Read current file**

Read full `guides/OPERATOR-DEPLOYMENT.md` (106 lines).

**Step 2: Update**

- Add GDPR compliance section: link to `docs/GDPR-COMPLIANCE.md`, checklist items (DPIA, ROPA, DPO, NIP-62 relay)
- Add payment provider configuration: how to set up Strike, NIP-47, Stripe, etc.
- Add domain selection: how to choose and configure a domain profile
- Add NIP-62 relay requirement: operators SHOULD run NIP-62-compliant relays
- British English throughout

**Step 3: Commit**

```bash
git add guides/OPERATOR-DEPLOYMENT.md
git commit -m "Update operator deployment guide with GDPR and payment setup"
```

---

### Task 21: Update guides/QUICK-START.md

**Files:**
- Modify: `guides/QUICK-START.md`

**Step 1: Read current file**

Read full `guides/QUICK-START.md` (369 lines).

**Step 2: Update**

- Add domain selection step: `DOMAIN=locksmith npm start` etc.
- Add payment provider selection: brief overview of options with link to `docs/PAYMENT-PROVIDERS.md`
- Update language from ridesharing-specific to generic service coordination
- British English throughout

**Step 3: Commit**

```bash
git add guides/QUICK-START.md
git commit -m "Update quick start guide for multi-domain and payment options"
```

---

### Task 22: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Read current file**

Read full `CLAUDE.md` (154 lines).

**Step 2: Update**

- Add modular NIP structure to Architecture section: list all 8 specs
- Add payment agnosticism note: currency-neutral amounts, trust model tags
- Add GDPR section: crypto-shredding, NIP-62, three-layer architecture
- Update "Key Design Constraints" with: currency neutrality, NIP-40 expiration tags, NIP-44 not NIP-04
- Add new use case domains to project overview
- British English throughout

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Update CLAUDE.md for protocol redesign"
```

---

## Phase 4: Cleanup

### Task 23: Clean up root-level completion reports

**Files:**
- Move or delete: `BACKEND-API-COMPLETE.md`, `DOCKER-INFRASTRUCTURE-COMPLETE.md`, `DOCUMENTATION-FINAL.md`, `LAUNCH-READY.md`, `MULTI-OPERATOR-COMPLETE.md`, `MVP-COMPLETE.md`, `MVP-PLAN.md`, `MVP-TESTING.md`, `PHASE-0-COMPLETE.md`, `QUICK-START-TESTING.md`, `REACT-APPS-PLAN.md`, `RUN-MVP.md`, `STAGING-SETUP.md`, `TEST-ENVIRONMENT-COMPLETE.md`, `RIDER-EXPERIENCE.md`

**Step 1: Identify stale files**

These are build/completion reports from earlier development phases. They document what WAS done, not what the project IS. They clutter the root directory and confuse newcomers.

**Step 2: Move to archive**

```bash
mkdir -p docs/archive
git mv BACKEND-API-COMPLETE.md docs/archive/
git mv DOCKER-INFRASTRUCTURE-COMPLETE.md docs/archive/
git mv DOCUMENTATION-FINAL.md docs/archive/
git mv LAUNCH-READY.md docs/archive/
git mv MULTI-OPERATOR-COMPLETE.md docs/archive/
git mv MVP-COMPLETE.md docs/archive/
git mv MVP-PLAN.md docs/archive/
git mv MVP-TESTING.md docs/archive/
git mv PHASE-0-COMPLETE.md docs/archive/
git mv QUICK-START-TESTING.md docs/archive/
git mv REACT-APPS-PLAN.md docs/archive/
git mv RUN-MVP.md docs/archive/
git mv STAGING-SETUP.md docs/archive/
git mv TEST-ENVIRONMENT-COMPLETE.md docs/archive/
git mv RIDER-EXPERIENCE.md docs/archive/
```

**Step 3: Commit**

```bash
git commit -m "Archive historical completion reports to docs/archive/"
```

---

### Task 24: Retire root-level NIP-XX-ridesharing.md

**Files:**
- Move: `NIP-XX-ridesharing.md`

**Step 1: Verify specs/ has equivalent**

Confirm `specs/NIP-XX-v1-archive.md` (7,895 lines) is an exact copy of the root-level `NIP-XX-ridesharing.md` (7,895 lines). If so, the root-level copy is redundant.

**Step 2: Move to archive and leave redirect**

```bash
git mv NIP-XX-ridesharing.md docs/archive/NIP-XX-ridesharing-root-copy.md
```

**Step 3: Verify root-level QUICK-REFERENCE.md**

Check if root `QUICK-REFERENCE.md` is superseded by `specs/QUICK-REFERENCE.md`. If so, archive it too:

```bash
git mv QUICK-REFERENCE.md docs/archive/QUICK-REFERENCE-root-copy.md
```

**Step 4: Commit**

```bash
git commit -m "Archive root-level NIP and quick reference (superseded by specs/)"
```

---

### Task 25: Update specs/ domain extensions for payment agnosticism

**Files:**
- Modify: `specs/NIP-XX-ridesharing.md`
- Modify: `specs/NIP-XX-locksmith.md`
- Modify: `specs/NIP-XX-delivery.md`

**Step 1: Read each file**

Read all three domain extension specs.

**Step 2: Update each**

For each domain extension:
- Add `currency` and `trust_model` tags to any event schemas with amounts
- Replace `["expiry", ...]` with `["expiration", ...]` per NIP-40
- Add reference to NIP-XX-stakes.md for stake-related events
- Add reference to NIP-XX-payments.md for payment-related events
- Ensure state machines match the sense-checked versions from design doc section 7
- Add identified gaps (no_show, delivery_failed, back-transitions) as noted issues
- British English throughout

**Step 3: Commit**

```bash
git add specs/NIP-XX-ridesharing.md specs/NIP-XX-locksmith.md specs/NIP-XX-delivery.md
git commit -m "Update domain extension specs for payment agnosticism and NIP-40"
```

---

## Execution Summary

| Phase | Tasks | Can Parallelise? |
|-------|-------|-----------------|
| Phase 1: NIP Specs | Tasks 1-9 | Yes (all independent files) |
| Phase 2: Core Docs | Tasks 10-15 | Yes (all independent files) |
| Phase 3: New Docs + Updates | Tasks 16-22 | Yes (all independent files) |
| Phase 4: Cleanup | Tasks 23-25 | Sequentially (23 before 24) |

**Total: 25 tasks, ~25 commits**

Tasks within each phase are independent and can be dispatched to parallel subagents. Phases should be executed in order (specs first, then docs that reference them, then cleanup).
