import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadFavourites, addFavourite, removeFavourite, toggleFavourite,
  isFavourite, favouritePubkeys,
} from './favourites';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

describe('favourite providers', () => {
  beforeEach(() => localStorage.clear());

  it('saves and reads back a favourite', () => {
    addFavourite({ pubkey: A, label: 'Sam, blue Corolla' });
    expect(isFavourite(A)).toBe(true);
    expect(loadFavourites()[0].label).toBe('Sam, blue Corolla');
  });

  it('rejects anything that is not a hex pubkey', () => {
    addFavourite({ pubkey: 'npub1notahexkey' });
    expect(loadFavourites()).toHaveLength(0);
  });

  it('is case-insensitive and never duplicates', () => {
    addFavourite({ pubkey: A });
    addFavourite({ pubkey: A.toUpperCase() });
    expect(loadFavourites()).toHaveLength(1);
  });

  it('toggles off and on', () => {
    expect(toggleFavourite({ pubkey: B })).toBe(true);
    expect(isFavourite(B)).toBe(true);
    expect(toggleFavourite({ pubkey: B })).toBe(false);
    expect(isFavourite(B)).toBe(false);
  });

  it('removes one without touching the others', () => {
    addFavourite({ pubkey: A });
    addFavourite({ pubkey: B });
    removeFavourite(A);
    expect(favouritePubkeys()).toEqual([B]);
  });

  it('caps the list', () => {
    for (let i = 0; i < 15; i++) {
      addFavourite({ pubkey: i.toString(16).padStart(64, '0') });
    }
    expect(loadFavourites().length).toBeLessThanOrEqual(10);
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('donkeyride.favouriteProviders', 'not json');
    expect(loadFavourites()).toEqual([]);
  });
});
