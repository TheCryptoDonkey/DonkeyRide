import { useEffect, useState } from 'react';
import { useTask } from '../../context/TaskContext';
import { dispatchService } from '../../services/dispatch';
import { getOperatorInfo } from '../../services/api';
import { discoverOperators, rememberOperator, type OperatorDirectoryEntry } from '../../services/operators';
import {
  getSelectedOperatorBase, resetSelectedOperatorBase, safeOperatorOrigin,
  setSelectedOperatorBase,
} from '../../services/operator-origin';
import { getCoordinationMode } from '../../services/network-mode';
import { useT } from '../../i18n';

export function OperatorPicker({ role }: { role: 'requester' | 'provider' }) {
  const { t } = useT();
  const { activeTask } = useTask();
  const [operators, setOperators] = useState<OperatorDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [manual, setManual] = useState('');
  const [error, setError] = useState<string | null>(null);
  const selected = getSelectedOperatorBase();
  const direct = getCoordinationMode() === 'direct';
  const locked = Boolean(activeTask) || (role === 'provider' && dispatchService.isOnline());

  const load = (force = false) => {
    setLoading(true);
    setError(null);
    discoverOperators(force)
      .then(setOperators)
      .catch(() => setError(t('operator.discoveryFailed')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // Opening Account in the static PWA must not silently probe the current
    // origin (or any remembered company). Operator discovery is an explicit
    // user action in open-network mode; managed builds may refresh their
    // already-selected directory entry on mount.
    if (direct) setLoading(false);
    else load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (origin: string) => {
    if (locked || origin === selected) return;
    rememberOperator(origin);
    setSelectedOperatorBase(origin);
    // Domain, relay, WebSocket and cached operator state all change together.
    window.location.reload();
  };

  const connectManual = async () => {
    setError(null);
    const origin = safeOperatorOrigin(manual);
    if (!origin) {
      setError(t('operator.invalidUrl'));
      return;
    }
    try {
      await getOperatorInfo(origin);
      choose(origin);
    } catch {
      setError(t('operator.unreachable'));
    }
  };

  const chooseDirect = () => {
    if (locked || direct) return;
    resetSelectedOperatorBase();
    window.location.reload();
  };

  return (
    <div className="card space-y-3">
      <div>
        <p className="text-xs uppercase tracking-wider text-donkey-muted">
          {t('operator.title')}
        </p>
        <p className="text-sm text-donkey-muted mt-1">{t('operator.intro')}</p>
      </div>

      {locked && (
        <p className="text-xs text-donkey-orange font-semibold">
          {t(role === 'provider' ? 'operator.offlineFirst' : 'operator.finishFirst')}
        </p>
      )}

      <div className="space-y-2">
        <button
          type="button"
          disabled={locked}
          onClick={chooseDirect}
          className={`w-full rounded-lg border p-3 text-left min-h-[44px] ${
            direct
              ? 'border-donkey-blue bg-donkey-blue/10'
              : 'border-donkey-border bg-donkey-bg'
          } disabled:opacity-60`}
        >
          <span className="flex items-start justify-between gap-2">
            <span className="font-semibold text-sm text-donkey-text">Open network</span>
            <span className="text-xs text-donkey-green">
              {direct ? t('operator.selected') : t('operator.online')}
            </span>
          </span>
          <span className="block text-xs text-donkey-muted mt-1">
            Static app · encrypted Nostr coordination · no DonkeyRide operator
          </span>
        </button>
        {operators.map((operator) => (
          <button
            key={operator.origin}
            type="button"
            disabled={locked || !operator.reachable}
            onClick={() => choose(operator.origin)}
            className={`w-full rounded-lg border p-3 text-left min-h-[44px] ${
              !direct && operator.selected
                ? 'border-donkey-blue bg-donkey-blue/10'
                : 'border-donkey-border bg-donkey-bg'
            } disabled:opacity-60`}
          >
            <span className="flex items-start justify-between gap-2">
              <span className="font-semibold text-sm text-donkey-text">{operator.name}</span>
              <span className={`text-xs ${operator.reachable ? 'text-donkey-green' : 'text-donkey-red'}`}>
                {!direct && operator.selected
                  ? t('operator.selected')
                  : operator.reachable ? t('operator.online') : t('operator.offline')}
              </span>
            </span>
            <span className="block text-xs text-donkey-muted break-all mt-1">{operator.origin}</span>
            {operator.feePercent != null && (
              <span className="block text-xs text-donkey-muted mt-1">
                {t('operator.fee', { fee: operator.feePercent })}
              </span>
            )}
            {operator.policy && (
              <span className="block text-xs text-donkey-muted mt-1">
                {t('operator.policySummary', {
                  mode: operator.policy.mode,
                  admission: operator.policy.admission.mode.replace(/_/g, ' '),
                  records: operator.policy.records.mode,
                })}
              </span>
            )}
          </button>
        ))}
      </div>

      <button className="btn-secondary w-full" onClick={() => load(true)} disabled={loading}>
        {loading ? t('operator.searching') : t('operator.search')}
      </button>

      <div className="flex gap-2">
        <input
          name="operator-url"
          className="min-w-0 flex-1 bg-donkey-bg border border-donkey-border rounded-lg px-3 py-2 text-sm"
          type="url"
          inputMode="url"
          aria-label={t('operator.manualUrl')}
          placeholder="https://rides.example"
          value={manual}
          onChange={(event) => setManual(event.target.value)}
          disabled={locked}
        />
        <button
          className="btn-secondary px-3"
          onClick={connectManual}
          disabled={locked || !manual.trim()}
        >
          {t('operator.connect')}
        </button>
      </div>
      {error && <p className="text-xs text-donkey-red">{error}</p>}
    </div>
  );
}
