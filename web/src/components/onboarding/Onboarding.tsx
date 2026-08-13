import { useState, type ReactNode } from 'react';
import { useT } from '../../i18n';

const STORAGE_PREFIX = 'donkeyride.onboarded.';

interface Intro {
  emoji: string;
  title: string;
  body: string;
}

function introFor(role: 'requester' | 'provider', t: (key: string) => string): Intro {
  if (role === 'provider') {
    return { emoji: '🚗', title: t('onboard.p1.title'), body: t('onboard.p1.body') };
  }
  return { emoji: '📍', title: t('onboard.r1.title'), body: t('onboard.r1.body') };
}

/**
 * One-decision first run. Payment, safety and notification explanations are
 * shown when they become relevant; a three-page tour only delayed the task.
 */
export function Onboarding({
  role,
  children,
}: {
  role: 'requester' | 'provider';
  children: ReactNode;
}) {
  const { t } = useT();
  const storageKey = `${STORAGE_PREFIX}${role}`;
  const [seen, setSeen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch {
      return true; // no storage — never trap the user in the intro
    }
  });

  if (seen) return <>{children}</>;

  const intro = introFor(role, t);

  const finish = () => {
    try {
      localStorage.setItem(storageKey, '1');
    } catch {
      // storage unavailable — dismiss for this session anyway
    }
    setSeen(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-donkey-bg flex flex-col items-center justify-center p-8 text-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      aria-describedby="onboarding-description"
    >
      <div className="max-w-sm space-y-4">
        <div className="text-6xl" aria-hidden>{intro.emoji}</div>
        <h2 id="onboarding-title" className="text-2xl font-black tracking-tight text-donkey-text">{intro.title}</h2>
        <p id="onboarding-description" className="text-donkey-muted">{intro.body}</p>
      </div>

      <div className="w-full max-w-sm mt-8">
        <button
          autoFocus
          className="btn-primary w-full"
          onClick={finish}
        >
          {t('onboard.go')}
        </button>
      </div>
    </div>
  );
}
