import { expect, test } from '@playwright/test';
import {
  expectEasyTap, expectNamedFormControls, expectNoSeriousA11yViolations,
  expectNoViewportOverflow, installMapMocks, skipOnboarding,
} from './helpers';

test('the deployed PWA is usable without location access and has no coordinator', async ({
  browser, request,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'en-GB', colorScheme: 'light',
  });
  await skipOnboarding(context);
  await installMapMocks(context);
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
  const rider = await context.newPage();
  const popups: string[] = [];
  rider.on('popup', (popup) => popups.push(popup.url()));

  try {
    await rider.goto('/request');
    await expect(rider.getByText('Set your pickup')).toBeVisible();
    await rider.getByRole('button', { name: 'Change' }).click();
    const pickup = rider.getByRole('textbox', {
      name: 'Pickup: search address or tap the map',
    });
    await pickup.fill('Manchester Piccadilly');
    await rider.getByRole('button', {
      name: /Manchester Piccadilly.*United Kingdom/,
    }).click();
    await expect(rider.getByText(/Manchester Piccadilly, Piccadilly Station/)).toBeVisible();
    expect(popups).toEqual([]);
    await expectNamedFormControls(rider);
    await expectNoViewportOverflow(rider);
    await expectNoSeriousA11yViolations(rider);

    await rider.goto('/request/profile');
    await expect(rider.getByText('Private identity tree active')).toBeVisible();
    const riderNpub = await rider.getByText(/^npub1/).textContent();
    const identityStorage = await rider.evaluate(() => Object.fromEntries(
      Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)]),
    ));
    expect(identityStorage['donkeyride.identity.model']).toBe('tree');
    expect(identityStorage['donkeyride.secure.donkeyride.identityTreeRoot']).toContain('"cipher"');
    expect(identityStorage).not.toHaveProperty('donkeyride.requesterPrivKey');
    expect(identityStorage).not.toHaveProperty('donkeyride.secure.donkeyride.requesterPrivKey');

    const driver = await context.newPage();
    await driver.goto('/provide/profile');
    await expect(driver.getByText('Private identity tree active')).toBeVisible();
    const driverNpub = await driver.getByText(/^npub1/).textContent();
    expect(driverNpub).toBeTruthy();
    expect(driverNpub).not.toBe(riderNpub);
    await driver.goto('/provide');
    const goOnline = driver.getByRole('button', { name: 'Go Online' });
    await expect(goOnline).toBeVisible();
    await expectEasyTap(driver, goOnline);
    await expectNoViewportOverflow(driver);

    for (const path of ['/info', '/health', '/api/tasks/open', '/ws', '/relay']) {
      const response = await request.get(path);
      expect(response.status(), `${path} must not expose a coordinator`).toBe(404);
    }

    const route = await request.post('/routing/route', {
      data: {
        locations: [
          { lat: 53.4808, lon: -2.2426 },
          { lat: 53.4668, lon: -2.2339 },
          { lat: 53.4576, lon: -2.1578 },
        ],
        costing: 'auto',
        units: 'kilometers',
      },
    });
    expect(route.status()).toBe(200);
    const body = await route.json() as {
      trip?: { legs?: unknown[]; summary?: { length?: number; time?: number } };
    };
    expect(body.trip?.legs).toHaveLength(2);
    expect(body.trip?.summary?.length).toBeGreaterThan(0);
    expect(body.trip?.summary?.time).toBeGreaterThan(0);
  } finally {
    await context.close();
  }
});
