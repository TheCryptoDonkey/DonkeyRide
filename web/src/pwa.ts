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
        // clients.claim() also fires controllerchange on the very first
        // install. That is not an update, and the sticky "new version" toast
        // covered the primary ride button on a phone. Remember whether this
        // page was already controlled before registration so only an actual
        // replacement worker can announce an update.
        const controlledAtStart = Boolean(navigator.serviceWorker.controller);
        const registration = await navigator.serviceWorker.register('/sw.js');
        const replacingExistingWorker = controlledAtStart || Boolean(registration.active);

        // A worker already waiting means an update arrived on a previous visit
        if (registration.waiting && replacingExistingWorker) {
          notifyUpdate();
        }

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && replacingExistingWorker
                && navigator.serviceWorker.controller) {
              notifyUpdate();
            }
          });
        });

        // The new worker took control (sw.js calls skipWaiting on install)
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (controlledAtStart) notifyUpdate();
        });
      } catch (err) {
        console.warn('Service worker registration failed:', err);
      }
    });
  }
}
