import { useEffect } from 'react';

/**
 * Full-page navigation to a path served by the *other* app.
 * Rider and driver are separate PWAs on one origin — the server decides
 * which app shell to serve per path prefix, so crossing over must be a
 * real navigation, not a client-side route change.
 */
export function ExternalRedirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);
  return null;
}
