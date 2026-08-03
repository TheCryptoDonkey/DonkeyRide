import { useOnline } from '../../hooks/useOnline';
import { useT } from '../../i18n';

/**
 * "You are offline" — said once, at the top, instead of every screen
 * failing in its own dialect.
 *
 * A live task keeps running: the operator holds the state, the socket
 * reconnects on its own, and the pickup code, the trip share and the
 * receipt are all on this device anyway. So this explains rather than
 * blocks — nothing here disables a control.
 */
export function OfflineBanner() {
  const online = useOnline();
  const { t } = useT();

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-donkey-orange/20 border-b border-donkey-orange px-4 py-2 text-xs text-donkey-orange font-semibold text-center"
    >
      {t('offline.banner')}
    </div>
  );
}
