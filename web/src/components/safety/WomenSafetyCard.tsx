import { useState } from 'react';
import { useT } from '../../i18n';
import {
  loadGender, saveGender, loadWomenOnlyDriver, saveWomenOnlyDriver,
} from '../../utils/gender';
import { dispatchService } from '../../services/dispatch';

/**
 * Device-local gender declaration for women-only matching. Deliberately
 * honest UI: the system is pseudonymous, so this is attestation — the copy
 * says exactly that. A declared woman rider gets a "women drivers only"
 * toggle per request; a declared woman driver can choose to only receive
 * women-only requests.
 */
export function WomenSafetyCard({ role }: { role: 'requester' | 'provider' }) {
  const { t } = useT();
  const [isWoman, setIsWoman] = useState(loadGender() === 'woman');
  const [womenOnly, setWomenOnly] = useState(loadWomenOnlyDriver());

  const applyGender = (woman: boolean) => {
    saveGender(woman ? 'woman' : null);
    setIsWoman(woman);
    if (!woman) setWomenOnly(false);
    dispatchService.refreshGenderPrefs();
  };

  const applyWomenOnly = (enabled: boolean) => {
    saveWomenOnlyDriver(enabled);
    setWomenOnly(enabled && loadGender() === 'woman');
    dispatchService.refreshGenderPrefs();
  };

  return (
    <div className="card space-y-3">
      <p className="text-xs uppercase tracking-wider text-donkey-muted">{t('women.title')}</p>
      <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
        <input
          type="checkbox"
          name="declare-woman"
          className="w-5 h-5 accent-donkey-purple"
          checked={isWoman}
          onChange={(e) => applyGender(e.target.checked)}
        />
        <span className="text-sm text-donkey-text font-semibold">{t('women.iAmAWoman')}</span>
      </label>
      {role === 'provider' && isWoman && (
        <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
          <input
            type="checkbox"
            name="women-only-requests"
            className="w-5 h-5 accent-donkey-purple"
            checked={womenOnly}
            onChange={(e) => applyWomenOnly(e.target.checked)}
          />
          <span className="text-sm text-donkey-text">
            {t('women.driverOnly')}
            <span className="block text-xs text-donkey-muted">{t('women.driverOnlyNote')}</span>
          </span>
        </label>
      )}
      <p className="text-xs text-donkey-muted">{t('women.selfDeclared')}</p>
    </div>
  );
}
