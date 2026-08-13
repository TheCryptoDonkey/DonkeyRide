import { expect, test } from '@playwright/test';
import {
  expectNoSeriousA11yViolations,
  expectNoViewportOverflow,
  installMapMocks,
  skipOnboarding,
} from './helpers';

test('a desktop user can inspect and validate an operator choice', async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'desktop-specific operator check');
  await installMapMocks(context);
  await skipOnboarding(context);

  await page.goto('/request/profile');
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await expect(page.getByText('Operator network')).toBeVisible();
  await expect(page.getByText('http://127.0.0.1:4178')).toBeVisible();

  const manual = page.getByRole('textbox', { name: 'Operator URL' });
  await manual.fill('http://rides.example');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText('Enter an HTTPS operator URL.')).toBeVisible();

  await expectNoViewportOverflow(page);
  await expectNoSeriousA11yViolations(page);
});
