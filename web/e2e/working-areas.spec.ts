import { expect, test } from '@playwright/test';
import {
  expectEasyTap,
  expectNoSeriousA11yViolations,
  expectNoViewportOverflow,
  installMapMocks,
  phoneViewport,
  skipOnboarding,
} from './helpers';

test('a driver can draw and save a working area without location access', async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    viewport: phoneViewport(testInfo.project.name),
    locale: 'en-GB',
    colorScheme: 'light',
  });
  await installMapMocks(context);
  await skipOnboarding(context);

  const page = await context.newPage();
  try {
    await page.goto('/provide/areas');
    await expect(page.getByText('Tap the map to outline where you want to work')).toBeVisible();

    const map = page.getByRole('region', { name: 'Map' });
    const box = await map.boundingBox();
    expect(box).not.toBeNull();

    await map.click({ position: { x: box!.width * 0.30, y: box!.height * 0.35 } });
    await map.click({ position: { x: box!.width * 0.68, y: box!.height * 0.38 } });
    await map.click({ position: { x: box!.width * 0.48, y: box!.height * 0.70 } });
    await expect(page.getByText('3 points — need at least 3')).toBeVisible();

    const save = page.getByRole('button', { name: 'Save Area' });
    await expect(save).toBeEnabled();
    await expectEasyTap(page, save);
    await save.click();

    await expect(page.getByText('Area 1', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible();
    await expectNoViewportOverflow(page);
    await expectNoSeriousA11yViolations(page);
  } finally {
    await context.close();
  }
});
