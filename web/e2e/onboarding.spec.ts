import { expect, test } from '@playwright/test';
import {
  expectEasyTap,
  expectNoSeriousA11yViolations,
  expectNoViewportOverflow,
  installMapMocks,
} from './helpers';

test('a first-time rider gets one obvious accessible action', async ({ context, page }) => {
  await installMapMocks(context);
  await page.goto('/request');

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'A ride in seconds — no sign-up' })).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('main')).toHaveCount(0);
  await expect(page.locator(':focus')).toHaveRole('button', { name: "Let's go" });
  await expectNoSeriousA11yViolations(page);

  const letsGo = dialog.getByRole('button', { name: "Let's go" });
  await expect(dialog.getByRole('button')).toHaveCount(1);
  await expectEasyTap(page, letsGo);
  await expectNoViewportOverflow(page);
  await letsGo.click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
});

test('a first-time driver cannot tab into a hidden shift screen', async ({ context, page }) => {
  await installMapMocks(context);
  await page.goto('/provide');

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Go online, pick your jobs' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go Online' })).toHaveCount(0);

  await dialog.getByRole('button', { name: "Let's go" }).click();
  await expect(page.getByRole('button', { name: 'Go Online' })).toBeVisible();
});
