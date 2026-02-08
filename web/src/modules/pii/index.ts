/**
 * PII Module — location tracking, maps, and data retention.
 *
 * This module encapsulates all PII-handling code so it can be stripped
 * from privacy-maximised deployments. Replace this barrel with stubs
 * to disable all location/map functionality:
 *
 * ```ts
 * export const PII_MODULE_AVAILABLE = false;
 * export const MapSection = ({ fallback }: any) => fallback || null;
 * export const LiveTracker = () => null;
 * export const useLiveTracking = () => {};
 * export const LocationProvider = ({ children }: any) => children;
 * export const useLocationConsent = () => ({
 *   consented: false, grantConsent: () => {}, revokeConsent: () => {},
 *   location: { lat: 0, lng: 0 }, loading: false, error: null,
 * });
 * export const RetentionNotice = () => null;
 * ```
 */
export const PII_MODULE_AVAILABLE = true;

export { MapSection } from './MapSection';
export { LiveTracker, useLiveTracking } from './LiveTracker';
export { LocationProvider, useLocationConsent } from './LocationProvider';
export { RetentionNotice } from './RetentionNotice';
