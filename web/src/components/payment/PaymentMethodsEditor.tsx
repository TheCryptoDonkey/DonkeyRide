import { useEffect, useMemo, useState } from 'react';
import { getSettlementRails, setPaymentMethods } from '../../services/api';
import { validateRailHandle } from '../../utils/payment-validation';
import { getSavedPaymentMethods, savePaymentMethods } from '../../utils/payment-methods';
import type { PaymentMethod, SettlementRail } from '../../types/api';
import { useT } from '../../i18n';

interface RailRow {
  enabled: boolean;
  handle: string;
}

interface PaymentMethodsEditorProps {
  /** When set, a save also posts the methods to this ride for the rider */
  rideId?: string;
  /** Operator coordinating that ride (needed for federated jobs). */
  operatorBase?: string;
  /** Called after a successful save with the persisted methods */
  onSaved?: (methods: PaymentMethod[]) => void;
}

/**
 * The driver's accepted-payment-methods editor. The driver toggles rails on
 * and enters a handle for each; the set is remembered in localStorage and,
 * when a ride is active, posted to that ride so the rider can pay directly.
 *
 * The operator is strictly non-custodial: every rail settles rider -> driver
 * with no platform in the middle. The copy here says so plainly.
 */
export function PaymentMethodsEditor({ rideId, operatorBase, onSaved }: PaymentMethodsEditorProps) {
  const { t } = useT();
  const [rails, setRails] = useState<SettlementRail[]>([]);
  const [rows, setRows] = useState<Record<string, RailRow>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Load the rail catalogue and hydrate from any remembered methods.
  useEffect(() => {
    let mounted = true;
    getSettlementRails(operatorBase)
      .then((catalogue) => {
        if (!mounted) return;
        setRails(catalogue);
        const savedMethods = getSavedPaymentMethods();
        const initial: Record<string, RailRow> = {};
        for (const rail of catalogue) {
          const existing = savedMethods.find((m) => m.rail === rail.id);
          initial[rail.id] = {
            enabled: !!existing,
            handle: existing?.handle ?? '',
          };
        }
        setRows(initial);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setLoadError(err instanceof Error ? err.message : t('methods.loadFailed'));
        setLoading(false);
      });
    return () => { mounted = false; };
  }, [operatorBase]);

  const setRow = (railId: string, patch: Partial<RailRow>) => {
    setRows((prev) => ({ ...prev, [railId]: { ...prev[railId], ...patch } }));
    setSaved(false);
    setSaveError(null);
  };

  // Per-rail validation for enabled rails.
  const errors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const rail of rails) {
      const row = rows[rail.id];
      if (!row?.enabled) continue;
      if (rail.id === 'cash') continue;
      const result = validateRailHandle(rail.id, row.handle);
      if (!result.valid && result.error) out[rail.id] = result.error;
    }
    return out;
  }, [rails, rows]);

  const enabledMethods: PaymentMethod[] = useMemo(() => {
    const out: PaymentMethod[] = [];
    for (const rail of rails) {
      const row = rows[rail.id];
      if (!row?.enabled) continue;
      out.push(rail.id === 'cash'
        ? { rail: rail.id }
        : { rail: rail.id, handle: row.handle.trim() });
    }
    return out;
  }, [rails, rows]);

  const canSave = enabledMethods.length > 0 && Object.keys(errors).length === 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      savePaymentMethods(enabledMethods);
      if (rideId) {
        await setPaymentMethods(rideId, { methods: enabledMethods }, operatorBase);
      }
      setSaved(true);
      onSaved?.(enabledMethods);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('methods.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <p className="text-sm text-donkey-muted">Loading payment methods…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="card">
        <p className="text-donkey-red text-sm">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <div>
        <p className="section-title">Payment methods</p>
        <p className="text-xs text-donkey-muted mt-1">
          You get paid <span className="text-donkey-text font-semibold">directly</span>.
          DonkeyRide never holds your money — riders pay you straight over the
          rails you choose.
        </p>
      </div>

      <div className="space-y-3">
        {rails.map((rail) => {
          const row = rows[rail.id] || { enabled: false, handle: '' };
          const error = errors[rail.id];
          return (
            <div key={rail.id} className="bg-donkey-bg border border-donkey-border rounded-lg p-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-donkey-purple"
                  checked={row.enabled}
                  onChange={(e) => setRow(rail.id, { enabled: e.target.checked })}
                />
                <span className="flex-1">
                  <span className="text-sm font-bold text-donkey-text">{rail.label}</span>
                  <span className="block text-xs text-donkey-muted">
                    Settles: {rail.settles}
                  </span>
                </span>
              </label>

              {rail.id === 'tando' && row.enabled && (
                <p className="text-xs text-donkey-green mt-2">
                  Get paid in M-Pesa, settled over Lightning.
                </p>
              )}

              {row.enabled && rail.id !== 'cash' && (
                <div className="mt-2">
                  <input
                    type="text"
                    inputMode={rail.id === 'mpesa' ? 'tel' : 'text'}
                    className="input-field w-full text-sm"
                    placeholder={rail.handleHint || rail.handleLabel || t('methods.handle')}
                    value={row.handle}
                    onChange={(e) => setRow(rail.id, { handle: e.target.value })}
                  />
                  {error && <p className="text-donkey-red text-xs mt-1">{error}</p>}
                </div>
              )}

              {row.enabled && rail.id === 'cash' && (
                <p className="text-xs text-donkey-muted mt-2">
                  Paid in person. No handle needed.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {saveError && <p className="text-donkey-red text-sm">{saveError}</p>}

      <button
        className="btn-primary w-full"
        onClick={handleSave}
        disabled={!canSave || saving}
      >
        {saving ? t('methods.saving') : saved ? t('methods.saved') : rideId ? t('methods.saveForJob') : t('methods.save')}
      </button>

      {rideId && saved && (
        <p className="text-xs text-donkey-green text-center">
          The rider can now pay you on these rails.
        </p>
      )}
    </div>
  );
}
