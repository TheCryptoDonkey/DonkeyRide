import { NavLink, useLocation } from 'react-router-dom';
import { useT } from '../../i18n';

/**
 * The bar every phone app has and this one did not.
 *
 * History was a small underlined link at the very bottom of the home
 * screen, earnings and working areas were buttons half way down a
 * dashboard, and the profile was a 36 px avatar in the header. Everything
 * a person visits more than once now has a permanent, thumb-sized home at
 * the bottom of the screen.
 *
 * Hidden while a task is live: those screens are a map plus a sheet, the
 * next action is the only thing that matters, and a nav bar there is an
 * invitation to wander off mid-job.
 */

interface NavItem {
  to: string;
  icon: string;
  labelKey: string;
  /** Match nested paths too (e.g. /provide/areas under /provide) */
  end?: boolean;
}

const RIDER_ITEMS: NavItem[] = [
  { to: '/request', icon: '🚕', labelKey: 'nav.ride', end: true },
  { to: '/request/history', icon: '🧾', labelKey: 'nav.trips' },
  { to: '/request/help', icon: '💬', labelKey: 'nav.help' },
  { to: '/request/profile', icon: '👤', labelKey: 'nav.account' },
];

const DRIVER_ITEMS: NavItem[] = [
  { to: '/provide', icon: '🚦', labelKey: 'nav.dashboard', end: true },
  { to: '/provide/earnings', icon: '💷', labelKey: 'nav.earnings' },
  { to: '/provide/areas', icon: '🗺️', labelKey: 'nav.areas' },
  { to: '/provide/profile', icon: '👤', labelKey: 'nav.account' },
];

/** Screens that own the whole viewport while a job is in hand */
const IMMERSIVE = [
  '/request/new', '/request/active', '/request/complete',
  '/provide/incoming', '/provide/active', '/provide/complete',
];

export function BottomNav({ app }: { app: 'rider' | 'driver' }) {
  const { t } = useT();
  const { pathname } = useLocation();

  if (IMMERSIVE.some((path) => pathname.startsWith(path))) {
    return null;
  }

  const items = app === 'driver' ? DRIVER_ITEMS : RIDER_ITEMS;

  return (
    <nav
      className="shrink-0 bg-donkey-surface border-t border-donkey-border flex"
      aria-label={t('nav.label')}
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-[11px] font-semibold transition-colors ${
              isActive ? 'text-donkey-blue' : 'text-donkey-muted'
            }`
          }
        >
          <span className="text-lg leading-none" aria-hidden="true">{item.icon}</span>
          <span>{t(item.labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
