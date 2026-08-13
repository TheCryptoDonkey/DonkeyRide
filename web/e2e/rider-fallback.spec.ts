import { expect, test } from '@playwright/test';
import {
  expectFullyInViewport,
  expectNamedFormControls,
  expectNoFirstInstallUpdateToast,
  expectNoSeriousA11yViolations,
  expectNoViewportOverflow,
  installMapMocks,
  phoneViewport,
  skipOnboarding,
} from './helpers';

test('location denial never turns the London map fallback into the rider', async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    viewport: phoneViewport(testInfo.project.name),
    locale: 'en-GB',
    colorScheme: 'light',
  });
  await installMapMocks(context);
  await skipOnboarding(context);
  await context.addInitScript(() => {
    const denied = {
      getCurrentPosition: (_ok: PositionCallback, fail?: PositionErrorCallback) =>
        fail?.({ code: 1, message: 'Location permission denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }),
      watchPosition: (_ok: PositionCallback, fail?: PositionErrorCallback) => {
        fail?.({ code: 1, message: 'Location permission denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
        return 1;
      },
      clearWatch: () => {},
    };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: denied });
  });

  const page = await context.newPage();
  const availabilityRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/providers/available')) availabilityRequests.push(request.url());
  });

  try {
    await page.goto('/request');
    await expectNoFirstInstallUpdateToast(page);
    await expect(page.getByText('Set your pickup')).toBeVisible();
    await expect(page.getByText('Your past rides')).toHaveCount(0);
    await expect(page.getByText('How it works')).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Preview another service' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'You', exact: true })).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(availabilityRequests).toEqual([]);

    await page.getByRole('button', { name: 'Change' }).click();
    await page.getByRole('textbox', { name: 'Pickup: search address or tap the map' }).fill('Manchester Piccadilly');
    await page.getByRole('button', { name: /Manchester Piccadilly.*United Kingdom/ }).click();
    await expect(page.getByText(/Manchester Piccadilly, Piccadilly Station/)).toBeVisible();

    await expect.poll(() => availabilityRequests.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(availabilityRequests.every((url) => !url.includes('lat=51.5074'))).toBe(true);

    const destination = page.getByRole('textbox', { name: 'Where to?' });
    await destination.fill('Old Trafford');
    await page.getByRole('button', { name: /Old Trafford.*United Kingdom/ }).click();
    await expect(page).toHaveURL(/\/request\/new$/);

    const requestButton = page.getByRole('button', { name: /Request driver/ });
    await expect(requestButton).toBeEnabled();
    await expectFullyInViewport(page, requestButton);
    await expectNamedFormControls(page);
    await expectNoViewportOverflow(page);
    await expectNoSeriousA11yViolations(page);
  } finally {
    await context.close();
  }
});
