import { describe, it, expect, beforeEach } from 'vitest';
import { loadVehicle, saveVehicle, describeVehicle } from './vehicle';

describe('vehicle storage', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips and trims', () => {
    saveVehicle({ make: ' Toyota ', model: 'Prius', colour: 'Blue', registration: 'MN65 XYZ' });
    expect(loadVehicle()).toEqual({
      make: 'Toyota', model: 'Prius', colour: 'Blue', registration: 'MN65 XYZ',
    });
  });

  it('an all-empty vehicle clears the record', () => {
    saveVehicle({ make: 'Toyota' });
    saveVehicle({ make: '  ', model: '' });
    expect(loadVehicle()).toBeNull();
  });

  it('ignores corrupt storage', () => {
    localStorage.setItem('donkeyride.vehicle', '{nope');
    expect(loadVehicle()).toBeNull();
  });
});

describe('describeVehicle', () => {
  it('composes colour make model and registration', () => {
    expect(describeVehicle({
      make: 'Toyota', model: 'Prius', colour: 'Blue', registration: 'MN65 XYZ',
    })).toBe('Blue Toyota Prius · MN65 XYZ');
  });

  it('copes with partial details', () => {
    expect(describeVehicle({ colour: 'Red', registration: 'AB12 CDE' })).toBe('Red · AB12 CDE');
    expect(describeVehicle({ model: 'Corolla' })).toBe('Corolla');
    expect(describeVehicle({})).toBeNull();
    expect(describeVehicle(null)).toBeNull();
  });
});
