import { expect, test } from '@playwright/test';
import {
  expectNamedFormControls,
  expectNoSeriousA11yViolations,
  expectNoViewportOverflow,
  installMapMocks,
  skipOnboarding,
} from './helpers';

test('a phone user can inspect and validate an operator choice', async ({ context, page }) => {
  await installMapMocks(context);
  await skipOnboarding(context);

  await page.goto('/request/profile');
  const currentOrigin = await page.evaluate(() => window.location.origin);
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Preview another service' })).toBeVisible();
  await expect(page.getByText('Operator network')).toBeVisible();
  await expect(page.getByText(currentOrigin)).toBeVisible();
  await expect(page.getByText('0% operator fee').first()).toBeVisible();
  const selectedOperator = page.getByRole('button', { name: /Selected/ });
  await expect(selectedOperator).toContainText('admission');
  await expect(selectedOperator).toContainText('records');

  const manual = page.getByRole('textbox', { name: 'Operator URL' });
  await manual.fill('http://rides.example');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText('Enter an HTTPS operator URL.')).toBeVisible();

  await expectNamedFormControls(page);
  await expectNoViewportOverflow(page);
  await expectNoSeriousA11yViolations(page);
});
