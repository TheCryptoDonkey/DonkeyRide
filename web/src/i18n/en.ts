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
  'home.searchDestination': 'Destination: search address or tap the map',
  'home.step': 'Step {n} of 2',
  'home.tapOrigin': 'Tap the map to set your {label}',
  'home.tapDestination': 'Now tap to set your destination',
  'home.selectStart': 'Select where you want your {noun} to start',
  'home.selectDestination': 'Select your destination to get a fare estimate',
  'home.confirm': 'Confirm {label}',
  'home.reset': 'Reset {label}',
  'home.nearby': '{n} {label} nearby',
  'home.available': '{n} {label} available',
  'home.searching': 'Searching for {label}...',
  'home.locationLater': 'Location services will be used when your {noun} begins',
  'home.pastTasks': 'Your past {noun}s',
  'home.howItWorks': 'How it works',

  // Request / estimate
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
  'request.requesting': 'Requesting...',
  'request.bookForLater': 'Book {label} for later',
  'request.request': 'Request {label}',
  'request.bookLater': 'Book for later',
  'request.estimateFailed': 'Failed to get estimate',
  'request.originSet': '{label} set',
  'request.ready': 'Ready to request a {noun}',

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

  // Address search
  'search.failed': 'Address search failed. Tap the map to set the location instead.',
  'search.saveFailed': 'Could not save — check the name, or remove an old place first.',
  'search.placeName': 'Name (e.g. Home)',
};
