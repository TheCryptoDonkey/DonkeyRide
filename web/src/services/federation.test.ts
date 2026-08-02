import { describe, it, expect } from 'vitest';
import { parseTaskAnnouncement, isRelevantAnnouncement, safeOperatorOrigin } from './federation';
import { encodeGeohash, decodeGeohash } from '../utils/geohash';
import type { NostrEvent } from '../types/nostr';
import type { TaskAnnouncement } from './federation';

const MANCHESTER = { lat: 53.4808, lng: -2.2426 };
const LONDON = { lat: 51.5074, lng: -0.1278 };
const MANCHESTER_CELL = encodeGeohash(MANCHESTER.lat, MANCHESTER.lng, 5);

function announcementEvent(overrides: Partial<Record<string, string | null>> = {}): NostrEvent {
  const tags: string[][] = [];
  const values: Record<string, string | null> = {
    d: 'task-1',
    g: MANCHESTER_CELL,
    domain: 'ridesharing',
    api: 'https://operator-b.example.org',
    operator: 'a'.repeat(64),
    expiration: String(Math.floor(Date.now() / 1000) + 900),
    t: 'trott-task',
    ...overrides,
  };
  for (const [name, value] of Object.entries(values)) {
    if (value !== null) tags.push([name, value]);
  }
  return {
    id: 'e'.repeat(64),
    pubkey: 'b'.repeat(64),
    created_at: Math.floor(Date.now() / 1000),
    kind: 37500,
    tags,
    content: '',
    sig: '0'.repeat(128),
  };
}

function parsed(overrides: Partial<Record<string, string | null>> = {}): TaskAnnouncement {
  const announcement = parseTaskAnnouncement(announcementEvent(overrides));
  if (!announcement) throw new Error('expected a parseable announcement');
  return announcement;
}

describe('geohash decode', () => {
  it('round-trips with encode to within a cell width', () => {
    const centre = decodeGeohash(MANCHESTER_CELL)!;
    expect(Math.abs(centre.lat - MANCHESTER.lat)).toBeLessThan(0.05);
    expect(Math.abs(centre.lon - MANCHESTER.lng)).toBeLessThan(0.05);
    expect(decodeGeohash('not a hash!')).toBeNull();
  });
});

describe('parseTaskAnnouncement', () => {
  it('parses a complete announcement', () => {
    const announcement = parsed();
    expect(announcement.taskId).toBe('task-1');
    expect(announcement.api).toBe('https://operator-b.example.org');
    expect(announcement.geohash).toBe(MANCHESTER_CELL);
  });

  it('rejects announcements without a resolvable operator', () => {
    expect(parseTaskAnnouncement(announcementEvent({ api: null }))).toBeNull();
  });

  it('rejects non-https operator origins (except localhost dev)', () => {
    expect(safeOperatorOrigin('http://evil.example.org')).toBeNull();
    expect(safeOperatorOrigin('ftp://x')).toBeNull();
    expect(safeOperatorOrigin('not a url')).toBeNull();
    expect(safeOperatorOrigin('http://localhost:3000')).toBe('http://localhost:3000');
    expect(safeOperatorOrigin('https://op.example.org/some/path')).toBe('https://op.example.org');
  });
});

describe('isRelevantAnnouncement', () => {
  const base = {
    domainId: 'ridesharing',
    ownOrigin: 'https://my-operator.example.org',
    areas: [] as string[],
    location: MANCHESTER,
  };

  it('accepts an in-radius foreign job', () => {
    expect(isRelevantAnnouncement(parsed(), base)).toBe(true);
  });

  it('excludes jobs from our own operator (they arrive over WS)', () => {
    expect(isRelevantAnnouncement(parsed(), {
      ...base,
      ownOrigin: 'https://operator-b.example.org',
    })).toBe(false);
  });

  it('excludes other domains, expired announcements and far-away jobs', () => {
    expect(isRelevantAnnouncement(parsed({ domain: 'locksmith' }), base)).toBe(false);
    expect(isRelevantAnnouncement(
      parsed({ expiration: String(Math.floor(Date.now() / 1000) - 10) }), base)).toBe(false);
    expect(isRelevantAnnouncement(parsed(), { ...base, location: LONDON })).toBe(false);
  });

  it('working areas override the radius, matching cell prefixes both ways', () => {
    // Driver's coarser cell contains the announcement's precision-5 cell
    expect(isRelevantAnnouncement(parsed(), {
      ...base,
      location: LONDON, // areas must win over the (irrelevant) location
      areas: [MANCHESTER_CELL.slice(0, 3)],
    })).toBe(true);
    // Driver's finer cell sits inside the announcement's cell
    expect(isRelevantAnnouncement(parsed(), {
      ...base,
      areas: [`${MANCHESTER_CELL}abc`],
    })).toBe(true);
    // Disjoint areas exclude
    expect(isRelevantAnnouncement(parsed(), {
      ...base,
      areas: [encodeGeohash(LONDON.lat, LONDON.lng, 5)],
    })).toBe(false);
  });

  it('stays quiet with no areas and no GPS fix', () => {
    expect(isRelevantAnnouncement(parsed(), { ...base, location: null })).toBe(false);
  });
});
