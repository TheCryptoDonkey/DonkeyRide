import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadRecents,
  saveRecent,
  loadSavedPlaces,
  savePlace,
  removeSavedPlace,
  suggestPlaceName,
} from './places';

const place = (label: string, lat = 51.5, lng = -0.1) => ({ label, lat, lng });

describe('places', () => {
  beforeEach(() => localStorage.clear());

  it('recents dedupe by label and cap at 5, newest first', () => {
    for (let i = 1; i <= 6; i++) saveRecent(place(`Place ${i}`));
    saveRecent(place('Place 4'));
    const recents = loadRecents();
    expect(recents).toHaveLength(5);
    expect(recents[0].label).toBe('Place 4');
    expect(recents.filter((r) => r.label === 'Place 4')).toHaveLength(1);
  });

  it('saves a place under a trimmed name', () => {
    const updated = savePlace('  Home  ', place('1 High Street, London'));
    expect(updated).not.toBeNull();
    expect(loadSavedPlaces()).toEqual([
      { name: 'Home', label: '1 High Street, London', lat: 51.5, lng: -0.1 },
    ]);
  });

  it('re-saving a name replaces it (case-insensitive)', () => {
    savePlace('Home', place('Old Home'));
    savePlace('home', place('New Home'));
    const saved = loadSavedPlaces();
    expect(saved).toHaveLength(1);
    expect(saved[0].label).toBe('New Home');
  });

  it('rejects blank names and enforces the pin limit', () => {
    expect(savePlace('   ', place('Nowhere'))).toBeNull();
    for (let i = 1; i <= 6; i++) savePlace(`Place ${i}`, place(`P${i}`));
    expect(savePlace('One more', place('Overflow'))).toBeNull();
    expect(loadSavedPlaces()).toHaveLength(6);
  });

  it('removes a saved place by name', () => {
    savePlace('Home', place('A'));
    savePlace('Work', place('B'));
    removeSavedPlace('Home');
    expect(loadSavedPlaces().map((s) => s.name)).toEqual(['Work']);
  });

  it('suggests Home, then Work, then nothing', () => {
    expect(suggestPlaceName()).toBe('Home');
    savePlace('Home', place('A'));
    expect(suggestPlaceName()).toBe('Work');
    savePlace('work', place('B'));
    expect(suggestPlaceName()).toBe('');
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('donkeyride.savedPlaces', 'not json');
    localStorage.setItem('donkeyride.recentPlaces', '{"a":1}');
    expect(loadSavedPlaces()).toEqual([]);
    expect(loadRecents()).toEqual([]);
  });
});
