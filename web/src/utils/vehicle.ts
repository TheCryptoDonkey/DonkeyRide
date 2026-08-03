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
  /**
   * Service classes this car can serve (domain ids, e.g. ['xl']).
   * The default class needs no declaration; anything above it does, so
   * an XL request can never land with a hatchback.
   */
  serviceOptions?: string[];
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
      serviceOptions: cleanOptions(parsed?.serviceOptions),
    };
    return hasAnyField(vehicle) ? vehicle : null;
  } catch {
    return null;
  }
}

function cleanOptions(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = raw
    .filter((v): v is string => typeof v === 'string' && /^[a-z0-9_-]{1,32}$/i.test(v.trim()))
    .map((v) => v.trim().toLowerCase());
  return ids.length > 0 ? Array.from(new Set(ids)) : undefined;
}

/** Classes this driver has declared — [] when they serve the default only */
export function loadServiceOptions(): string[] {
  return loadVehicle()?.serviceOptions || [];
}

export function saveVehicle(vehicle: Vehicle): void {
  const cleaned: Vehicle = {
    make: clean(vehicle.make),
    model: clean(vehicle.model),
    colour: clean(vehicle.colour),
    registration: clean(vehicle.registration),
    serviceOptions: cleanOptions(vehicle.serviceOptions),
  };
  if (hasAnyField(cleaned)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function hasAnyField(vehicle: Vehicle | null | undefined): boolean {
  return Boolean(vehicle && (
    vehicle.make || vehicle.model || vehicle.colour || vehicle.registration
    || (vehicle.serviceOptions && vehicle.serviceOptions.length > 0)
  ));
}

/** "Blue Toyota Prius · MN65 XYZ" from whatever fields are present */
export function describeVehicle(vehicle: Vehicle | null | undefined): string | null {
  if (!vehicle) return null;
  const name = [vehicle.colour, vehicle.make, vehicle.model].filter(Boolean).join(' ');
  const parts = [name, vehicle.registration].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}
