import { expect, test, type BrowserContext, type BrowserContextOptions } from '@playwright/test';
import {
  MANCHESTER,
  expectEasyTap,
  expectNoFirstInstallUpdateToast,
  expectNoViewportOverflow,
  installMapMocks,
  phoneViewport,
  skipOnboarding,
} from './helpers';
import { decodeGeohash, encodeGeohash } from '../src/utils/geohash';

async function prepare(context: BrowserContext): Promise<void> {
  await installMapMocks(context);
  await skipOnboarding(context);
}

test('a rider and driver can complete a real mobile journey', async ({ browser }, testInfo) => {
  const options: BrowserContextOptions = {
    viewport: phoneViewport(testInfo.project.name),
    geolocation: MANCHESTER,
    permissions: ['geolocation', 'notifications'],
    locale: 'en-GB',
    colorScheme: 'light' as const,
  };
  const riderContext = await browser.newContext(options);
  const driverContext = await browser.newContext(options);
  await Promise.all([prepare(riderContext), prepare(driverContext)]);
  const rider = await riderContext.newPage();
  const driver = await driverContext.newPage();
  let acceptedLocation: { lat: number; lon: number } | null = null;
  let requestedTaskBody: Record<string, unknown> | null = null;
  let routedLocations: Array<{ lat: number; lon: number }> = [];
  const liveLocations: Array<{ lat: number; lon?: number; lng?: number }> = [];
  driver.on('request', (request) => {
    if (request.method() !== 'POST') return;
    if (request.url().includes('/accept')) {
      const body = request.postDataJSON() as { driver_location?: { lat: number; lon: number } };
      acceptedLocation = body.driver_location || null;
    } else if (request.url().endsWith('/location')) {
      const body = request.postDataJSON() as { lat: number; lon?: number; lng?: number };
      liveLocations.push(body);
    }
  });
  rider.on('request', (request) => {
    if (request.method() !== 'POST') return;
    if (request.url().endsWith('/routing/route')) {
      const body = request.postDataJSON() as { locations?: Array<{ lat: number; lon: number }> };
      routedLocations = body.locations || [];
    }
    if (request.url().endsWith('/api/tasks/request')) {
      requestedTaskBody = request.postDataJSON() as Record<string, unknown>;
    }
  });

  try {
    await driver.goto('/provide');
    await expectNoFirstInstallUpdateToast(driver);
    const goOnline = driver.getByRole('button', { name: 'Go Online' });
    await expect(goOnline).toBeEnabled();
    await expectEasyTap(driver, goOnline);
    await goOnline.click();
    await expect(driver.getByRole('button', { name: 'Go Offline' })).toBeVisible();
    await expect(driver.getByText('Listening for ride requests...')).toBeVisible({ timeout: 15_000 });

    await rider.goto('/request');
    await expectNoFirstInstallUpdateToast(rider);
    await expect(rider.getByText('Set your pickup')).toBeVisible();
    await rider.getByRole('button', { name: 'Change' }).click();
    await rider.getByRole('button', { name: 'Use my current location' }).click();
    await expect(rider.getByText('Current location')).toBeVisible();
    await rider.getByRole('textbox', { name: 'Where to?' }).fill('Old Trafford');
    await rider.getByRole('button', { name: /Old Trafford.*United Kingdom/ }).click();
    await expect(rider).toHaveURL(/\/request\/new$/);
    await rider.getByRole('button', { name: /Money for this journey/ }).click();
    await rider.getByRole('button', { name: 'No money' }).click();

    const requestRide = rider.getByRole('button', { name: /Request driver/ });
    await expect(requestRide).toBeEnabled();
    await expectEasyTap(rider, requestRide);
    await requestRide.click();
    await expect(rider).toHaveURL(/\/request\/active$/);
    const storedRiderData = await rider.evaluate(() => JSON.stringify({
      local: Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])),
      session: Object.fromEntries(Object.keys(sessionStorage).map((key) => [key, sessionStorage.getItem(key)])),
    }));
    expect(storedRiderData).not.toContain(String(MANCHESTER.latitude));
    expect(storedRiderData).not.toContain(String(MANCHESTER.longitude));
    expect(storedRiderData).not.toContain('Old Trafford');

    await expect(driver).toHaveURL(/\/provide\/incoming$/, { timeout: 15_000 });
    await expect(driver.getByText(/New rider ride/)).toBeVisible();
    const accept = driver.getByRole('button', { name: 'Accept' });
    await expectEasyTap(driver, accept);
    await accept.click();
    await expect(driver).toHaveURL(/\/provide\/active$/);
    const storedDriverData = await driver.evaluate(() => JSON.stringify({
      local: Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])),
      session: Object.fromEntries(Object.keys(sessionStorage).map((key) => [key, sessionStorage.getItem(key)])),
    }));
    expect(storedDriverData).not.toContain(String(MANCHESTER.latitude));
    expect(storedDriverData).not.toContain(String(MANCHESTER.longitude));
    expect(storedDriverData).not.toContain('Old Trafford');
    const providerCell = decodeGeohash(encodeGeohash(
      MANCHESTER.latitude, MANCHESTER.longitude, 5,
    ));
    expect(acceptedLocation).toEqual({ lat: providerCell!.lat, lon: providerCell!.lon });
    expect(routedLocations).toEqual([
      { lat: MANCHESTER.latitude, lon: MANCHESTER.longitude },
      expect.objectContaining({ lat: 53.4631, lon: -2.2913 }),
    ]);
    expect(requestedTaskBody).toMatchObject({
      location_mode: 'participant_encrypted',
      pickup_cell: encodeGeohash(MANCHESTER.latitude, MANCHESTER.longitude, 5),
      settlement_mode: 'none',
      stop_count: 0,
      route_summary: { distance_km: 4.75, duration_minutes: 17.5 },
    });
    expect(requestedTaskBody).not.toHaveProperty('pickup_lat');
    expect(requestedTaskBody).not.toHaveProperty('pickup_address');
    await expect(rider.getByText(/driver on the way/i)).toBeVisible();
    await expect(rider.getByTestId('pickup-eta')).toHaveCount(0);
    expect(liveLocations).toEqual([]);

    const arrived = driver.getByRole('button', { name: "I'm here" });
    await expectEasyTap(driver, arrived);
    await arrived.click();
    const start = driver.getByRole('button', { name: 'Start' });
    await expectEasyTap(driver, start);
    await start.click();
    const finish = driver.getByRole('button', { name: 'Finish' });
    await expectEasyTap(driver, finish);
    await finish.click();

    await expect(driver).toHaveURL(/\/provide\/complete$/);
    await expect(driver.getByText('Ride Complete')).toBeVisible();
    await expect(driver.getByText('No money')).toBeVisible();
    await expect(rider).toHaveURL(/\/request\/complete$/, { timeout: 15_000 });
    await expect(rider.getByText('Ride Complete')).toBeVisible();
    await expect(rider.getByText('No money')).toBeVisible();
    await expectNoViewportOverflow(rider);
    await expectNoViewportOverflow(driver);
  } finally {
    await Promise.all([riderContext.close(), driverContext.close()]);
  }
});
