/**
 * Why a task was cancelled, as a code rather than a sentence.
 *
 * The apps used to post the string "Requester cancelled" every single
 * time, so a rider whose driver never moved and a rider who changed their
 * mind produced identical records. The operator validates these against
 * the same vocabulary (GET /api/cancellation-reasons); this list is the
 * client's copy so the picker renders instantly and offline, and unknown
 * codes from a newer operator still render as something readable.
 */

export type CancelSide = 'requester' | 'provider';

export const CANCEL_REASONS: Record<CancelSide, string[]> = {
  requester: [
    'changed_plans',
    'provider_not_moving',
    'wait_too_long',
    'wrong_details',
    'found_another_way',
    'safety',
    'other',
  ],
  provider: [
    'too_far',
    'requester_not_here',
    'wait_too_long',
    'wrong_details',
    'vehicle_problem',
    'unsafe',
    'other',
  ],
};

/** The i18n key for a code, e.g. cancel.reason.too_far */
export function reasonKey(code: string): string {
  return `cancel.reason.${code}`;
}

/**
 * Last-resort label for a code this client has never heard of (a newer
 * operator, a domain-specific vocabulary): "wait_too_long" → "Wait too
 * long". Better than printing a snake_case token at somebody.
 */
export function prettifyCode(code: string): string {
  const words = code.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Reasons that describe the OTHER party letting you down, and so pair
 * naturally with the option to put it on the public record.
 */
export function blamesCounterparty(code: string | null): boolean {
  return code === 'provider_not_moving'
    || code === 'requester_not_here'
    || code === 'wait_too_long';
}
