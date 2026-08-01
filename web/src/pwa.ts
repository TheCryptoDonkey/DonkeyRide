import { showToast } from './components/common/Toast';

/** Shared service-worker registration for both apps (production only). */
export function registerServiceWorker() {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', async () => {
      let notified = false;
      const notifyUpdate = () => {
        if (notified) return;
        notified = true;
        showToast('New version available, tap to refresh', {
          sticky: true,
          action: { label: 'Refresh', onClick: () => window.location.reload() },
        });
      };

      try {
        const registration = await navigator.serviceWorker.register('/sw.js');

        // A worker already waiting means an update arrived on a previous visit
        if (registration.waiting && navigator.serviceWorker.controller) {
          notifyUpdate();
        }

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              notifyUpdate();
            }
          });
        });

        // The new worker took control (sw.js calls skipWaiting on install)
        navigator.serviceWorker.addEventListener('controllerchange', notifyUpdate);
      } catch (err) {
        console.warn('Service worker registration failed:', err);
      }
    });
  }
}
