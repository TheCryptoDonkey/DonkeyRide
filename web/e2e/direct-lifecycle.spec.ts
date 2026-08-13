import {
  expect, test, type BrowserContext, type BrowserContextOptions, type WebSocketRoute,
} from '@playwright/test';
import { nip19 } from 'nostr-tools';
import {
  ETIHAD_STADIUM, MANCHESTER, expectEasyTap, expectNamedFormControls,
  expectNoSeriousA11yViolations, expectNoViewportOverflow, installMapMocks, skipOnboarding,
} from './helpers';

type Event = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
};
type Filter = Record<string, unknown>;

function matches(event: Event, filter: Filter): boolean {
  if (Array.isArray(filter.ids)
      && !(filter.ids as string[]).some((id) => event.id.startsWith(id))) return false;
  if (Array.isArray(filter.authors)
      && !(filter.authors as string[]).some((author) => event.pubkey.startsWith(author))) return false;
  if (Array.isArray(filter.kinds) && !(filter.kinds as number[]).includes(event.kind)) return false;
  if (typeof filter.since === 'number' && event.created_at < filter.since) return false;
  if (typeof filter.until === 'number' && event.created_at > filter.until) return false;
  for (const [key, values] of Object.entries(filter)) {
    if (!key.startsWith('#') || !Array.isArray(values)) continue;
    const name = key.slice(1);
    if (!(values as string[]).some((value) =>
      event.tags.some((tag) => tag[0] === name && tag[1] === value))) return false;
  }
  return true;
}

class EphemeralRelay {
  readonly publicEvents: Event[] = [];
  private stored: Event[] = [];
  private clients = new Map<WebSocketRoute, Map<string, Filter[]>>();

  async install(context: BrowserContext): Promise<void> {
    await context.routeWebSocket('wss://relay.test', (socket) => {
      const subscriptions = new Map<string, Filter[]>();
      this.clients.set(socket, subscriptions);
      socket.onMessage((raw) => {
        const message = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
        if (message[0] === 'REQ') {
          const id = String(message[1]);
          const filters = message.slice(2) as Filter[];
          subscriptions.set(id, filters);
          const replay = this.stored
            .filter((event) => filters.some((filter) => matches(event, filter)))
            .sort((a, b) => b.created_at - a.created_at);
          for (const event of replay) socket.send(JSON.stringify(['EVENT', id, event]));
          socket.send(JSON.stringify(['EOSE', id]));
          return;
        }
        if (message[0] === 'CLOSE') {
          subscriptions.delete(String(message[1]));
          return;
        }
        if (message[0] !== 'EVENT') return;
        const event = message[1] as Event;
        this.publicEvents.push(event);
        // Ephemeral events are broadcast live and deliberately not replayed.
        if (!(event.kind >= 20_000 && event.kind < 30_000)) {
          const d = event.tags.find((tag) => tag[0] === 'd')?.[1];
          if (event.kind >= 30_000 && event.kind < 40_000 && d) {
            this.stored = this.stored.filter((old) => old.kind !== event.kind
              || old.pubkey !== event.pubkey
              || old.tags.find((tag) => tag[0] === 'd')?.[1] !== d);
          }
          this.stored.push(event);
        }
        socket.send(JSON.stringify(['OK', event.id, true, '']));
        for (const [client, active] of this.clients) {
          for (const [id, filters] of active) {
            if (filters.some((filter) => matches(event, filter))) {
              client.send(JSON.stringify(['EVENT', id, event]));
            }
          }
        }
      });
      socket.onClose(() => this.clients.delete(socket));
    });
  }
}

async function prepare(
  context: BrowserContext,
  relay: EphemeralRelay,
  forbidden: string[],
): Promise<void> {
  await skipOnboarding(context);
  await installMapMocks(context);
  await relay.install(context);
  await context.route(/^http:\/\/127\.0\.0\.1:4180\/(?:api\/|info(?:\?|$)|health(?:\?|$))/, (route) => {
    forbidden.push(route.request().url());
    return route.abort('blockedbyclient');
  });
}

test('the static PWA completes an encrypted no-money journey without an operator', async ({ browser }) => {
  const relay = new EphemeralRelay();
  const forbidden: string[] = [];
  const options: BrowserContextOptions = {
    viewport: { width: 390, height: 844 },
    geolocation: MANCHESTER,
    permissions: ['geolocation', 'notifications'],
    locale: 'en-GB',
    colorScheme: 'light',
  };
  const riderContext = await browser.newContext(options);
  const driverContext = await browser.newContext(options);
  await Promise.all([
    prepare(riderContext, relay, forbidden),
    prepare(driverContext, relay, forbidden),
  ]);
  const rider = await riderContext.newPage();
  const driver = await driverContext.newPage();
  const nonRelaySockets: string[] = [];
  rider.on('websocket', (socket) => {
    if (socket.url() !== 'wss://relay.test/') nonRelaySockets.push(socket.url());
  });
  driver.on('websocket', (socket) => {
    if (socket.url() !== 'wss://relay.test/') nonRelaySockets.push(socket.url());
  });
  let routedLocations: Array<{ lat: number; lon: number }> = [];
  rider.on('request', (request) => {
    if (request.url().endsWith('/routing/route')) {
      routedLocations = (request.postDataJSON() as {
        locations?: Array<{ lat: number; lon: number }>;
      }).locations || [];
    }
  });

  try {
    await driver.goto('/provide/profile');
    await expect(driver.getByText('Private identity tree active')).toBeVisible();
    const driverAccountNpub = await driver.getByText(/^npub1/).textContent();
    expect(driverAccountNpub).toBeTruthy();
    const decodedDriverAccount = nip19.decode(driverAccountNpub!);
    expect(decodedDriverAccount.type).toBe('npub');
    const driverAccountPubkey = decodedDriverAccount.data as string;

    await driver.goto('/provide');
    const goOnline = driver.getByRole('button', { name: 'Go Online' });
    await expectEasyTap(driver, goOnline);
    await goOnline.click();
    await expect(driver.getByRole('button', { name: 'Go Offline' })).toBeVisible();
    await expect(driver.getByText('Listening for ride requests...')).toBeVisible();
    const driverStorage = await driver.evaluate(() => Object.fromEntries(
      Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)]),
    ));
    expect(driverStorage).not.toHaveProperty('donkeyride.providerPrivKey');
    expect(driverStorage).not.toHaveProperty('donkeyride.secure.donkeyride.providerPrivKey');
    expect(driverStorage['donkeyride.secure.donkeyride.identityTreeRoot']).toContain('"cipher"');
    expect(driverStorage['donkeyride.identity.model']).toBe('tree');

    await rider.goto('/request');
    await expect(rider.getByText('Current location')).toBeVisible();
    const riderStorage = await rider.evaluate(() => Object.fromEntries(
      Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)]),
    ));
    expect(riderStorage).not.toHaveProperty('donkeyride.requesterPrivKey');
    expect(riderStorage).not.toHaveProperty('donkeyride.secure.donkeyride.requesterPrivKey');
    expect(riderStorage['donkeyride.secure.donkeyride.identityTreeRoot']).toContain('"cipher"');
    expect(riderStorage['donkeyride.identity.model']).toBe('tree');
    await rider.getByRole('textbox', { name: 'Where to?' }).fill('Old Trafford');
    await rider.getByRole('button', { name: /Old Trafford.*United Kingdom/ }).click();
    await expect(rider).toHaveURL(/\/request\/new$/);
    await expect(rider.getByText('No money', { exact: true }).first()).toBeVisible();

    await rider.getByRole('button', { name: 'Stops along the way' }).click();
    await rider.getByRole('button', { name: '+ Add a stop' }).click();
    await rider.getByPlaceholder('Search for a stop...').fill('Etihad Stadium');
    await rider.getByRole('button', { name: /Etihad Stadium.*United Kingdom/ }).click();
    await expect(rider.getByText(/Etihad Stadium, Ashton New Road/)).toBeVisible();

    const request = rider.getByRole('button', { name: /Request driver/ });
    await expect(request).toBeEnabled();
    await expectEasyTap(rider, request);
    await request.click();
    await expect(rider).toHaveURL(/\/request\/active$/);

    const waiting = driver.getByRole('button', { name: /No money.*View/ });
    await expect(waiting).toBeVisible({ timeout: 20_000 });
    await waiting.click();
    await expect(driver).toHaveURL(/\/provide\/incoming$/);
    await expect(driver.getByText(/New rider ride/)).toBeVisible();
    const accept = driver.getByRole('button', { name: 'Accept' });
    await expectEasyTap(driver, accept);
    await accept.click();
    await expect(driver).toHaveURL(/\/provide\/active$/, { timeout: 20_000 });
    await expect(rider.getByText(/driver on the way/i)).toBeVisible();

    // The browser used a road-router request with every ordered point. The
    // 4.75 km / 17.5 min shown by the UI comes from that mocked road route,
    // not a point-to-point haversine estimate.
    expect(routedLocations).toEqual([
      { lat: MANCHESTER.latitude, lon: MANCHESTER.longitude },
      { lat: ETIHAD_STADIUM.latitude, lon: ETIHAD_STADIUM.longitude },
      expect.objectContaining({ lat: 53.4631, lon: -2.2913 }),
    ]);
    await expect(driver.getByText(/Etihad Stadium, Ashton New Road/)).toBeVisible({ timeout: 15_000 });
    await expect(driver.getByText(/Old Trafford/).first()).toBeVisible({ timeout: 15_000 });

    await driver.getByRole('button', { name: "I'm here" }).click();
    await driver.getByRole('button', { name: 'Start' }).click();
    await driver.getByRole('button', { name: 'Finish' }).click();
    await expect(driver).toHaveURL(/\/provide\/complete$/);
    await expect(rider).toHaveURL(/\/request\/complete$/, { timeout: 20_000 });
    await expect(rider.getByText('Ride Complete')).toBeVisible();
    await expect(driver.getByText('No money')).toBeVisible();

    expect(forbidden, 'the direct PWA must not call a coordinator API').toEqual([]);
    expect(nonRelaySockets, 'the direct PWA must not open an operator WebSocket').toEqual([]);
    const publicWire = JSON.stringify(relay.publicEvents);
    expect(publicWire).not.toContain('Old Trafford');
    expect(publicWire).not.toContain('Etihad Stadium');
    expect(publicWire).not.toContain('Manchester Piccadilly');
    expect(publicWire).not.toContain(String(MANCHESTER.latitude));
    expect(publicWire).not.toContain(String(MANCHESTER.longitude));
    expect(relay.publicEvents.some((event) => event.kind === 37500)).toBe(true);
    expect(relay.publicEvents.some((event) => event.kind === 1059)).toBe(true);
    const shiftBeacons = relay.publicEvents.filter((event) => event.kind === 20500);
    expect(shiftBeacons.length).toBeGreaterThan(0);
    expect(shiftBeacons.every((event) => event.pubkey !== driverAccountPubkey)).toBe(true);
    await expectNoViewportOverflow(rider);
    await expectNoViewportOverflow(driver);
  } finally {
    await Promise.all([riderContext.close(), driverContext.close()]);
  }
});

test('denied location stays in one window and offers a usable manual pickup', async ({ browser }) => {
  const relay = new EphemeralRelay();
  const forbidden: string[] = [];
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'en-GB', colorScheme: 'light',
  });
  await prepare(context, relay, forbidden);
  await context.addInitScript(() => {
    const error = {
      code: 1, message: 'Location permission denied',
      PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3,
    };
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_ok: PositionCallback, fail?: PositionErrorCallback) => fail?.(error),
        watchPosition: (_ok: PositionCallback, fail?: PositionErrorCallback) => {
          fail?.(error);
          return 1;
        },
        clearWatch: () => {},
      },
    });
  });
  const page = await context.newPage();
  const popups: string[] = [];
  page.on('popup', (popup) => popups.push(popup.url()));

  try {
    await page.goto('/request');
    await expect(page.getByText('Set your pickup')).toBeVisible();
    await expect(page.getByRole('button', { name: 'You', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Change' }).click();
    const pickup = page.getByRole('textbox', { name: 'Pickup: search address or tap the map' });
    await pickup.fill('Manchester Piccadilly');
    await page.getByRole('button', { name: /Manchester Piccadilly.*United Kingdom/ }).click();
    await expect(page.getByText(/Manchester Piccadilly, Piccadilly Station/)).toBeVisible();
    expect(popups).toEqual([]);
    expect(forbidden).toEqual([]);
    await expectNamedFormControls(page);
    await expectNoViewportOverflow(page);
    await expectNoSeriousA11yViolations(page);
  } finally {
    await context.close();
  }
});

test('an existing identity is preserved until the human confirms a fresh private tree', async ({ browser }) => {
  const relay = new EphemeralRelay();
  const forbidden: string[] = [];
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'en-GB', colorScheme: 'light',
  });
  await prepare(context, relay, forbidden);
  await context.addInitScript(() => {
    try {
      // Simulate an installation from before identity trees. The ordinary
      // loader first moves this record into protected device storage.
      localStorage.setItem('donkeyride.providerPrivKey', '11'.repeat(32));
    } catch { /* opaque origin */ }
  });
  const page = await context.newPage();

  try {
    await page.goto('/provide/profile');
    await expect(page.getByText('Existing identity preserved')).toBeVisible();
    const startFresh = page.getByRole('button', { name: 'Start fresh with private identities' });
    await startFresh.scrollIntoViewIfNeeded();
    await expectEasyTap(page, startFresh);
    await startFresh.click();

    await expect(page.getByText(/Back up your current recovery key first/)).toBeVisible();
    const replace = page.getByRole('button', { name: 'Replace both identities' });
    await replace.scrollIntoViewIfNeeded();
    await expectEasyTap(page, replace);
    await replace.click();

    await expect(page.getByText('Private identity tree active')).toBeVisible();
    const storage = await page.evaluate(() => Object.fromEntries(
      Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)]),
    ));
    expect(storage['donkeyride.identity.model']).toBe('tree');
    expect(storage['donkeyride.secure.donkeyride.identityTreeRoot']).toContain('"cipher"');
    expect(storage).not.toHaveProperty('donkeyride.providerPrivKey');
    expect(storage).not.toHaveProperty('donkeyride.secure.donkeyride.providerPrivKey');
    expect(forbidden).toEqual([]);
    await expectNoViewportOverflow(page);
    await expectNoSeriousA11yViolations(page);
  } finally {
    await context.close();
  }
});
