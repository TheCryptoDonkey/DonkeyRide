/**
 * Kiswahili — first-pass translation for the KES market (M-Pesa and Tando
 * are first-class rails). Written for clarity over literalness; needs a
 * native-speaker review before a Kenyan pilot. Missing keys fall back to
 * English automatically.
 */
export const sw: Record<string, string> = {
  // Dynamic (server-sent) domain labels
  'dyn.driver': 'dereva',
  'dyn.drivers': 'madereva',
  'dyn.rider': 'abiria',
  'dyn.riders': 'abiria',
  'dyn.ride': 'safari',
  'dyn.task': 'kazi',
  'dyn.job': 'kazi',
  'dyn.customer': 'mteja',
  'dyn.pickup': 'Pa kuanzia',
  'dyn.dropoff': 'Unakoenda',
  'dyn.destination': 'Unakoenda',

  // Common
  'common.you': 'Wewe',
  'common.back': 'Rudi',
  'common.cancel': 'Ghairi',
  'common.close': 'Funga',
  'common.dismiss': 'Ondoa',
  'common.next': 'Endelea',
  'common.skip': 'Ruka',
  'common.save': 'Hifadhi',
  'common.clear': 'Futa',
  'common.view': 'Angalia',
  'common.now': 'Sasa',
  'common.later': 'Baadaye',
  'common.online': 'Mtandaoni',
  'common.offline': 'Nje ya mtandao',
  'common.connecting': 'Inaunganisha...',
  'common.accept': 'Kubali',
  'common.accepting': 'Inakubali...',
  'common.decline': 'Kataa',
  'common.recent': 'Za hivi karibuni',
  'common.stop': 'kituo',
  'common.stops': 'vituo',

  // Rider home
  'home.searchOrigin': '{label}: tafuta anwani au gusa ramani',
  'home.searchDestination': 'Unakoenda: tafuta anwani au gusa ramani',
  'home.step': 'Hatua {n} kati ya 2',
  'home.tapOrigin': 'Gusa ramani kuweka {label}',
  'home.tapDestination': 'Sasa gusa kuweka unakoenda',
  'home.selectStart': 'Chagua mahali {noun} yako ianzie',
  'home.selectDestination': 'Chagua unakoenda upate makadirio ya nauli',
  'home.confirm': 'Thibitisha {label}',
  'home.reset': 'Weka upya {label}',
  'home.nearby': '{label} {n} karibu nawe',
  'home.available': '{label} {n} wapo',
  'home.searching': 'Inatafuta {label}...',
  'home.locationLater': 'Huduma za mahali zitatumika {noun} yako itakapoanza',
  'home.pastTasks': '{noun} zako zilizopita',
  'home.howItWorks': 'Jinsi inavyofanya kazi',

  // Request / estimate
  'request.stopsTitle': 'Vituo njiani',
  'request.addStop': '+ Ongeza kituo',
  'request.searchStop': 'Tafuta kituo...',
  'request.stopsNote': '{label} wako atapitia kila kituo kwa mpangilio — nauli inajumuisha njia yote.',
  'request.stopLabel': 'Kituo {n}',
  'request.whenTitle': 'Unaihitaji lini?',
  'request.scheduleInvalid': 'Chagua muda kati ya dakika 20 na siku 30 kuanzia sasa.',
  'request.scheduleNote': '{label} anaweza kujitolea mapema — nyote wawili mtapata kikumbusho muda unapokaribia.',
  'request.estimating': 'Inakokotoa makadirio...',
  'request.fareBreakdown': 'Mchanganuo wa nauli',
  'request.base': 'Kianzio',
  'request.distance': 'Umbali',
  'request.operator': 'Opereta',
  'request.requesting': 'Inaomba...',
  'request.bookForLater': 'Ratibu {label} kwa baadaye',
  'request.request': 'Omba {label}',
  'request.bookLater': 'Ratibu kwa baadaye',
  'request.estimateFailed': 'Imeshindwa kupata makadirio',
  'request.originSet': '{label} imewekwa',
  'request.ready': 'Tayari kuomba {noun}',

  // Driver dashboard
  'dash.title': 'Dashibodi ya {label}',
  'dash.fee': 'Ada: {fee}',
  'dash.active': 'Zinaendelea',
  'dash.completed': 'Zilizokamilika',
  'dash.total': 'Jumla',
  'dash.waiting': 'Maombi ya {noun} yanayosubiri ({n})',
  'dash.booked': 'Imeratibiwa {time}',
  'dash.noGps': 'Mahali hapapatikani. Hutapokea maombi ya {noun} hadi uwashe huduma za mahali.',
  'dash.goOnline': 'Ingia mtandaoni',
  'dash.goOffline': 'Toka mtandaoni',
  'dash.earnings': 'Mapato',
  'dash.areas': 'Maeneo ya kazi',
  'dash.headingTo': 'Unaelekea',
  'dash.corridorNote': 'Unaonyeshwa tu maombi ya {noun} yaliyo njiani mwako',
  'dash.headingPrompt': 'Unaelekea wapi?',
  'dash.searchDestination': 'Tafuta unakoenda...',
  'dash.headingCta': 'Unaelekea mahali? Ona tu {noun} zilizo njiani mwako →',
  'dash.listening': 'Inasubiri maombi ya {noun}...',
  'dash.connectingDispatcher': 'Inaunganisha na kituo...',
  'dash.androidNote': 'Unaendesha kwa Android?',
  'dash.getApp': 'Pakua programu',
  'dash.screenOff': '— kazi zinaendelea kufika hata skrini ikiwa imezimwa.',
  'dash.ready': 'Tayari kupokea maombi ya {noun}',

  // Incoming job
  'incoming.title': 'Ombi jipya la {noun}',
  'incoming.needsService': '{label} anahitaji huduma yako',
  'incoming.new': 'Ombi jipya la {noun} kutoka kwa {label}',
  'incoming.bookedCommit': 'Imeratibiwa {time} — ukikubali unajitolea kufika wakati huo',
  'incoming.approx': 'Mahali ni makadirio hadi utakapokubali',
  'incoming.taken': 'Kazi hii imeshachukuliwa',
  'incoming.acceptFailed': 'Imeshindwa kukubali kazi',

  // Profile / account
  'profile.title': 'Akaunti yako',
  'profile.intro':
    'Hakuna kujisajili, hakuna namba ya simu: akaunti yako iko kwenye kifaa hiki na ni mali yako, si ya kampuni yoyote. Hifadhi ufunguo wa kurejesha hapa chini — akaunti na ukadiriaji wako vitasafiri nawe.',
  'profile.accountId': 'Kitambulisho cha akaunti',
  'profile.accountIdNote': 'Salama kushiriki — hivi ndivyo wengine wanavyoona ukadiriaji wako.',
  'profile.copyId': 'Nakili kitambulisho',
  'profile.copied': 'Imenakiliwa ✓',
  'profile.recoveryKey': 'Ufunguo wa kurejesha',
  'profile.recoveryNote':
    'Mtu yeyote mwenye ufunguo huu anaweza kujifanya wewe. Uhifadhi mahali salama (kidhibiti cha nywila). Usimpe mtu yeyote — hata anayejiita msaada.',
  'profile.copyRecovery': 'Nakili ufunguo wa kurejesha',
  'profile.revealRecovery': 'Onyesha ufunguo wa kurejesha',
  'profile.restore': 'Rejesha kutoka hifadhi',
  'profile.restoreNote':
    'Unahama kutoka simu nyingine? Bandika ufunguo wako wa kurejesha (unaanza na nsec1…) kuleta akaunti na ukadiriaji wako kwenye kifaa hiki.',
  'profile.replace': 'Badilisha akaunti kwenye kifaa hiki',
  'profile.language': 'Lugha',
  'profile.languageNote': 'Chagua lugha ya programu kwenye kifaa hiki.',

  // Onboarding — provider
  'onboard.p1.title': 'Ingia mtandaoni, chagua kazi zako',
  'onboard.p1.body':
    'Ona kila ombi lililo wazi karibu nawe au katika maeneo unayochora kwenye ramani — unachagua kazi mwenyewe, hakuna unayopangiwa.',
  'onboard.p2.title': 'Baki na nauli yote — asilimia 100',
  'onboard.p2.body':
    'Abiria wanakulipa moja kwa moja — pesa taslimu, M-Pesa au Lightning. Hakuna kamisheni, hakuna kuchelewa kwa malipo: pesa haipiti kwa mtu mwingine yeyote.',
  'onboard.p3.title': 'Usikose kazi yoyote',
  'onboard.p3.body': 'Ruhusu arifa unapoingia mtandaoni ili kazi zikufikie hata skrini ikiwa imezimwa.',
  'onboard.p3.hint':
    'Kwenye iPhone: gusa Share → “Add to Home Screen” kwanza — iOS hupeleka arifa kwa programu zilizosakinishwa tu.',

  // Onboarding — rider
  'onboard.r1.title': 'Safari kwa sekunde — bila kujisajili',
  'onboard.r1.body':
    'Hakuna akaunti, hakuna namba ya simu, hakuna kadi. Gusa ramani, ona bei mapema, kisha omba.',
  'onboard.r2.title': 'Mlipe dereva wako, si kampuni',
  'onboard.r2.body':
    'Lipa moja kwa moja kwa pesa taslimu, M-Pesa au Lightning. Hakuna anayesimama kati yako na dereva wako — na hakuna anayechukua chochote.',
  'onboard.r3.title': 'Faragha tangu mwanzo',
  'onboard.r3.body':
    'Ufuatiliaji wa moja kwa moja, kitufe cha dharura, mazungumzo yaliyosimbwa na dereva wako, na ukadiriaji wa madereva usioweza kughushiwa. Historia ya safari zako si bidhaa ya mtu yeyote.',
  'onboard.go': 'Twende',

  // Women-only matching
  'women.title': 'Usalama wa wanawake',
  'women.iAmAWoman': 'Mimi ni mwanamke',
  'women.selfDeclared':
    'Umejitangaza mwenyewe — DonkeyRide haina akaunti na haiwezi kuthibitisha jinsia. Daima angalia gari, namba za gari na nambari ya kuchukuliwa kabla ya kuingia.',
  'women.driverOnly': 'Pokea maombi kutoka kwa wanawake pekee',
  'women.driverOnlyNote': 'Utatumiwa maombi ya wanawake pekee.',
  'women.requestToggle': '{label} wanawake pekee',
  'women.requestNote': '{label} waliojitangaza kuwa wanawake pekee ndio wataona ombi hili.',
  'women.badge': 'Wanawake pekee',
  'women.incomingNote': '{label} ameomba {provider} mwanamke. Ukikubali unajitangaza kuwa mmoja.',

  // Trip audio recording
  'audio.record': 'Rekodi sauti',
  'audio.recording': 'Inarekodi sauti…',
  'audio.stop': 'Simamisha',
  'audio.start': 'Anza kurekodi',
  'audio.consent':
    'Inarekodiwa kwenye simu yako tu, imesimbwa kwa ufunguo wa akaunti yako, na kufutwa baada ya saa 72 usipoipakua. Mshiriki mwingine anaarifiwa kwenye mazungumzo. Sheria za kurekodi hutofautiana kulingana na mahali — ni jukumu lako kuzifuata.',
  'audio.chatNotice': '🎙 Sauti inarekodiwa kwa safari hii (imehifadhiwa kwenye simu yangu tu).',
  'audio.saved': 'Imehifadhiwa kwenye simu hii — itafutwa baada ya saa 72 usipoipakua',
  'audio.savedShort': 'Rekodi imehifadhiwa',
  'audio.download': 'Pakua',
  'audio.delete': 'Futa',

  // Address search
  'search.failed': 'Utafutaji wa anwani umeshindikana. Gusa ramani kuweka mahali badala yake.',
  'search.saveFailed': 'Imeshindwa kuhifadhi — angalia jina, au futa mahali pa zamani kwanza.',
  'search.placeName': 'Jina (mfano: Nyumbani)',
};
