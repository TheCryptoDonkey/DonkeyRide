/**
 * The driver's vehicle — what the rider looks for at the kerb. Stored
 * device-local and sent only on accept, where it becomes participant-
 * gated ride state (never broadcast, never snapshotted). The pickup
 * code proves the driver; this finds the car.
 */

const STORAGE_KEY = 'donkeyride.vehicle';

export interface Vehicle {
  make?: string;
  model?: string;
  colour?: string;
  registration?: string;
}

function clean(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : undefined;
}

export function loadVehicle(): Vehicle | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const vehicle: Vehicle = {
      make: clean(parsed?.make),
      model: clean(parsed?.model),
      colour: clean(parsed?.colour),
      registration: clean(parsed?.registration),
    };
    return hasAnyField(vehicle) ? vehicle : null;
  } catch {
    return null;
  }
}

export function saveVehicle(vehicle: Vehicle): void {
  const cleaned: Vehicle = {
    make: clean(vehicle.make),
    model: clean(vehicle.model),
    colour: clean(vehicle.colour),
    registration: clean(vehicle.registration),
  };
  if (hasAnyField(cleaned)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function hasAnyField(vehicle: Vehicle | null | undefined): boolean {
  return Boolean(vehicle && (vehicle.make || vehicle.model || vehicle.colour || vehicle.registration));
}

/** "Blue Toyota Prius · MN65 XYZ" from whatever fields are present */
export function describeVehicle(vehicle: Vehicle | null | undefined): string | null {
  if (!vehicle) return null;
  const name = [vehicle.colour, vehicle.make, vehicle.model].filter(Boolean).join(' ');
  const parts = [name, vehicle.registration].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}
