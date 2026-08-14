import { expect, test } from '@playwright/test';
import { expectEasyTap, expectNoSeriousA11yViolations, expectNoViewportOverflow } from './helpers';

const sha256 = 'a'.repeat(64);
const certificateSha256 = 'b'.repeat(64);

test('the driver download is usable on a phone and never falls back to HTML for a missing APK', async ({ page, request }) => {
  const apiRequests: string[] = [];
  page.on('request', (outgoing) => {
    if (new URL(outgoing.url()).pathname.startsWith('/api/')) apiRequests.push(outgoing.url());
  });
  await page.route('**/downloads/driver-app.json', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        schemaVersion: 1,
        android: {
          available: true,
          version: '1.0.3',
          versionCode: 4,
          url: `/downloads/donkeyride-driver-1.0.3.apk?sha256=${sha256.slice(0, 16)}`,
          filename: 'donkeyride-driver-1.0.3.apk',
          bytes: 6_600_000,
          sha256,
          certificateSha256,
          sourceCommit: 'c'.repeat(40),
        },
        webApp: '/provide',
      }),
    });
  });

  await page.goto('/download.html');
  await expect(page.getByRole('heading', { name: 'DonkeyRide Driver for Android' })).toBeVisible();
  const download = page.getByRole('link', { name: 'Download APK · v1.0.3' });
  await expect(download).toHaveAttribute('href', `/downloads/donkeyride-driver-1.0.3.apk?sha256=${sha256.slice(0, 16)}`);
  await expectEasyTap(page, download);
  await expect(page.getByText(sha256)).toBeVisible();
  await expect(page.getByText(certificateSha256)).toBeVisible();
  await expect(page.getByText(/Force-stopping the app also ends the live shift/)).toBeVisible();
  await expectNoViewportOverflow(page);
  await expectNoSeriousA11yViolations(page);
  expect(apiRequests).toEqual([]);

  const missing = await request.get('/downloads/does-not-exist.apk');
  expect(missing.status()).toBe(404);
  expect(missing.headers()['content-type']).toContain('application/vnd.android.package-archive');
  expect(await missing.text()).not.toContain('<!doctype html>');
});

test('the download page offers the PWA honestly when no Android artifact is published', async ({ page }) => {
  await page.route('**/downloads/driver-app.json', (route) => route.fulfill({ status: 404 }));
  await page.goto('/download.html');
  await expect(page.getByRole('status')).toContainText('not currently published');
  await expect(page.getByRole('link', { name: 'driver PWA' })).toHaveAttribute('href', '/provide');
  await expect(page.getByRole('link', { name: /Download APK/ })).toHaveCount(0);
});

test('the public about page explains both operating modes without requesting location', async ({ page }) => {
  let locationRequests = 0;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition() { throw new Error('about page requested location'); },
        watchPosition() { throw new Error('about page watched location'); },
        clearWatch() {},
      },
    });
  });
  page.on('pageerror', (error) => {
    if (/about page (requested|watched) location/.test(error.message)) locationRequests += 1;
  });

  await page.goto('/about.html');
  await expect(page.getByRole('heading', { name: 'Journeys without one gatekeeper' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Request a ride' })).toHaveAttribute('href', '/request');
  await expect(page.getByRole('link', { name: 'Drive or provide' })).toHaveAttribute('href', '/provide');
  await expect(page.getByRole('heading', { name: 'Direct mode' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Managed mode' })).toBeVisible();
  await expect(page.getByText(/Relays see network metadata/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Help keep the work independent' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'GitHub Sponsors' })).toHaveAttribute('href', 'https://github.com/sponsors/TheCryptoDonkey');
  await expect(page.getByRole('link', { name: 'nsec-tree' })).toHaveAttribute('href', 'https://github.com/forgesworn/nsec-tree');
  await expectNoViewportOverflow(page);
  await expectNoSeriousA11yViolations(page);
  expect(locationRequests).toBe(0);
});
