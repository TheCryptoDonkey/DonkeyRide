/**
 * Trip history — device-local, like everything else about the rider.
 * The operator keeps no durable PII (trips are in-memory, snapshots are
 * geohash-only), so YOUR history lives on YOUR phone: recorded when a
 * trip reaches the completion screen, capped, clearable by clearing
 * site data. Payment receipts live on Nostr as kind 30535.
 */

import type { Task, BtcPrices } from '../types/api';

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
  /**
   * Hex pubkey of whoever did the job. Needed to reach them AFTER the
   * trip: a phone left on the back seat is the commonest support case
   * there is, and the chat rail is NIP-17 DMs that work perfectly well
   * once the task is over — the app just never kept the key to use it.
   */
  providerPubkey?: string;
  distanceKm?: number;
  durationMin?: number;
  rail?: string;
  /**
   * Coordinates, so a past trip can be booked again in one tap. Kept on the
   * device with everything else — the operator has no durable record of
   * where anybody went, by design.
   */
  fromLoc?: { lat: number; lng: number };
  toLoc?: { lat: number; lng: number };
  /** What made up the fare, for a receipt that actually explains itself */
  breakdown?: {
    baseFareSats: number;
    distanceFareSats: number;
    timeFareSats: number;
    operatorFeeSats: number;
  };
  /** Waiting time added at the kerb, if any */
  waitingSats?: number;
  waitingMinutes?: number;
  /** Tip, recorded separately so the fare stays the fare */
  tipSats?: number;
  /** Demand multiplier applied, when the operator runs demand pricing */
  surgeMultiplier?: number;
  /** Service class taken */
  option?: string;
  /**
   * BTC price at the moment this trip settled.
   *
   * The fare is held in sats, and everything on screen converts to fiat at
   * the LIVE rate — right for a trip being priced, wrong for one already
   * paid. Without this a receipt quietly re-prices for ever: a cash fare
   * handed over as £4.07 read £4.06 an hour later. A receipt is a record of
   * what happened, so it converts at the rate that applied when it happened.
   */
  btcPricesAt?: BtcPrices;
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

/**
 * Record (or update) a finished trip — newest first, capped.
 *
 * `extra` carries what the Task shape does not: the fare breakdown and any
 * demand multiplier, both known at request time and needed for a receipt
 * that explains the number rather than just restating it.
 */
export function recordTrip(task: Task, extra?: {
  breakdown?: TripRecord['breakdown'];
  surgeMultiplier?: number;
  /** The rate in force as this trip settled — see TripRecord.btcPricesAt */
  btcPrices?: BtcPrices | null;
}): void {
  const record: TripRecord = {
    id: task.id,
    completedAt: Date.now(),
    status: task.status,
    fareSats: task.fareEstimateSats,
    from: place(task.pickup, task.pickupAddress),
    to: place(task.dropoff, task.dropoffAddress),
    providerNpub: task.providerNpub,
    providerPubkey: task.providerPubkey,
    distanceKm: task.distanceKm,
    durationMin: task.durationMin,
    rail: task.settlement?.rail,
    fromLoc: task.pickup ? { lat: task.pickup.lat, lng: task.pickup.lng } : undefined,
    toLoc: task.dropoff ? { lat: task.dropoff.lat, lng: task.dropoff.lng } : undefined,
    waitingSats: task.waiting?.sats,
    waitingMinutes: task.waiting?.minutes,
    tipSats: task.tip,
    option: task.option,
  };
  const rest = getTripHistory().filter((r) => r.id !== task.id);
  const existing = getTripHistory().find((r) => r.id === task.id);
  if (existing) {
    // Keep the first-seen completion time; refresh the rest
    record.completedAt = existing.completedAt;
  }
  // Breakdown and surge are known at request time, so preserve whatever was
  // captured earlier rather than losing it on a later re-record
  record.breakdown = extra?.breakdown ?? existing?.breakdown;
  record.surgeMultiplier = extra?.surgeMultiplier ?? existing?.surgeMultiplier;
  // First rate wins: this trip settled once. A re-record (settlement
  // confirming, say) must not re-stamp it with a later market.
  record.btcPricesAt = existing?.btcPricesAt ?? extra?.btcPrices ?? undefined;
  localStorage.setItem(STORAGE_KEY, JSON.stringify([record, ...rest].slice(0, MAX_RECORDS)));
}

export function clearTripHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}
