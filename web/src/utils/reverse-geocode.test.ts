import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { reverseGeocode, formatPhotonLabel, clearReverseGeocodeCache } from './reverse-geocode';

const PIN = { lat: 53.4808, lng: -2.2426 };

function photonResponse(properties: Record<string, string>) {
  return {
    ok: true,
    json: async () => ({ features: [{ properties }] }),
  };
}

describe('formatPhotonLabel', () => {
  it('joins name, street, city and postcode', () => {
    expect(formatPhotonLabel({
      name: 'Barton Arcade',
      street: 'Deansgate',
      housenumber: '51',
      city: 'Manchester',
      postcode: 'M3 2BW',
    })).toBe('Barton Arcade, Deansgate 51, Manchester, M3 2BW');
  });

  it('does not repeat the street when it is the name', () => {
    expect(formatPhotonLabel({ street: 'Deansgate', name: 'Deansgate', city: 'Manchester' }))
      .toBe('Deansgate, Manchester');
  });
});

describe('reverseGeocode', () => {
  beforeEach(() => {
    clearReverseGeocodeCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names a coordinate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      photonResponse({ street: 'Deansgate', housenumber: '14', city: 'Manchester' }),
    ));
    expect(await reverseGeocode(PIN)).toBe('Deansgate 14, Manchester');
  });

  it('caches nearby lookups so a walk does not re-query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      photonResponse({ street: 'Deansgate', city: 'Manchester' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await reverseGeocode(PIN);
    await reverseGeocode({ lat: PIN.lat + 0.000001, lng: PIN.lng });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null rather than throwing when the lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await reverseGeocode(PIN)).toBeNull();
  });

  it('returns null when nothing is found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [] }) }));
    expect(await reverseGeocode(PIN)).toBeNull();
  });
});
