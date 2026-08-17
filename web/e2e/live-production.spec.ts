import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
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

test('the deployed Android download is the signed binary described by the human-facing page', async ({ page, request }) => {
  // The published metadata is what is actually on the host, so it is the source
  // of truth and the page has to describe THAT. Pinning a release number in
  // here instead asserts nothing about the deployment: it fails on every ship
  // and the cheap way to make it pass is to edit the number, which is exactly
  // the drift this test exists to catch.
  const metadataResponse = await request.get('/downloads/driver-app.json');
  expect(metadataResponse.status()).toBe(200);
  const metadata = await metadataResponse.json() as {
    android: {
      available: boolean; version: string; versionCode: number; url: string;
      bytes: number; sha256: string; certificateSha256: string; sourceCommit: string;
    };
  };
  expect(metadata.android.available).toBe(true);
  expect(metadata.android.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(Number.isInteger(metadata.android.versionCode)).toBe(true);
  expect(metadata.android.versionCode).toBeGreaterThan(0);

  await page.goto('/download.html');
  await expect(page.getByRole('heading', { name: 'DonkeyRide Driver for Android' })).toBeVisible();
  await expect(page.getByText('Current signed release is ready.')).toBeVisible();
  const download = page.getByRole('link', { name: `Download APK · v${metadata.android.version}` });
  await expect(download).toBeVisible();
  await expectEasyTap(page, download);
  await expectNoViewportOverflow(page);
  await expectNoSeriousA11yViolations(page);

  expect(metadata.android.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(metadata.android.certificateSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(metadata.android.sourceCommit).toMatch(/^[a-f0-9]{40}$/);

  const apkResponse = await request.get(metadata.android.url);
  expect(apkResponse.status()).toBe(200);
  expect(apkResponse.headers()['content-type']).toContain('application/vnd.android.package-archive');
  const apk = await apkResponse.body();
  expect(apk.byteLength).toBe(metadata.android.bytes);
  expect(createHash('sha256').update(apk).digest('hex')).toBe(metadata.android.sha256);

  const missing = await request.get('/downloads/not-a-release.apk');
  expect(missing.status()).toBe(404);
  expect(await missing.text()).not.toContain('<!doctype html>');
});

test('the deployed marketing page is static, honest and mobile-usable', async ({ page }) => {
  let locationRequests = 0;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition() { throw new Error('marketing requested location'); },
        watchPosition() { throw new Error('marketing watched location'); },
        clearWatch() {},
      },
    });
  });
  page.on('pageerror', (error) => {
    if (/marketing (requested|watched) location/.test(error.message)) locationRequests += 1;
  });

  await page.goto('/about.html');
  await expect(page.getByRole('heading', { name: 'Journeys without one gatekeeper' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Request a ride' })).toHaveAttribute('href', '/request');
  await expect(page.getByRole('heading', { name: 'Direct mode' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Managed mode' })).toBeVisible();
  await expectNoViewportOverflow(page);
  await expectNoSeriousA11yViolations(page);
  expect(locationRequests).toBe(0);
});
