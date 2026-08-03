import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { ToastHost } from '../common/Toast';
import { OfflineBanner } from '../common/OfflineBanner';
import { useDomain } from '../../context/DomainContext';
import { useOnline } from '../../hooks/useOnline';
import { useT } from '../../i18n';

interface LayoutProps {
  app: 'rider' | 'driver';
}

export function Layout({ app }: LayoutProps) {
  const { loading, error } = useDomain();
  const { t } = useT();
  const online = useOnline();

  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-donkey-bg">
        <div className="text-center">
          <div
            className="animate-spin h-8 w-8 border-2 border-donkey-purple border-t-transparent rounded-full mx-auto mb-4 motion-reduce:animate-none"
            role="status"
            aria-label={t('layout.loading')}
          />
          <p className="text-donkey-muted">{t('layout.loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-dvh flex items-center justify-center bg-donkey-bg p-6">
        <div className="card max-w-md text-center" role="alert">
          {/* The commonest cause by far is no network, and "failed to load
              domain profile" is not what that should look like */}
          <p className="text-donkey-red mb-2">
            {online ? t('layout.profileFailed') : t('offline.title')}
          </p>
          <p className="text-donkey-muted text-sm">
            {online ? error : t('offline.body')}
          </p>
          <button
            className="btn-primary mt-4"
            onClick={() => window.location.reload()}
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-dvh flex flex-col"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <Header app={app} />
      <OfflineBanner />
      <main className="flex-1 overflow-hidden relative">
        <Outlet />
      </main>
      <BottomNav app={app} />
      <ToastHost />
    </div>
  );
}
