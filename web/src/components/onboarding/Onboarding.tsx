import { useState } from 'react';

const STORAGE_PREFIX = 'donkeyride.onboarded.';

interface Slide {
  emoji: string;
  title: string;
  body: string;
  hint?: string;
}

/** Is this an iPhone/iPad browser tab (not yet installed to Home Screen)? */
function isIosBrowserTab(): boolean {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

function slidesFor(role: 'requester' | 'provider'): Slide[] {
  if (role === 'provider') {
    return [
      {
        emoji: '🚗',
        title: 'Go online, pick your jobs',
        body: 'See every open request near you or in areas you draw on the map — you choose the work, nothing is assigned to you.',
      },
      {
        emoji: '💷',
        title: 'Keep 100% of every fare',
        body: 'Riders pay you directly — cash, M-Pesa or Lightning. No commission, no payout delays: the money never passes through anyone else.',
      },
      {
        emoji: '🔔',
        title: "Never miss a job",
        body: 'Allow notifications when you go online and jobs reach you even with your screen off.',
        hint: isIosBrowserTab()
          ? 'On iPhone: tap Share → “Add to Home Screen” first — iOS only delivers notifications to installed apps.'
          : undefined,
      },
    ];
  }
  return [
    {
      emoji: '📍',
      title: 'A ride in seconds — no sign-up',
      body: 'No account, no phone number, no card on file. Tap the map, see the price up front, and request.',
    },
    {
      emoji: '💷',
      title: 'Pay your driver, not a company',
      body: 'Settle directly in cash, M-Pesa or Lightning. Nobody stands between you and your driver — and nobody takes a cut.',
    },
    {
      emoji: '🛡️',
      title: 'Private by design',
      body: 'Live tracking, a panic button, encrypted chat with your driver, and driver ratings that cannot be faked. Your trip history is nobody’s product.',
    },
  ];
}

/**
 * First-run intro — three slides, shown once per role per device.
 * Skippable at any point; never shown again after finishing or skipping.
 */
export function Onboarding({ role }: { role: 'requester' | 'provider' }) {
  const storageKey = `${STORAGE_PREFIX}${role}`;
  const [seen, setSeen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch {
      return true; // no storage — never trap the user in the intro
    }
  });
  const [index, setIndex] = useState(0);

  if (seen) return null;

  const slides = slidesFor(role);
  const slide = slides[index];
  const last = index === slides.length - 1;

  const finish = () => {
    try {
      localStorage.setItem(storageKey, '1');
    } catch {
      // storage unavailable — dismiss for this session anyway
    }
    setSeen(true);
  };

  return (
    <div className="fixed inset-0 z-50 bg-donkey-bg flex flex-col items-center justify-center p-8 text-center">
      <div className="max-w-sm space-y-4">
        <div className="text-6xl" aria-hidden>{slide.emoji}</div>
        <h2 className="text-2xl font-black tracking-tight text-donkey-text">{slide.title}</h2>
        <p className="text-donkey-muted">{slide.body}</p>
        {slide.hint && (
          <p className="text-sm text-donkey-orange bg-donkey-orange/10 border border-donkey-orange/40 rounded-lg p-3">
            {slide.hint}
          </p>
        )}
      </div>

      <div className="flex gap-2 my-8" aria-hidden>
        {slides.map((_, i) => (
          <span
            key={i}
            className={`w-2 h-2 rounded-full ${i === index ? 'bg-donkey-purple' : 'bg-donkey-border'}`}
          />
        ))}
      </div>

      <div className="w-full max-w-sm space-y-3">
        <button
          className="btn-primary w-full"
          onClick={() => (last ? finish() : setIndex(index + 1))}
        >
          {last ? "Let's go" : 'Next'}
        </button>
        {!last && (
          <button className="text-sm text-donkey-muted w-full" onClick={finish}>
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
