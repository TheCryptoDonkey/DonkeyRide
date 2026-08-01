import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { useDomain } from '../../context/DomainContext';

interface LayoutProps {
  app: 'rider' | 'driver';
}

export function Layout({ app }: LayoutProps) {
  const { loading, error } = useDomain();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-donkey-bg">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-donkey-purple border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-donkey-muted">Loading domain profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-donkey-bg">
        <div className="card max-w-md text-center">
          <p className="text-donkey-red mb-2">Failed to load domain profile</p>
          <p className="text-donkey-muted text-sm">{error}</p>
          <button
            className="btn-primary mt-4"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <Header app={app} />
      <main className="flex-1 overflow-hidden relative">
        <Outlet />
      </main>
    </div>
  );
}
