/**
 * Trip history — device-local, like everything else about the rider.
 * The operator keeps no durable PII (trips are in-memory, snapshots are
 * geohash-only), so YOUR history lives on YOUR phone: recorded when a
 * trip reaches the completion screen, capped, clearable by clearing
 * site data. Payment receipts live on Nostr as kind 30535.
 */

import type { Task } from '../types/api';

const STORAGE_KEY = 'donkeyride.trip-history';
const MAX_RECORDS = 100;

export interface TripRecord {
  id: string;
  /** Unix ms when the trip finished (recorded locally) */
  completedAt: number;
  status: string;
  fareSats: number;
  from?: string;
  to?: string;
  providerNpub?: string;
  distanceKm?: number;
  rail?: string;
}

export function getTripHistory(): TripRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((r) => r && typeof r.id === 'string') : [];
  } catch {
    return [];
  }
}

function place(loc?: { lat: number; lng: number } | null, address?: string): string | undefined {
  if (address) return address;
  if (!loc) return undefined;
  return `${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}`;
}

/** Record (or update) a finished trip — newest first, capped. */
export function recordTrip(task: Task): void {
  const record: TripRecord = {
    id: task.id,
    completedAt: Date.now(),
    status: task.status,
    fareSats: task.fareEstimateSats,
    from: place(task.pickup, task.pickupAddress),
    to: place(task.dropoff, task.dropoffAddress),
    providerNpub: task.providerNpub,
    distanceKm: task.distanceKm,
    rail: task.settlement?.rail,
  };
  const rest = getTripHistory().filter((r) => r.id !== task.id);
  const existing = getTripHistory().find((r) => r.id === task.id);
  if (existing) {
    // Keep the first-seen completion time; refresh the rest
    record.completedAt = existing.completedAt;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify([record, ...rest].slice(0, MAX_RECORDS)));
}

export function clearTripHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}
