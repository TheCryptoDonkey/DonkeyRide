import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocation } from './useLocation';

const getCurrentPosition = vi.fn();
const watchPosition = vi.fn();
const clearWatch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.removeItem('donkeyride.location-consent');
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition, watchPosition, clearWatch },
  });
});

describe('useLocation permission timing', () => {
  it('does not touch device location until an explicit refresh', () => {
    const { result } = renderHook(() => useLocation({ enabled: false }));

    expect(result.current.loading).toBe(false);
    expect(result.current.hasFix).toBe(false);
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(watchPosition).not.toHaveBeenCalled();

    act(() => result.current.refresh());
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(true);
  });

  it('starts a watcher only when the calling journey explicitly enables it', () => {
    watchPosition.mockReturnValue(7);
    const { unmount } = renderHook(() => useLocation({ enabled: true, watch: true }));

    expect(watchPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition).not.toHaveBeenCalled();
    unmount();
    expect(clearWatch).toHaveBeenCalledWith(7);
  });

  it('records a successful choice locally and clears it when permission is denied', () => {
    let success: PositionCallback | undefined;
    let failure: PositionErrorCallback | undefined;
    getCurrentPosition.mockImplementation((ok: PositionCallback, fail: PositionErrorCallback) => {
      success = ok;
      failure = fail;
    });
    const { result } = renderHook(() => useLocation({ enabled: false }));
    act(() => result.current.refresh());
    act(() => success?.({ coords: { latitude: 53.48, longitude: -2.24 } } as GeolocationPosition));
    expect(localStorage.getItem('donkeyride.location-consent')).toBe('true');

    act(() => result.current.refresh());
    act(() => failure?.({ code: 1, message: 'denied' } as GeolocationPositionError));
    expect(localStorage.getItem('donkeyride.location-consent')).toBeNull();
  });
});
