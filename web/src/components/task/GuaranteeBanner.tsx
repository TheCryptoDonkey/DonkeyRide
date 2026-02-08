interface GuaranteeBannerProps {
  providerLabel: string;
  taskNoun: string;
  onReport?: () => void;
}

/**
 * Post-completion guarantee period banner.
 * Shown when `features.guaranteePeriod` is true.
 */
export function GuaranteeBanner({ providerLabel, taskNoun, onReport }: GuaranteeBannerProps) {
  return (
    <div className="card border-l-4 border-donkey-green">
      <p className="text-sm font-bold text-donkey-text mb-1">Guarantee period active</p>
      <p className="text-xs text-donkey-muted">
        If you experience any issues with the {providerLabel}&rsquo;s work,
        you can report a problem during the guarantee window.
        The {providerLabel}&rsquo;s stake remains locked until the guarantee period expires.
      </p>
      {onReport && (
        <button
          className="text-xs text-donkey-purple underline mt-2"
          onClick={onReport}
        >
          Report an issue with this {taskNoun}
        </button>
      )}
    </div>
  );
}
