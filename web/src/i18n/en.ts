/**
 * English — the source dictionary. Every key used anywhere in the app must
 * exist here; other locales fall back to these strings key-by-key.
 *
 * `dyn.*` keys translate dynamic strings the server sends (domain-profile
 * role names and labels). English needs none — td() falls back to the
 * server's own string.
 */
export const en: Record<string, string> = {
  // Common
  'common.you': 'You',
  'common.back': 'Back',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.dismiss': 'Dismiss',
  'common.next': 'Next',
  'common.skip': 'Skip',
  'common.save': 'Save',
  'common.clear': 'Clear',
  'common.view': 'View',
  'common.now': 'Now',
  'common.later': 'Later',
  'common.online': 'Online',
  'common.offline': 'Offline',
  'common.connecting': 'Connecting...',
  'common.accept': 'Accept',
  'common.accepting': 'Accepting...',
  'common.decline': 'Decline',
  'common.recent': 'Recent',
  'common.stop': 'stop',
  'common.stops': 'stops',

  // Rider home
  'home.searchOrigin': '{label}: search address or tap the map',
  'home.whereTo': 'Where to?',
  'home.currentLocation': 'Current location',
  'home.locating': 'Finding where you are...',
  'home.noFix': 'Search or tap the map to set your {label}',
  'home.change': 'Change',
  'home.movePickup': 'Drag the pin, tap the map, or search to move your {label}.',
  'home.useMyLocation': 'Use my current location',
  'home.searchDestination': 'Destination: search address or tap the map',
  'home.selectDestination': 'Select your destination to get a fare estimate',
  'home.confirm': 'Confirm {label}',
  'home.nearby': '{n} {label} nearby',
  'home.available': '{n} {label} available',
  'home.searching': 'Searching for {label}...',
  'home.locationLater': 'Location services will be used when your {noun} begins',
  'home.pastTasks': 'Your past {noun}s',
  'home.howItWorks': 'How it works',

  // Request / estimate
  'request.optionTitle': 'Choose your ride',
  'request.noteTitle': 'Anything your {label} should know?',
  'request.notePlaceholder': 'e.g. black gate, side entrance',
  'request.noteHint': 'Only the matched provider sees this. Never published.',
  'request.favouritesFirst': 'Your {n} saved provider(s) get first refusal for 45 seconds.',
  'request.stopsTitle': 'Stops along the way',
  'request.addStop': '+ Add a stop',
  'request.searchStop': 'Search for a stop...',
  'request.stopsNote': 'Your {label} visits each stop in order — the fare covers the full route.',
  'request.stopLabel': 'Stop {n}',
  'request.whenTitle': 'When do you need it?',
  'request.scheduleInvalid': 'Pick a time between 20 minutes and 30 days from now.',
  'request.scheduleNote': "A {label} can commit early — you'll both get a reminder as the time approaches.",
  'request.estimating': 'Calculating estimate...',
  'request.fareBreakdown': 'Fare breakdown',
  'request.base': 'Base',
  'request.distance': 'Distance',
  'request.operator': 'Operator',
  'request.time': 'Time',
  'request.includesFee': 'Includes operator fee',
  'request.straightLine': 'Estimated in a straight line — the router was unreachable.',
  'request.requesting': 'Requesting...',
  'request.bookForLater': 'Book {label} for later',
  'request.request': 'Request {label}',
  'request.bookLater': 'Book for later',
  'request.estimateFailed': 'Failed to get estimate',
  'request.originSet': '{label} set',
  'request.ready': 'Ready to request a {noun}',


  // Active task — rider
  'active.noteTitle': 'Note for your provider',
  'active.notePlaceholder': 'e.g. black gate, side entrance',
  'active.saveNote': 'Send note to your {label}',
  'active.noteSaved': 'Note sent',
  'active.arriving': 'Arriving',
  'active.arrivingIn': '{n} min',
  'active.tripTime': 'Trip time',
  'active.movedTitle': 'Moved? Update your {label}',
  'active.movedBody': 'You can move the {label} until they arrive.',
  'active.moveTitle': 'Move your {label}',
  'active.imHereNow': "I'm here now",
  'active.moving': 'Moving...',
  'active.searchPickup': 'Search for a new {label}...',
  'active.moveLimit': 'Short moves only — your {label} agreed to come to roughly this spot, and the fare will not change.',
  'active.moveFree': 'Nobody has committed yet, so the fare updates with the new route.',
  'active.moveDrag': 'You can also drag the pin on the map.',
  'active.pickupMoved': '{label} updated',
  'active.pickupMoveFailed': 'Could not move the pickup',

  // Waiting time
  'waiting.title': 'Waiting at the pickup',
  'waiting.freeRider': '{time} of free waiting left, then the fare grows by the minute.',
  'waiting.freeProvider': 'Free waiting for another {time}, then waiting is added to the fare.',
  'waiting.chargingRider': 'Waiting is now being added to your fare, by the minute.',
  'waiting.chargingProvider': 'Waiting is now being added to the fare.',
  'waiting.chargedTitle': 'Waiting time',
  'waiting.charged': '{n} min added to the agreed fare:',

  // Driver dashboard
  'dash.title': '{label} Dashboard',
  'dash.fee': 'Fee: {fee}',
  'dash.active': 'Active',
  'dash.completed': 'Completed',
  'dash.total': 'Total',
  'dash.waiting': 'Waiting {noun} requests ({n})',
  'dash.booked': 'Booked {time}',
  'dash.noGps': 'Location unavailable. You will not receive {noun} requests until location is enabled.',
  'dash.goOnline': 'Go Online',
  'dash.goOffline': 'Go Offline',
  'dash.earnings': 'Earnings',
  'dash.areas': 'Working Areas',
  'dash.headingTo': 'Heading to',
  'dash.corridorNote': 'Only {noun} requests on your way are shown',
  'dash.headingPrompt': 'Where are you heading?',
  'dash.searchDestination': 'Search for your destination...',
  'dash.headingCta': 'Heading somewhere? Only see {noun}s on your way →',
  'dash.listening': 'Listening for {noun} requests...',
  'dash.connectingDispatcher': 'Connecting to dispatcher...',
  'dash.androidNote': 'Driving on Android?',
  'dash.getApp': 'Get the app',
  'dash.screenOff': '— jobs keep arriving with the screen off.',
  'dash.ready': 'Ready to receive {noun} requests',

  // Incoming job
  'incoming.title': 'Incoming {noun}',
  'incoming.needsService': 'A {label} needs your service',
  'incoming.new': 'New {label} {noun}',
  'incoming.bookedCommit': 'Booked for {time} — accepting commits you to that time',
  'incoming.approx': 'Locations are approximate until you accept',
  'incoming.taken': 'This job has been taken',
  'incoming.acceptFailed': 'Failed to accept the job',

  // Profile / account
  'profile.title': 'Your account',
  'profile.intro':
    'No sign-up, no phone number: your account lives on this device and belongs to you, not to any company. Back up the recovery key below and your account and ratings travel with you.',
  'profile.accountId': 'Account ID',
  'profile.accountIdNote': 'Safe to share — this is how others see your ratings.',
  'profile.copyId': 'Copy ID',
  'profile.copied': 'Copied ✓',
  'profile.recoveryKey': 'Recovery key',
  'profile.recoveryNote':
    'Anyone with this key can act as you. Store it somewhere safe (password manager). Never share it with support, operators, or anyone who asks.',
  'profile.copyRecovery': 'Copy recovery key',
  'profile.revealRecovery': 'Reveal recovery key',
  'profile.restore': 'Restore from backup',
  'profile.restoreNote':
    'Moving from another phone? Paste your recovery key (starts nsec1…) to bring your account and ratings to this device.',
  'profile.replace': 'Replace account on this device',
  'profile.standing': 'Your standing',
  'profile.standingNote': 'What others see when they check you: ratings signed by the people you have worked with, read from public relays and verified on this device. No operator can raise or lower it.',
  'profile.language': 'Language',
  'profile.languageNote': 'Choose the language of the app on this device.',

  // Onboarding — provider
  'onboard.p1.title': 'Go online, pick your jobs',
  'onboard.p1.body':
    'See every open request near you or in areas you draw on the map — you choose the work, nothing is assigned to you.',
  'onboard.p2.title': 'Keep 100% of every fare',
  'onboard.p2.body':
    'Riders pay you directly — cash, M-Pesa or Lightning. No commission, no payout delays: the money never passes through anyone else.',
  'onboard.p3.title': 'Never miss a job',
  'onboard.p3.body': 'Allow notifications when you go online and jobs reach you even with your screen off.',
  'onboard.p3.hint':
    'On iPhone: tap Share → “Add to Home Screen” first — iOS only delivers notifications to installed apps.',

  // Onboarding — rider
  'onboard.r1.title': 'A ride in seconds — no sign-up',
  'onboard.r1.body':
    'No account, no phone number, no card on file. Tap the map, see the price up front, and request.',
  'onboard.r2.title': 'Pay your driver, not a company',
  'onboard.r2.body':
    'Settle directly in cash, M-Pesa or Lightning. Nobody stands between you and your driver — and nobody takes a cut.',
  'onboard.r3.title': 'Private by design',
  'onboard.r3.body':
    'Live tracking, a panic button, encrypted chat with your driver, and driver ratings that cannot be faked. Your trip history is nobody’s product.',
  'onboard.go': "Let's go",

  // Women-only matching
  'women.title': "Women's safety",
  'women.iAmAWoman': "I'm a woman",
  'women.selfDeclared':
    'Self-declared — DonkeyRide has no accounts and cannot verify gender. Always check the car, registration and pickup code before getting in.',
  'women.driverOnly': 'Only receive requests from women',
  'women.driverOnlyNote': "You'll only be sent women-only requests.",
  'women.requestToggle': 'Women {label} only',
  'women.requestNote': 'Only {label} who have declared they are women will see this request.',
  'women.badge': 'Women-only',
  'women.incomingNote': 'The {label} asked for a woman {provider}. Accepting declares that you are one.',

  // Trip audio recording
  'audio.record': 'Record audio',
  'audio.recording': 'Recording audio…',
  'audio.stop': 'Stop',
  'audio.start': 'Start recording',
  'audio.consent':
    'Recorded on your phone only, encrypted to your account key, deleted after 72 hours unless you export it. The other participant is notified in chat. Recording-consent laws vary by place — you are responsible for complying with yours.',
  'audio.chatNotice': '🎙 Audio recording is on for this trip (stored only on my phone).',
  'audio.saved': 'Saved on this phone — deleted after 72 hours unless exported',
  'audio.savedShort': 'Recording saved',
  'audio.download': 'Download',
  'audio.delete': 'Delete',

  // Address search
  'search.failed': 'Address search failed. Tap the map to set the location instead.',
  'search.saveFailed': 'Could not save — check the name, or remove an old place first.',
  'search.placeName': 'Name (e.g. Home)',

  // Access needs — requirements, never a price band
  'access.riderTitle': 'Do you need anything for this journey?',
  'access.riderHint': 'These never change the price. They match you with someone who can meet them.',
  'access.riderNote': 'Only providers who have said they can meet these will see your request.',
  'access.providerTitle': 'What can you offer?',
  'access.providerHint': 'Only tick what is genuinely true — someone will be relying on it.',
  'access.providerNote': 'You will now receive requests that need these.',

  // Demand pricing
  'surge.title': 'Busy right now — fares are {x}×',
  'surge.body': 'More people are asking for a ride than there are {label} free nearby. The whole increase goes to your driver; this operator takes no cut. The price above is what you pay.',

  // History and receipts
  'history.title': 'Your {noun}s',
  'history.deviceOnly': 'Stored on this device only — the operator keeps no record of your past {noun}s.',
  'history.empty': 'No {noun}s on this device yet.',
  'history.completed': 'Completed',
  'history.again': 'Book this again →',
  'history.viewReceipt': 'View receipt',
  'history.clear': 'Clear history',
  'history.clearPrompt': 'Clear history from this device',
  'receipt.title': 'Receipt',
  'receipt.total': 'Total fare',
  'receipt.tip': 'Tip',
  'receipt.waiting': 'Waiting ({n} min)',
  'receipt.surge': 'Includes a {x}× demand multiplier, shown before you booked.',
  'receipt.driver': 'Driver:',
  'receipt.paidBy': 'paid by {rail}',
  'receipt.stored': 'This receipt is stored on your device. The operator holds no copy.',
  'receipt.rebook': 'Book again',

  // Panic / SOS — must read in the user's own language
  'panic.label': 'PANIC / SOS',
  'panic.aria': 'Emergency alert — press and hold for three seconds',
  'panic.holding': 'HOLD TO CONFIRM...',
  'panic.sending': 'SENDING ALERT...',
  'panic.retry': 'RETRY PANIC / SOS',
  'panic.sent': 'EMERGENCY ALERT SENT',
  'panic.sentBody': 'Your trusted contacts and the operator have been alerted',
  'panic.call': 'Call {number} — emergency services',
  'panic.failed': 'ALERT FAILED',
  'panic.callDirect': 'Call {number} directly',

  // Ride check ("Everything OK?")
  'ridecheck.title': 'Everything OK?',
  'ridecheck.offRoute': 'Your trip has left the expected route.',
  'ridecheck.stopped': 'You seem to have been stopped for a while.',
  'ridecheck.willAlert': 'If you do not respond, the {n} contact(s) you shared this trip with will be alerted in {s}s.',
  'ridecheck.notShared': 'This trip has not been shared with anyone — use the panic button below if you need help.',
  'ridecheck.fine': "I'm fine",
  'ridecheck.alertNow': 'Alert contacts now',

  // Tips
  'tip.title': 'Tip',
  'tip.custom': 'Custom amount',
  'tip.send': 'Send tip',
  'tip.sending': 'Sending...',
  'tip.recorded': 'Tip recorded. Thank you.',
  'tip.failed': 'Could not send the tip',

  // Settlement (driver confirming the rider paid)
  'settle.declared': 'Payment declared',
  'settle.saysPaid': 'Your {label} says they paid you.',
  'settle.saysPaidVia': 'Your {label} says they paid you via {rail}.',
  'settle.verified': 'Verified by preimage.',
  'settle.confirmWarning': 'Confirm only once the money is actually in your account.',
  'settle.confirmReceived': 'Confirm received',
  'settle.confirming': 'Confirming…',
  'settle.confirmed': 'Payment confirmed',
  'settle.receivedVia': 'Received via {rail}.',
  'receipt.confirmFailed': 'Could not confirm receipt',

  // Completion (both sides)
  'complete.none': 'No completed {noun} found',
  'complete.earned': 'Earned',
  'complete.rate': 'Rate your {label}',
  'complete.comment': 'Comment (optional)',
  'complete.submitRating': 'Submit rating',
  'complete.rated': 'Rating submitted',
  'complete.rateFailed': 'Could not submit the rating',
  'complete.backToDashboard': 'Back to dashboard',
  'complete.requestAnother': 'Request a {noun}',
  'complete.done': 'Done',

  // Trip sharing (tell someone you trust)
  'share.title': 'Share this {noun}',
  'share.sharedWith': 'shared with {n}',
  'share.explain': "Sends an encrypted note straight to their Nostr messages — no account here needed, any NIP-17 DM app works. They'll get an all-clear when you arrive.",
  'share.everyTrip': 'Every trip',
  'share.everyTripOn': 'Every trip ✓',
  'share.everyTripHint': 'Send this contact every trip automatically',
  'share.share': 'Share',
  'share.sending': 'Sending…',
  'share.done': 'Shared ✓',
  'share.remove': 'Remove contact',
  'share.add': 'Add',
  'share.addPlaceholder': 'npub1… of someone you trust',
  'share.badNpub': 'That does not look like an npub (starts npub1…)',
  'share.sendFailed': 'Could not send — try again',

  // Earnings
  'earnings.title': 'Earnings',
  'earnings.loading': 'Loading your earnings...',
  'earnings.failed': 'Failed to load earnings: {error}',
  'earnings.intro': 'Every job, every sat. What the rider pays is what you see.',
  'earnings.today': 'Today · {n}',
  'earnings.week': '7 days · {n}',
  'earnings.allTime': 'All time · {n}',
  'earnings.completedJobs': 'Completed jobs',
  'earnings.empty': 'No completed jobs yet. Go online to start earning.',
  'earnings.tip': '+{n} tip',

  // Paying the driver directly (non-custodial)
  'pay.honest': 'You pay the driver directly. DonkeyRide never touches the money.',
  'pay.optionsFailed': 'Could not load payment options',
  'pay.buildFailed': 'Could not build the payment',
  'pay.proofFailed': 'That payment proof did not check out. Please try again.',
  'pay.recordFailed': 'Could not record the payment',
  'pay.copyInvoice': 'Copy invoice',
  'pay.preimage': 'preimage (64 hex chars)',
  'pay.mpesaCode': 'M-Pesa confirmation code',
  'pay.mpesaStep1': 'Open M-Pesa and choose "Send Money".',
  'pay.mpesaStep3': 'Enter the M-Pesa confirmation code below.',
  'pay.cashuStep': 'They redeem it in their wallet and confirm.',
  'pay.nwcPaste': 'Paste a nostr+walletconnect:// string',
  'pay.nwcInvalid': 'Invalid connection string',
  'pay.nwcLabel': 'Wallet connection string',
  'pay.walletFailed': 'Wallet payment failed',

  // Pickup verification code
  'code.title': 'Pickup code',
  'code.riderHint': "Your {label}'s app shows the same code — check it before getting in.",
  'code.providerHint': "The {label}'s app shows the same code — confirm it matches.",

  // Reputation badge
  'rep.none': 'No ratings yet',
  'rep.ratings': '{n} rating(s)',
  'rep.noShows': '{n} no-show report(s)',
  'rep.lateCancels': '{n} late cancellation(s)',
  'rep.panics': '{n} emergency signal(s)',

  // Header
  'header.yourProfile': 'Your profile and account key',
  'header.recoveryNotice': 'Stored identity could not be read; a new one was created. Restore from backup in Profile.',

  // Collapsible sections on the active screens
  'sheet.meeting': 'Meeting up',
  'sheet.pickup': 'Change pickup',
  'sheet.message': 'Message your {label}',
  'sheet.safety': 'Safety',
  'sheet.sharedWith': 'shared with {n}',
  'sheet.payment': 'Payment',
  'sheet.jobDetail': 'Job detail',
  'sheet.proof': 'Proof of completion',

  // Active task (rider)
  'active.bookedFor': 'Booked for',
  'active.bookedCommitted': 'Your {label} has committed — you will both get a reminder nearer the time.',
  'active.bookedWaiting': 'We will alert nearby {label} closer to the time — one may also commit early.',
  'active.lookFor': 'Look for',
  'active.payDirect': 'Pay your {label} directly. Agreed amount:',
  'active.demoPayment': 'Demo mode: no real payment moves.',
  'active.cancel': 'Cancel {noun}',
  'active.cancelConfirm': 'Cancel this {noun}?',
  'active.cancelNote': 'Nothing has been charged. You can request again straight away.',
  'active.cancelMatchedNote': 'Your {label} is already on the way. Frequent late cancellations show on your record.',
  'active.reportNoShow': 'The {label} did not turn up — report it',
  'active.keep': 'Keep it',
  'active.cancelling': 'Cancelling...',
  'active.confirmCancel': 'Yes, cancel',

  // Active job (provider)
  'pactive.committed': 'You have committed to this {noun} — you will get a reminder as the time approaches.',
  'pactive.noteFrom': 'Note from the {label}',
  'pactive.stops': 'Stops on the way',
  'pactive.working': 'Working...',
  'pactive.waze': 'Navigate (Waze)',
  'pactive.googleMaps': 'Google Maps',
  'pactive.cancelJob': 'Cancel job',
  'pactive.cancelConfirm': 'Cancel this job?',
  'pactive.cancelNote': 'The {label} is waiting on you. Cancelling after accepting shows on your record.',
  'pactive.keepJob': 'Keep job',

  // What is happening, said in a sentence rather than a state-machine enum.
  // Keyed on the STABLE state key, so every domain profile is covered.
  'state.requester.REQUESTED': 'Finding a {provider}',
  'state.requester.MATCHED': '{provider} on the way',
  'state.requester.PROVIDER_EN_ROUTE': '{provider} on the way',
  'state.requester.PROVIDER_ARRIVED': 'Your {provider} is here',
  'state.requester.METHOD_CONFIRMED': 'Approach agreed',
  'state.requester.COLLECTED': 'Collected',
  'state.requester.ACTIVE': 'On the way',
  'state.requester.ARRIVED_AT_DELIVERY': 'Arrived at the destination',
  'state.requester.COMPLETED': 'Finished',
  'state.requester.DELIVERY_FAILED': 'Could not be delivered',
  'state.requester.RETURNED_TO_SENDER': 'Returned to sender',
  'state.requester.CANCELLED': 'Cancelled',
  'state.requester.NO_SHOW': 'Nobody turned up',

  'state.provider.REQUESTED': 'Waiting for a {provider}',
  'state.provider.MATCHED': 'You accepted — head to the {requester}',
  'state.provider.PROVIDER_EN_ROUTE': 'Heading to the {requester}',
  'state.provider.PROVIDER_ARRIVED': 'You have arrived',
  'state.provider.METHOD_CONFIRMED': 'Approach agreed',
  'state.provider.COLLECTED': 'Collected',
  'state.provider.ACTIVE': '{noun} under way',
  'state.provider.ARRIVED_AT_DELIVERY': 'Arrived at the destination',
  'state.provider.COMPLETED': 'Finished',
  'state.provider.DELIVERY_FAILED': 'Could not be delivered',
  'state.provider.RETURNED_TO_SENDER': 'Returned to sender',
  'state.provider.CANCELLED': 'Cancelled',
  'state.provider.NO_SHOW': 'Nobody turned up',

  // Provider dashboard — the driver's own day
  'dash.todayEarned': 'Earned today',
  'dash.todayTrips': 'Trips today',
  'dash.online': 'Online',
  'dash.perHour': 'That is roughly',
  'dash.awayShort': '{min} min away',
  'dash.showDeclined': 'Show {n} declined',

  // Incoming job (provider)
  'incoming.away': '{min} min away · {dist}',
  'incoming.approxPickup': 'Pickup nearby',
  'incoming.approxDropoff': 'Destination set',
  'incoming.expired': 'Offer lapsed — it is back on your list',

  // Your name, as the other party sees it
  'name.title': 'Your name',
  'name.hint': 'What your driver or rider sees instead of a long identifier. Optional.',
  'name.nameLabel': 'Name',
  'name.namePlaceholder': 'e.g. Sam',
  'name.pictureLabel': 'Picture URL (optional)',
  'name.save': 'Save name',
  'name.saving': 'Saving...',
  'name.saved': 'Name saved',
  'name.failed': 'Could not save your name',
  'name.noRelays': 'No relay accepted the change — check your connection',
  'name.storage': 'Published to public Nostr relays under your own key. The operator neither stores nor vouches for it.',

  // Waiting for someone to accept
  'searching.title': 'Finding you {label}...',
  'searching.nearby': 'Contacting {label} nearby',
  'searching.notified': '{n} {label} have been asked',
  'searching.widened': 'Widening the search to {km} km',

  // The counterparty cancelled
  'cancelled.title': 'Your {label} cancelled',
  'cancelled.body': 'The {noun} will not go ahead. Nothing was charged.',
  'cancelled.lateTitle': 'They had already committed',
  'cancelled.lateBody': 'This {label} accepted and then cancelled while you were waiting. You can put that on their public record — it is signed by you, not by us, and no money changes hands either way.',
  'cancelled.report': 'Report the late cancellation',
  'cancelled.reporting': 'Reporting...',
  'cancelled.reported': 'Reported. It is on their public record now.',
  'cancelled.requestAnother': 'Request another {noun}',

  // Nobody accepted
  'noProviders.title': 'No {label} available',
  'noProviders.searched': 'We asked every {label} within {km} km and nobody could take it.',
  'noProviders.none': 'Nobody could take it right now.',
  'noProviders.noCharge': 'Nothing was charged — the {noun} never started.',
  'noProviders.retry': 'Try again',
  'noProviders.schedule': 'Book a {noun} for later',
};
