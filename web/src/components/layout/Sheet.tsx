import { useEffect, useId, useRef, useState } from 'react';

/**
 * Progressive disclosure for the active-task screens.
 *
 * Both active pages grew into a single column of up to thirteen always-open
 * panels — status, search, booking, person, waiting timer, pickup adjuster,
 * pickup code, chat, trip sharing, audio recording, payment, stake, actions —
 * stacked under a map that `flex-1` then squeezed to nothing. On a phone the
 * result is a wall of cards with the map gone and the important controls
 * somewhere below the fold.
 *
 * The fix is the shape every dispatch app converged on: a small sheet that
 * shows only what is live right now, with everything else one deliberate tap
 * away. `Sheet` is the container that keeps the map visible; `SheetSection`
 * is a disclosure that remembers whether the user opened it.
 */

interface SheetProps {
  /** Always visible: status, the person, the one action that matters now */
  children: React.ReactNode;
  /** Cap the sheet so the map always keeps a usable share of the screen */
  maxHeightClass?: string;
}

export function Sheet({ children, maxHeightClass = 'max-h-[55vh]' }: SheetProps) {
  return (
    <div
      className={`bg-donkey-surface border-t-2 border-donkey-border shadow-panel ${maxHeightClass} overflow-y-auto overscroll-contain`}
    >
      {/* Grab handle — signals the panel scrolls, and gives the thumb
          somewhere to land that is not a control */}
      <div className="sticky top-0 z-10 bg-donkey-surface pt-2 pb-1 flex justify-center">
        <span className="block w-10 h-1 rounded-full bg-donkey-border" aria-hidden="true" />
      </div>
      <div className="px-5 pb-5 space-y-3">{children}</div>
    </div>
  );
}

interface SheetSectionProps {
  /** Row label, e.g. "Safety" */
  title: string;
  /** Emoji or short glyph shown before the title */
  icon?: string;
  /** Right-hand hint: "3 contacts", "Recording" */
  badge?: string;
  /** Open on first render — for a section that is the current step */
  defaultOpen?: boolean;
  /** Persist open/closed under this key so a refresh keeps the choice */
  rememberAs?: string;
  /** Draw attention without forcing the section open */
  highlight?: boolean;
  children: React.ReactNode;
}

function remembered(key: string | undefined, fallback: boolean): boolean {
  if (!key) return fallback;
  try {
    const raw = localStorage.getItem(`donkeyride.sheet.${key}`);
    return raw == null ? fallback : raw === '1';
  } catch {
    return fallback;
  }
}

export function SheetSection({
  title, icon, badge, defaultOpen = false, rememberAs, highlight, children,
}: SheetSectionProps) {
  const [open, setOpen] = useState(() => remembered(rememberAs, defaultOpen));
  const panelId = useId();
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!rememberAs) return;
    try {
      localStorage.setItem(`donkeyride.sheet.${rememberAs}`, open ? '1' : '0');
    } catch {
      // Storage unavailable — the section still works, it just forgets
    }
  }, [open, rememberAs]);

  return (
    <div className={`rounded-lg border ${highlight ? 'border-donkey-orange/50' : 'border-donkey-border'}`}>
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 min-h-[44px] text-left"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        {icon && <span aria-hidden="true">{icon}</span>}
        <span className="flex-1 text-sm font-semibold text-donkey-text">{title}</span>
        {badge && <span className="text-xs text-donkey-muted">{badge}</span>}
        <span
          className={`text-donkey-muted text-xs transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>
      {open && (
        <div id={panelId} className="px-3 pb-3 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * A row of equal, thumb-sized actions under the person card — the
 * chat/share/safety trio every rider expects to find without scrolling.
 */
export function SheetActions({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-2">{children}</div>;
}

export function SheetAction({
  icon, label, onClick, active, danger,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 min-h-[56px] rounded-lg border text-xs font-semibold transition-colors ${
        danger
          ? 'border-donkey-red/50 text-donkey-red'
          : active
            ? 'border-donkey-blue bg-donkey-blue/10 text-donkey-blue'
            : 'border-donkey-border text-donkey-text'
      }`}
    >
      <span className="text-lg leading-none" aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
