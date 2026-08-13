import { expect, test, type BrowserContext, type BrowserContextOptions } from '@playwright/test';
import {
  DIDSBURY,
  MANCHESTER,
  OLD_TRAFFORD,
  expectEasyTap,
  expectNoFirstInstallUpdateToast,
  expectNoViewportOverflow,
  installMapMocks,
  phoneViewport,
  skipOnboarding,
} from './helpers';

const DRIVER_LOCATION = { latitude: 53.4875, longitude: -2.2901 };
const MOVED_DRIVER_LOCATION = { latitude: 53.4700, longitude: -2.2800 };

async function prepare(context: BrowserContext): Promise<void> {
  await installMapMocks(context);
  await skipOnboarding(context);
  await context.addInitScript(() => {
    localStorage.setItem('donkeyride-domain', 'community-lift');
  });
}

test('a parent and driver complete a routed multi-child lift with no payment', async ({ browser }, testInfo) => {
  const common: Omit<BrowserContextOptions, 'geolocation'> = {
    viewport: phoneViewport(testInfo.project.name),
    permissions: ['geolocation', 'notifications'],
    locale: 'en-GB',
    colorScheme: 'light',
  };
  const riderContext = await browser.newContext({ ...common, geolocation: MANCHESTER });
  const driverContext = await browser.newContext({ ...common, geolocation: DRIVER_LOCATION });
  await Promise.all([prepare(riderContext), prepare(driverContext)]);
  const rider = await riderContext.newPage();
  const driver = await driverContext.newPage();

  let requestBody: Record<string, unknown> | null = null;
  let acceptedLocation: { lat: number; lon: number } | null = null;
  const liveLocations: Array<{ lat: number; lon?: number; lng?: number }> = [];
  rider.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/tasks/request')) {
      requestBody = request.postDataJSON() as Record<string, unknown>;
    }
  });
  driver.on('request', (request) => {
    if (request.method() !== 'POST') return;
    if (request.url().includes('/accept')) {
      const body = request.postDataJSON() as { driver_location?: { lat: number; lon: number } };
      acceptedLocation = body.driver_location || null;
    } else if (request.url().endsWith('/location')) {
      liveLocations.push(request.postDataJSON() as { lat: number; lon?: number; lng?: number });
    }
  });

  try {
    await driver.goto('/provide');
    await expectNoFirstInstallUpdateToast(driver);
    await expect(driver.getByRole('link', { name: 'organiser app' })).toBeVisible();
    await expect(driver.getByText('Lifts today')).toBeVisible();
    const goOnline = driver.getByRole('button', { name: 'Go Online' });
    await expectEasyTap(driver, goOnline);
    await goOnline.click();
    await expect(driver.getByRole('button', { name: 'Go Offline' })).toBeVisible();

    await rider.goto('/request');
    await expectNoFirstInstallUpdateToast(rider);
    await expect(rider.getByText(/Current location.*Manchester Piccadilly/)).toBeVisible();
    await rider.getByRole('textbox', { name: 'Where to?' }).fill('Didsbury');
    const firstEstimate = rider.waitForResponse((response) =>
      response.url().endsWith('/api/trips/estimate') && response.request().method() === 'POST');
    await rider.getByRole('button', { name: /Didsbury Village.*United Kingdom/ }).click();
    await expect(rider).toHaveURL(/\/request\/new$/);
    await firstEstimate;

    await expect(rider.getByTestId('community-lift-passengers')).toBeVisible();
    await rider.getByRole('textbox', { name: 'Passenger 1 name' }).fill('Ben');
    await rider.getByRole('textbox', { name: 'Passenger 1 receiving guardian' }).fill('Guardian B');
    await rider.getByRole('button', { name: '+ Add an earlier drop-off' }).click();
    await rider.getByPlaceholder('Search for this passenger’s drop-off').fill('Old Trafford');
    const routedEstimate = rider.waitForResponse((response) =>
      response.url().endsWith('/api/trips/estimate') && response.request().method() === 'POST');
    await rider.getByRole('button', { name: /Old Trafford.*United Kingdom/ }).click();
    const routeJson = await (await routedEstimate).json() as {
      routed: boolean; routeGeometry?: unknown[]; fare?: { sats?: number };
    };
    expect(routeJson.routed).toBe(true);
    expect(routeJson.routeGeometry?.length).toBeGreaterThan(2);
    expect(routeJson.fare?.sats).toBe(0);

    await rider.getByRole('textbox', { name: 'Passenger 1 name' }).fill('Alice');
    await rider.getByRole('textbox', { name: 'Passenger 1 receiving guardian' }).fill('Guardian A');
    await expect(rider.getByRole('textbox', { name: 'Passenger 2 name' })).toHaveValue('Ben');
    await expect(rider.getByText('No payment needed')).toBeVisible();

    const arrange = rider.getByRole('button', { name: /Arrange driver/ });
    await expect(arrange).toBeEnabled();
    await expectEasyTap(rider, arrange);
    await arrange.click();
    await expect(rider).toHaveURL(/\/request\/active$/);

    const sent = requestBody as {
      pickup_lat?: number; pickup_lon?: number; domain?: string;
      stops?: Array<{ lat: number; lon: number }>;
      passengers?: Array<{ name: string; handoffCode: string; dropoff: { lat: number; lon: number } }>;
    };
    expect(sent.domain).toBe('community-lift');
    expect(sent.pickup_lat).toBe(MANCHESTER.latitude);
    expect(sent.pickup_lon).toBe(MANCHESTER.longitude);
    expect(sent.passengers?.map((passenger) => passenger.name)).toEqual(['Alice', 'Ben']);
    expect(sent.passengers?.every((passenger) => /^\d{4}$/.test(passenger.handoffCode))).toBe(true);
    expect(sent.stops).toEqual([{ lat: OLD_TRAFFORD.latitude, lon: OLD_TRAFFORD.longitude, address: expect.any(String) }]);

    await expect(driver).toHaveURL(/\/provide\/incoming$/, { timeout: 15_000 });
    await expect(driver.getByText('2 passengers')).toBeVisible();
    await expect(driver.getByText('Alice')).toHaveCount(0);
    await expect(driver.getByText('Ben')).toHaveCount(0);
    await expect(driver.getByText('No payment needed')).toBeVisible();
    const accept = driver.getByRole('button', { name: 'Accept' });
    await expectEasyTap(driver, accept);
    await accept.click();
    await expect(driver).toHaveURL(/\/provide\/active$/);
    expect(acceptedLocation).toEqual({ lat: DRIVER_LOCATION.latitude, lon: DRIVER_LOCATION.longitude });
    expect(acceptedLocation).not.toEqual({ lat: MANCHESTER.latitude, lon: MANCHESTER.longitude });

    await driverContext.setGeolocation(MOVED_DRIVER_LOCATION);
    await expect.poll(() => liveLocations.some((fix) =>
      fix.lat === MOVED_DRIVER_LOCATION.latitude
      && (fix.lon ?? fix.lng) === MOVED_DRIVER_LOCATION.longitude), { timeout: 15_000 }).toBe(true);

    await driver.getByRole('button', { name: "I'm here" }).click();
    await driver.getByRole('button', { name: 'Start' }).click();
    await expect(driver.getByText('Safety', { exact: true })).toBeVisible();
    await expect(driver.getByText('Payment', { exact: true })).toHaveCount(0);
    await expect(rider.getByText('Safety', { exact: true })).toBeVisible();
    await expect(rider.getByText('Payment', { exact: true })).toHaveCount(0);
    await expect(driver.getByText(/Next drop-off.*Alice/)).toBeVisible();
    const aliceWaze = driver.getByRole('link', { name: 'Waze' });
    await expect(aliceWaze).toHaveAttribute('href', new RegExp(`${OLD_TRAFFORD.latitude},${OLD_TRAFFORD.longitude}`));

    const codes = rider.locator('[data-testid^="handoff-code-"]');
    await expect(codes).toHaveCount(2);
    const aliceCode = (await codes.nth(0).innerText()).trim();
    const benCode = (await codes.nth(1).innerText()).trim();

    await driver.getByRole('button', { name: 'Arrived for Alice' }).click();
    await driver.getByRole('textbox', { name: 'Handoff code for Alice' }).fill(aliceCode);
    await driver.getByRole('button', { name: 'Confirm Alice handoff' }).click();
    await expect(driver.getByText(/Next drop-off.*Ben/)).toBeVisible();
    await expect(driver.getByRole('link', { name: 'Waze' }))
      .toHaveAttribute('href', new RegExp(`${DIDSBURY.latitude},${DIDSBURY.longitude}`));

    await driver.getByRole('button', { name: 'Arrived for Ben' }).click();
    await driver.getByRole('textbox', { name: 'Handoff code for Ben' }).fill(benCode);
    await driver.getByRole('button', { name: 'Confirm Ben handoff' }).click();
    const finish = driver.getByRole('button', { name: 'Finish' });
    await expectEasyTap(driver, finish);
    await finish.click();

    await expect(driver).toHaveURL(/\/provide\/complete$/);
    await expect(driver.getByText('Everyone dropped off')).toBeVisible();
    await expect(driver.getByText('Shared lift — no money changed hands')).toBeVisible();
    await expect(driver.getByText('Earned')).toHaveCount(0);
    await expect(rider).toHaveURL(/\/request\/complete$/, { timeout: 15_000 });
    await expect(rider.getByText('Everyone dropped off')).toBeVisible();
    await expect(rider.getByText('Shared lift — no money changed hands')).toBeVisible();
    await expect(rider.getByText(/Pay the driver/i)).toHaveCount(0);
    await expectNoViewportOverflow(rider);
    await expectNoViewportOverflow(driver);
  } finally {
    await Promise.all([riderContext.close(), driverContext.close()]);
  }
});
