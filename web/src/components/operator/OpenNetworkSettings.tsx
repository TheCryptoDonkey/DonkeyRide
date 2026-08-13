import { useState } from 'react';
import {
  getCoordinationMode, getDirectRelayUrls, getDirectRoutingUrl,
  resetDirectNetworkServices, setDirectRelayUrls, setDirectRoutingUrl,
} from '../../services/network-mode';

export function OpenNetworkSettings() {
  const [relays, setRelays] = useState(() => getDirectRelayUrls().join('\n'));
  const [router, setRouter] = useState(getDirectRoutingUrl);
  const [error, setError] = useState<string | null>(null);
  if (getCoordinationMode() !== 'direct') return null;

  const save = () => {
    try {
      setDirectRelayUrls(relays.split(/[\n,]/));
      setDirectRoutingUrl(router);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save network services');
    }
  };

  const reset = () => {
    resetDirectNetworkServices();
    window.location.reload();
  };

  return (
    <div className="card space-y-3">
      <div>
        <p className="text-xs uppercase tracking-wider text-donkey-muted">Open network services</p>
        <p className="text-sm text-donkey-muted mt-1">
          Pick the relays that carry encrypted coordination and the Valhalla-compatible
          road router used for distance, time and route shape.
        </p>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-semibold text-donkey-text">Nostr relays</span>
        <textarea
          name="nostr-relays"
          rows={2}
          className="w-full bg-donkey-bg border border-donkey-border rounded-lg px-3 py-2 text-xs font-mono"
          value={relays}
          onChange={(event) => setRelays(event.target.value)}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-semibold text-donkey-text">Road router URL</span>
        <input
          name="road-router-url"
          type="url"
          inputMode="url"
          className="w-full bg-donkey-bg border border-donkey-border rounded-lg px-3 py-2 text-xs font-mono"
          value={router}
          onChange={(event) => setRouter(event.target.value)}
        />
      </label>
      <p className="text-xs text-donkey-muted">
        Relays see coarse cells, timing and encrypted envelopes. The router necessarily sees
        exact ordered points, but receives no DonkeyRide identity or journey id.
      </p>
      {error && <p className="text-xs text-donkey-red" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" onClick={save}>Save and reload</button>
        <button className="btn-secondary px-3" onClick={reset}>Defaults</button>
      </div>
    </div>
  );
}
