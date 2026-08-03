import { useState } from 'react';
import { useT } from '../../i18n';

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

function slidesFor(role: 'requester' | 'provider', t: (key: string) => string): Slide[] {
  if (role === 'provider') {
    return [
      { emoji: '🚗', title: t('onboard.p1.title'), body: t('onboard.p1.body') },
      { emoji: '💷', title: t('onboard.p2.title'), body: t('onboard.p2.body') },
      {
        emoji: '🔔',
        title: t('onboard.p3.title'),
        body: t('onboard.p3.body'),
        hint: isIosBrowserTab() ? t('onboard.p3.hint') : undefined,
      },
    ];
  }
  return [
    { emoji: '📍', title: t('onboard.r1.title'), body: t('onboard.r1.body') },
    { emoji: '💷', title: t('onboard.r2.title'), body: t('onboard.r2.body') },
    { emoji: '🛡️', title: t('onboard.r3.title'), body: t('onboard.r3.body') },
  ];
}

/**
 * First-run intro — three slides, shown once per role per device.
 * Skippable at any point; never shown again after finishing or skipping.
 */
export function Onboarding({ role }: { role: 'requester' | 'provider' }) {
  const { t } = useT();
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

  const slides = slidesFor(role, t);
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
          {last ? t('onboard.go') : t('common.next')}
        </button>
        {!last && (
          <button className="text-sm text-donkey-muted w-full" onClick={finish}>
            {t('common.skip')}
          </button>
        )}
      </div>
    </div>
  );
}
