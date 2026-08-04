# Export compliance for the iOS driver app

Apple asks, for every build, whether the app "uses encryption". The honest
answer here is yes, and `ITSAppUsesNonExemptEncryption` is `true` in
`web/ios/App/App/Info.plist` accordingly.

This document records why, so nobody has to re-derive it — and so nobody
quietly flips the flag to `false` to make the questionnaire go away.

> Engineering notes, not legal advice. An operator shipping this app under
> their own developer account is making their own declaration and should take
> their own view.

## What the app actually encrypts

| Where | What | Exempt? |
|---|---|---|
| Every API and socket call | TLS | Yes — standard, and Apple does not count it |
| Nostr event signing | secp256k1 Schnorr signatures | Yes — digital signature |
| Rider ↔ driver chat | NIP-44 (ChaCha20 + HMAC-SHA256) inside NIP-17 gift wraps | **No** |
| Trip sharing, ride-check alerts, panic | Same NIP-17 rail to the rider's own contacts | **No** |
| Trip audio at rest | AES-GCM, key derived from the user's key + task id | **No** |
| The 30078 state snapshot | NIP-44, sealed to the operator's own key | **No** |
| Pickup verification PIN | NIP-44 ECDH conversation key | **No** |

The exemption in Apple's questionnaire — and in EAR Note 4 to Category 5
Part 2 — covers encryption used for authentication, digital signatures,
copy protection or DRM. **End-to-end messaging is none of those.** The
whole point of the chat rail is that the operator cannot read it, which is
exactly the functionality the regulation is written about.

So `false` would be a false statement, to Apple and to the US Bureau of
Industry and Security. Do not set it.

## The authorisation relied on

**License Exception TSU, EAR §740.13(e)** — "publicly available" encryption
source code.

DonkeyRide is MIT licensed and the complete corresponding source, including
every cryptographic routine and the iOS wrapper, is public at
<https://github.com/TheCryptoDonkey/DonkeyRide>. Object code compiled from
publicly available source qualifies under the same paragraph.

TSU is self-executing: there is no licence to apply for and nothing to wait
for. It requires **one notification email**, once, at or before the time the
source is made publicly available. Sending it again for a new release is
harmless but unnecessary.

### The notification

Send to **crypt@bis.doc.gov** and **enc@nsa.gov**, subject
`TSU notification — publicly available encryption source code`:

```
This is a notification under 15 CFR §740.13(e) that encryption source
code which is publicly available is posted at the following URL:

  https://github.com/TheCryptoDonkey/DonkeyRide

Project:   DonkeyRide — reference implementation of the TROTT protocol
Licence:   MIT
Contact:   <name>, <email>

The source is available to the public without restriction, at no cost,
and without a written agreement of any kind. It implements end-to-end
encrypted messaging (NIP-44 / NIP-17 over the Nostr protocol) and
authenticated encryption of locally stored data (AES-GCM).

Object code compiled from this source is distributed as an iOS
application (bundle identifier app.donkeyride.driver) and an Android
application, both under the same licence.
```

Keep a copy of the sent mail. That, plus this file, is the record.

### Restrictions that still apply

TSU does not authorise export to embargoed destinations, and it does not
cover a party on a denied-persons list. Apple's own territory controls in
App Store Connect handle most of this; do not sell into an embargoed country
because the exception is not a general licence.

## What to answer in App Store Connect

The questionnaire appears once per version:

1. *Does your app use encryption?* — **Yes**
2. *Does it qualify for any of the exemptions?* — **Yes**, the one for
   software with publicly available source code (TSU).
3. If asked for a CCATS or ERN number: there is none, and none is required
   under TSU.

Answer it the same way each version. If the answers ever stop matching this
file, one of the two is wrong.

## If an operator does not want to publish their source

TSU depends entirely on the source being public. A fork kept private cannot
use it, and would need mass-market self-classification under License
Exception ENC §740.17(b), which means an annual self-classification report
to BIS. That is a different route with a recurring obligation — worth
knowing before closing a fork.
