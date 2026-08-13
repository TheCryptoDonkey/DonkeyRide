import AxeBuilder from '@axe-core/playwright';
import { expect, type BrowserContext, type Page } from '@playwright/test';

export const MANCHESTER = { latitude: 53.4808, longitude: -2.2426 };
export const OLD_TRAFFORD = { latitude: 53.4631, longitude: -2.2913 };

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/**
 * Keep the browser checks deterministic without replacing the operator API.
 * Only public map/geocoder dependencies are stubbed; task creation, auth,
 * dispatch, acceptance and every lifecycle transition use the real backend.
 */
export async function installMapMocks(context: BrowserContext): Promise<void> {
  await context.route('https://*.tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 204, body: '' }));

  await context.route('https://photon.komoot.io/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/reverse') {
      const lng = Number(url.searchParams.get('lon'));
      const oldTrafford = lng < -2.27;
      return route.fulfill(json({
        features: [{
          geometry: {
            coordinates: oldTrafford
              ? [OLD_TRAFFORD.longitude, OLD_TRAFFORD.latitude]
              : [MANCHESTER.longitude, MANCHESTER.latitude],
          },
          properties: oldTrafford
            ? { name: 'Old Trafford', street: 'Sir Matt Busby Way', city: 'Manchester', postcode: 'M16 0RA' }
            : { name: 'Manchester Piccadilly', street: 'Piccadilly Station', city: 'Manchester', postcode: 'M1 2DT' },
        }],
      }));
    }

    const pickupSearch = (url.searchParams.get('q') || '').toLowerCase().includes('piccadilly');
    const location = pickupSearch ? MANCHESTER : OLD_TRAFFORD;
    return route.fulfill(json({
      features: [{
        geometry: { coordinates: [location.longitude, location.latitude] },
        properties: pickupSearch
          ? {
            name: 'Manchester Piccadilly',
            street: 'Piccadilly Station',
            city: 'Manchester',
            postcode: 'M1 2DT',
            country: 'United Kingdom',
          }
          : {
            name: 'Old Trafford',
            street: 'Sir Matt Busby Way',
            city: 'Manchester',
            postcode: 'M16 0RA',
            country: 'United Kingdom',
          },
      }],
    }));
  });
}

export async function skipOnboarding(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    localStorage.setItem('donkeyride.onboarded.requester', '1');
    localStorage.setItem('donkeyride.onboarded.provider', '1');
  });
}

export async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = result.violations.filter((violation) =>
    violation.impact === 'serious' || violation.impact === 'critical');
  expect(serious, serious.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([]);
}

export async function expectNoViewportOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport + 1);
}

/** A first install is not an update and must not cover the app with a toast. */
export async function expectNoFirstInstallUpdateToast(page: Page): Promise<void> {
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) await navigator.serviceWorker.ready;
  });
  await expect(page.getByText('New version available, tap to refresh')).toHaveCount(0);
}

export async function expectFullyInViewport(page: Page, locator: ReturnType<Page['locator']>): Promise<void> {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box, 'expected the essential action to have a visible bounding box').not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
}
