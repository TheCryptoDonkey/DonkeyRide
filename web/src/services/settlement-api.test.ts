import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getSettlementRails, setPaymentMethods, getPaymentOptions,
  getPayInstruction, settleRide, confirmReceived, setAuthPrivKey, ApiError,
} from './api';

interface MockCall { url: string; init?: RequestInit }

function mockFetch(body: unknown, ok = true, status = 200) {
  const calls: MockCall[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return {
      ok,
      status,
      statusText: ok ? 'OK' : 'Error',
      json: async () => body,
    } as Response;
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return calls;
}

function lastBody(calls: MockCall[]): Record<string, unknown> {
  const raw = calls[calls.length - 1]?.init?.body;
  return raw ? JSON.parse(raw as string) : {};
}

beforeEach(() => {
  // No auth key → no NIP-98 signing, keeping these tests offline and simple
  setAuthPrivKey(null);
  localStorage.setItem('donkeyride.coordination.mode', 'managed');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getSettlementRails', () => {
  it('unwraps the { rails } response', async () => {
    const calls = mockFetch({
      rails: [{ id: 'cash', label: 'Cash', handleLabel: null, handleHint: null, settles: 'In person', custody: 'none' }],
    });
    const rails = await getSettlementRails();
    expect(calls[0].url).toBe('/api/settlement/rails');
    expect(rails).toHaveLength(1);
    expect(rails[0].id).toBe('cash');
  });

  it('returns [] when rails is missing', async () => {
    mockFetch({});
    expect(await getSettlementRails()).toEqual([]);
  });
});

describe('setPaymentMethods', () => {
  it('POSTs { methods } to the ride', async () => {
    const calls = mockFetch({ success: true, methods: [{ rail: 'lnaddress' }] });
    const methods = [{ rail: 'lnaddress', handle: 'you@wallet.com' }, { rail: 'cash' }];
    const res = await setPaymentMethods('ride-1', { methods });

    expect(calls[0].url).toBe('/api/rides/ride-1/payment-methods');
    expect(calls[0].init?.method).toBe('POST');
    expect(lastBody(calls)).toEqual({ methods });
    expect(res.success).toBe(true);
  });
});

describe('getPaymentOptions', () => {
  it('GETs the payment options for the ride', async () => {
    const options = {
      fare: 1500, currency: 'GBP', custody: 'none', settlement: 'peer-to-peer',
      methods: [{ rail: 'lnaddress', handle: 'you@wallet.com' }],
    };
    const calls = mockFetch(options);
    const res = await getPaymentOptions('ride-2');
    expect(calls[0].url).toBe('/api/rides/ride-2/payment-options');
    expect(res).toEqual(options);
  });
});

describe('getPayInstruction', () => {
  it('POSTs the chosen rail and returns the artefact', async () => {
    const instruction = {
      rail: 'lnaddress', custody: 'none', invoice: 'lnbc1...', paymentHash: 'abc',
      payLink: 'lightning:lnbc1...', lnAddress: 'you@wallet.com', amountSats: 1500,
      verifyMethod: 'preimage', instructions: 'Pay 1500 sats to you@wallet.com',
    };
    const calls = mockFetch(instruction);
    const res = await getPayInstruction('ride-3', { rail: 'lnaddress' });

    expect(calls[0].url).toBe('/api/rides/ride-3/pay-instruction');
    expect(calls[0].init?.method).toBe('POST');
    expect(lastBody(calls)).toEqual({ rail: 'lnaddress' });
    expect(res.payLink).toBe('lightning:lnbc1...');
  });
});

describe('settleRide', () => {
  it('POSTs { rail, proof } and returns the settlement record', async () => {
    const settlement = { rail: 'lnaddress', custody: 'none', verified: true, status: 'verified' };
    const calls = mockFetch({ success: true, settlement });
    const res = await settleRide('ride-4', { rail: 'lnaddress', proof: { preimage: 'ff'.repeat(32) } });

    expect(calls[0].url).toBe('/api/rides/ride-4/settle');
    expect(calls[0].init?.method).toBe('POST');
    expect(lastBody(calls)).toEqual({ rail: 'lnaddress', proof: { preimage: 'ff'.repeat(32) } });
    expect(res.settlement.verified).toBe(true);
  });

  it('carries an M-Pesa confirmation code as proof', async () => {
    const calls = mockFetch({ success: true, settlement: { rail: 'mpesa', custody: 'none', status: 'declared' } });
    await settleRide('ride-5', { rail: 'mpesa', proof: { confirmationCode: 'QGH7XYZ12' } });
    expect(lastBody(calls)).toEqual({ rail: 'mpesa', proof: { confirmationCode: 'QGH7XYZ12' } });
  });
});

describe('confirmReceived', () => {
  it('POSTs an empty body and returns the confirmed settlement', async () => {
    const calls = mockFetch({ success: true, settlement: { rail: 'cash', custody: 'none', status: 'confirmed' } });
    const res = await confirmReceived('ride-6');
    expect(calls[0].url).toBe('/api/rides/ride-6/confirm-received');
    expect(calls[0].init?.method).toBe('POST');
    expect(lastBody(calls)).toEqual({});
    expect(res.settlement.status).toBe('confirmed');
  });
});

describe('error handling', () => {
  it('throws ApiError with the status on a non-2xx response', async () => {
    mockFetch({ error: 'Driver does not accept rail: mpesa' }, false, 400);
    await expect(getPayInstruction('ride-7', { rail: 'mpesa' })).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
    });
    await expect(getPayInstruction('ride-7', { rail: 'mpesa' }))
      .rejects.toBeInstanceOf(ApiError);
  });
});
