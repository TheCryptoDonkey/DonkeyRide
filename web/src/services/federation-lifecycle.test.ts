import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  acceptTask,
  getTask,
  arriveAtOrigin,
  completeTask,
  postProviderStake,
  submitQuote,
  getPaymentOptions,
  settleRide,
} from './api';
import { resolveForeignTask } from './federation';
import { wsUrlForOrigin } from './websocket';

/**
 * Federation phase 2: running a job that belongs to another operator.
 *
 * Phase 1 handed the driver off to the owning operator's app. Phase 2 runs
 * the whole lifecycle from here, which only works if every call goes to the
 * operator that actually holds the job. The failure this guards against is
 * quiet and bad: a lifecycle call landing on the driver's own operator,
 * which has never heard of the job, so the rider watches a driver who
 * arrived stay "on the way".
 */

const FOREIGN = 'https://operator.example';

let fetchMock: ReturnType<typeof vi.fn>;

function taskBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ride_abc',
    status: 'accepted',
    rider: { pubkey: 'riderpub' },
    driver: { pubkey: 'driverpub' },
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.setItem('donkeyride.coordination.mode', 'managed');
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => taskBody(),
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lifecycle calls follow the job', () => {
  it('accepts a foreign job at its own operator', async () => {
    await acceptTask('ride_abc', {
      providerPubkey: 'driverpub',
      providerLocation: { lat: 51.5, lng: -0.12 },
    }, FOREIGN);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${FOREIGN}/api/tasks/ride_abc/accept`);
  });

  it('keeps the coordinating operator on the returned task', async () => {
    const task = await acceptTask('ride_abc', {
      providerPubkey: 'driverpub',
      providerLocation: { lat: 51.5, lng: -0.12 },
    }, FOREIGN);

    // The operator's own response says nothing about who it is. Losing
    // this on one round trip would point every later call at the wrong
    // operator.
    expect(task.operatorBase).toBe(FOREIGN);

    const refreshed = await getTask('ride_abc', FOREIGN);
    expect(refreshed.operatorBase).toBe(FOREIGN);
    expect(fetchMock.mock.calls[1][0]).toBe(`${FOREIGN}/api/tasks/ride_abc`);
  });

  it('sends arrival and completion to the same operator', async () => {
    await arriveAtOrigin('ride_abc', { providerPubkey: 'driverpub' }, FOREIGN);
    await completeTask('ride_abc', { providerPubkey: 'driverpub' }, FOREIGN);

    expect(fetchMock.mock.calls[0][0]).toBe(`${FOREIGN}/api/tasks/ride_abc/arrive`);
    expect(fetchMock.mock.calls[1][0]).toBe(`${FOREIGN}/api/tasks/ride_abc/complete`);
  });

  it('keeps stakes, quotes and settlement on the coordinating operator', async () => {
    await postProviderStake('ride_abc', { providerPubkey: 'driverpub' }, FOREIGN);
    await submitQuote('ride_abc', {
      amountSats: 2_000,
      description: 'Fixed job price',
      providerPubkey: 'driverpub',
    }, FOREIGN);
    await getPaymentOptions('ride_abc', FOREIGN);
    await settleRide('ride_abc', { rail: 'cash', proof: {} }, FOREIGN);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${FOREIGN}/api/tasks/ride_abc/provider-stake`,
      `${FOREIGN}/api/tasks/ride_abc/quote`,
      `${FOREIGN}/api/rides/ride_abc/payment-options`,
      `${FOREIGN}/api/rides/ride_abc/settle`,
    ]);
  });

  it('leaves our own jobs on our own operator', async () => {
    const task = await getTask('ride_abc');

    expect(fetchMock.mock.calls[0][0]).toBe('/api/tasks/ride_abc');
    // Home-operator jobs now carry their origin too. That lets an active
    // job survive a later runtime operator switch or app restart.
    expect(task.operatorBase).toBe('http://localhost:3000');
  });
});

describe('resolving a job announced on a relay', () => {
  it('asks the announcing operator, through the signed API path', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ rides: [taskBody({ id: 'ride_xyz', status: 'requested' })] }),
    });

    const task = await resolveForeignTask({
      taskId: 'ride_xyz',
      geohash: 'gcpuv',
      domain: 'ridesharing',
      api: FOREIGN,
      operatorPubkey: null,
      expiration: null,
      eventId: 'evt',
    });

    expect(task?.id).toBe('ride_xyz');
    expect(task?.operatorBase).toBe(FOREIGN);
    // Goes through request(), which attaches NIP-98 when an identity is
    // set. A bare fetch got 401 from every auth-enabled operator, which
    // silently emptied federated discovery.
    expect(fetchMock.mock.calls[0][0]).toBe(`${FOREIGN}/api/tasks/open`);
    expect(fetchMock.mock.calls[0][1]).toBeDefined();
  });

  it('returns null when the job is gone from the operator that announced it', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ rides: [] }) });

    const task = await resolveForeignTask({
      taskId: 'ride_gone',
      geohash: 'gcpuv',
      domain: 'ridesharing',
      api: FOREIGN,
      operatorPubkey: null,
      expiration: null,
      eventId: 'evt',
    });

    expect(task).toBeNull();
  });
});

describe('wsUrlForOrigin', () => {
  it('derives the reverse-proxied socket for a TLS operator', () => {
    expect(wsUrlForOrigin('https://operator.example')).toBe('wss://operator.example/ws');
    expect(wsUrlForOrigin('https://operator.example:8443')).toBe('wss://operator.example:8443/ws');
  });

  it('uses the direct port for a plain-http (development) operator', () => {
    expect(wsUrlForOrigin('http://localhost:3000')).toBe('ws://localhost:3001');
  });

  it('refuses anything that is not an http(s) origin', () => {
    // The origin comes from an untrusted relay event, so a javascript: or
    // file: URL must never become a socket target.
    expect(wsUrlForOrigin('javascript:alert(1)')).toBeNull();
    expect(wsUrlForOrigin('not a url')).toBeNull();
  });
});
