/**
 * The driver's remembered set of accepted payment methods. Kept in
 * localStorage so a driver sets their rails once and they persist across
 * shifts. When a ride is accepted these are posted to that ride so the rider
 * can pay the driver directly.
 */
import type { PaymentMethod } from '../types/api';

export const PAYMENT_METHODS_KEY = 'donkeyride.paymentMethods';

/** Read the driver's saved payment methods (empty array if none/unreadable) */
export function getSavedPaymentMethods(): PaymentMethod[] {
  try {
    const raw = localStorage.getItem(PAYMENT_METHODS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is PaymentMethod => !!m && typeof m.rail === 'string',
    );
  } catch {
    return [];
  }
}

/** Persist the driver's chosen payment methods */
export function savePaymentMethods(methods: PaymentMethod[]): void {
  try {
    localStorage.setItem(PAYMENT_METHODS_KEY, JSON.stringify(methods));
  } catch {
    // Storage unavailable — non-fatal, they just won't be remembered
  }
}
