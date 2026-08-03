import { useT } from '../../i18n';

/**
 * What was actually good, or actually wrong.
 *
 * A star and a free-text box is the worst of both worlds: the star carries
 * no reason and the prose cannot be counted. These events live on public
 * relays as kind 30520 tags, where an aggregator anybody can write is the
 * whole point — "three people said the car was filthy" is a fact you can
 * act on, "3.6 average" is not.
 *
 * The set shown follows the star: praise for a good rating, problems for a
 * poor one. Nobody is asked to explain a five, and nobody is offered
 * "great conversation" as an explanation for a one.
 */

const POSITIVE: Record<'requester' | 'provider', string[]> = {
  requester: ['clean_car', 'safe_driving', 'good_conversation', 'helpful', 'on_time'],
  provider: ['ready_on_time', 'polite', 'clear_directions', 'respectful_of_vehicle'],
};

const NEGATIVE: Record<'requester' | 'provider', string[]> = {
  requester: ['late', 'unsafe_driving', 'dirty_car', 'wrong_route', 'rude', 'asked_for_more'],
  provider: ['kept_waiting', 'wrong_pickup', 'rude', 'too_many_passengers', 'mess_left'],
};

/** Above this, we ask what was good; at or below, what went wrong */
const GOOD_RATING = 4;

interface FeedbackTagsProps {
  rating: number;
  role: 'requester' | 'provider';
  value: string[];
  onChange: (codes: string[]) => void;
}

export function FeedbackTags({ rating, role, value, onChange }: FeedbackTagsProps) {
  const { t } = useT();
  if (rating === 0) return null;

  const positive = rating >= GOOD_RATING;
  const codes = positive ? POSITIVE[role] : NEGATIVE[role];

  const toggle = (code: string) => {
    onChange(value.includes(code)
      ? value.filter((c) => c !== code)
      : [...value, code]);
  };

  return (
    <fieldset className="mb-3">
      <legend className="meta-label mb-2">
        {positive ? t('rate.whatWasGood') : t('rate.whatWentWrong')}
      </legend>
      <div className="flex flex-wrap gap-2">
        {codes.map((code) => {
          const selected = value.includes(code);
          return (
            <button
              key={code}
              type="button"
              aria-pressed={selected}
              className={`text-xs font-semibold px-3 min-h-[36px] rounded-full border transition-colors ${
                selected
                  ? positive
                    ? 'border-donkey-green bg-donkey-green/10 text-donkey-green'
                    : 'border-donkey-orange bg-donkey-orange/10 text-donkey-orange'
                  : 'border-donkey-border text-donkey-muted'
              }`}
              onClick={() => toggle(code)}
            >
              {t(`rate.tag.${code}`)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
