import { expect, test, type BrowserContext, type BrowserContextOptions } from '@playwright/test';
import {
  MANCHESTER,
  expectFullyInViewport,
  expectNoFirstInstallUpdateToast,
  expectNoViewportOverflow,
  installMapMocks,
  skipOnboarding,
} from './helpers';

async function prepare(context: BrowserContext): Promise<void> {
  await installMapMocks(context);
  await skipOnboarding(context);
}

test('a rider and driver can complete a real mobile journey', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'the complete two-person journey is the mobile gate');

  const options: BrowserContextOptions = {
    viewport: { width: 390, height: 844 },
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

  try {
    await driver.goto('/provide');
    await expectNoFirstInstallUpdateToast(driver);
    const goOnline = driver.getByRole('button', { name: 'Go Online' });
    await expect(goOnline).toBeEnabled();
    await expectFullyInViewport(driver, goOnline);
    await goOnline.click();
    await expect(driver.getByRole('button', { name: 'Go Offline' })).toBeVisible();
    await expect(driver.getByText('Listening for ride requests...')).toBeVisible({ timeout: 15_000 });

    await rider.goto('/request');
    await expectNoFirstInstallUpdateToast(rider);
    await expect(rider.getByText(/Current location.*Manchester Piccadilly/)).toBeVisible();
    await rider.getByRole('textbox', { name: 'Where to?' }).fill('Old Trafford');
    await rider.getByRole('button', { name: /Old Trafford.*United Kingdom/ }).click();
    await expect(rider).toHaveURL(/\/request\/new$/);

    const requestRide = rider.getByRole('button', { name: /Request driver/ });
    await expect(requestRide).toBeEnabled();
    await expectFullyInViewport(rider, requestRide);
    await requestRide.click();
    await expect(rider).toHaveURL(/\/request\/active$/);

    await expect(driver).toHaveURL(/\/provide\/incoming$/, { timeout: 15_000 });
    await expect(driver.getByText(/New rider ride/)).toBeVisible();
    await driver.getByRole('button', { name: 'Accept' }).click();
    await expect(driver).toHaveURL(/\/provide\/active$/);

    await driver.getByRole('button', { name: "I'm here" }).click();
    await expect(driver.getByRole('button', { name: 'Start' })).toBeVisible();
    await driver.getByRole('button', { name: 'Start' }).click();
    await expect(driver.getByRole('button', { name: 'Finish' })).toBeVisible();
    await driver.getByRole('button', { name: 'Finish' }).click();

    await expect(driver).toHaveURL(/\/provide\/complete$/);
    await expect(driver.getByText('Ride Complete')).toBeVisible();
    await expect(rider).toHaveURL(/\/request\/complete$/, { timeout: 15_000 });
    await expect(rider.getByText('Ride Complete')).toBeVisible();
    await expectNoViewportOverflow(rider);
    await expectNoViewportOverflow(driver);
  } finally {
    await Promise.all([riderContext.close(), driverContext.close()]);
  }
});
