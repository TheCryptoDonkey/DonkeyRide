import { CANCEL_REASONS, reasonKey, prettifyCode, type CancelSide } from '../../utils/cancel-reasons';
import { useT } from '../../i18n';

/**
 * Why are you cancelling?
 *
 * Both apps used to post the same sentence every time, which meant the
 * counterparty got a shrug and the reputation layer got nothing. Nobody is
 * forced to answer — the confirm button works with no code selected — but
 * one tap is enough, and it is the difference between "cancelled" and
 * "nobody was coming".
 */
interface CancelReasonPickerProps {
  side: CancelSide;
  value: string | null;
  onChange: (code: string | null) => void;
  /** Codes the operator accepts, when it published a list of its own */
  codes?: string[];
}

export function CancelReasonPicker({ side, value, onChange, codes }: CancelReasonPickerProps) {
  const { t } = useT();
  const available = (codes && codes.length > 0 ? codes : CANCEL_REASONS[side])
    // no_show has its own tick box below, with its own consequences
    .filter((code) => code !== 'no_show');

  return (
    <fieldset className="space-y-2">
      <legend className="meta-label">{t('cancel.whyTitle')}</legend>
      <div className="flex flex-wrap gap-2">
        {available.map((code) => {
          const label = t(reasonKey(code));
          const selected = value === code;
          return (
            <button
              key={code}
              type="button"
              aria-pressed={selected}
              className={`text-xs font-semibold px-3 min-h-[36px] rounded-full border transition-colors ${
                selected
                  ? 'border-donkey-blue bg-donkey-blue/10 text-donkey-blue'
                  : 'border-donkey-border text-donkey-muted'
              }`}
              onClick={() => onChange(selected ? null : code)}
            >
              {label === reasonKey(code) ? prettifyCode(code) : label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-donkey-muted">{t('cancel.whyNote')}</p>
    </fieldset>
  );
}
