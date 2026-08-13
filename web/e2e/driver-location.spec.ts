import { expect, test } from '@playwright/test';
import {
  expectEasyTap,
  expectNoViewportOverflow,
  installMapMocks,
  phoneViewport,
  skipOnboarding,
} from './helpers';

test('a driver without location is never put online at a placeholder', async ({ browser }, testInfo) => {
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
  try {
    await page.goto('/provide');
    await expect(page.getByText(/Location unavailable/)).toBeVisible();
    const goOnline = page.getByRole('button', { name: 'Go Online' });
    await expect(goOnline).toBeDisabled();
    await expectEasyTap(page, goOnline);
    await expect(page.locator('.btn-primary')).toHaveCount(1);
    await expect(page.getByText(/Heading somewhere/)).toHaveCount(0);
    await expect(page.getByText(/Driving on Android/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'You', exact: true })).toHaveCount(0);
    await expectNoViewportOverflow(page);
  } finally {
    await context.close();
  }
});
