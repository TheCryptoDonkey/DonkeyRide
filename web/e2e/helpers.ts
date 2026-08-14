import AxeBuilder from '@axe-core/playwright';
import { expect, type BrowserContext, type Page } from '@playwright/test';

export const MANCHESTER = { latitude: 53.4808, longitude: -2.2426 };
export const OLD_TRAFFORD = { latitude: 53.4631, longitude: -2.2913 };
export const ETIHAD_STADIUM = { latitude: 53.4831, longitude: -2.2004 };

export function phoneViewport(projectName: string): { width: number; height: number } {
  return projectName === 'small-mobile-chromium'
    ? { width: 360, height: 640 }
    : { width: 390, height: 844 };
}

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

    const query = (url.searchParams.get('q') || '').toLowerCase();
    const pickupSearch = query.includes('piccadilly');
    const stopSearch = query.includes('etihad');
    const location = pickupSearch ? MANCHESTER : stopSearch ? ETIHAD_STADIUM : OLD_TRAFFORD;
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
          : stopSearch
            ? {
              name: 'Etihad Stadium',
              street: 'Ashton New Road',
              city: 'Manchester',
              postcode: 'M11 3FF',
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

  // Blind-mode routing is browser → Valhalla. Keep it synthetic and prove
  // the UI uses a road-router response rather than a point-to-point guess.
  await context.route('**/routing/route', async (route) => {
    const body = route.request().postDataJSON() as { locations?: unknown[] };
    const legs = Math.max(1, (body.locations?.length || 2) - 1);
    await route.fulfill(json({
      trip: {
        summary: { length: 4.75, time: 1050 },
        legs: Array.from({ length: legs }, () => ({ shape: 'mve_eBd~zgCbA}PNcF' })),
      },
    }));
  });
}

export async function skipOnboarding(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    // Init scripts also run in the initial opaque about:blank document,
    // where storage access is forbidden. They run again on the app origin.
    try {
      localStorage.setItem('donkeyride.onboarded.requester', '1');
      localStorage.setItem('donkeyride.onboarded.provider', '1');
    } catch { /* opaque origin */ }
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

export async function expectNamedFormControls(page: Page): Promise<void> {
  const unnamed = await page.locator('input, select, textarea').evaluateAll((controls) =>
    controls
      .filter((control) => !control.getAttribute('id') && !control.getAttribute('name'))
      .map((control) => control.outerHTML)
  );
  expect(unnamed).toEqual([]);
}

/** A first install is not an update and must not cover the app with a toast. */
export async function expectNoFirstInstallUpdateToast(page: Page): Promise<void> {
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) await navigator.serviceWorker.ready;
  });
  await expect(page.getByText('New version available, tap to refresh')).toHaveCount(0);
}

export async function expectFullyInViewport(page: Page, locator: ReturnType<Page['locator']>): Promise<void> {
  // State-changing actions replace one primary control with the next after
  // the signed API response arrives. Wait for that human-visible state before
  // measuring it; boundingBox() alone returns null immediately instead of
  // retrying like Playwright's web-first assertions do.
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box, 'expected the essential action to have a visible bounding box').not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
}

export async function expectEasyTap(page: Page, locator: ReturnType<Page['locator']>): Promise<void> {
  await expectFullyInViewport(page, locator);
  const box = await locator.boundingBox();
  expect(box!.width, 'essential action should be easy to tap').toBeGreaterThanOrEqual(44);
  expect(box!.height, 'essential action should be easy to tap').toBeGreaterThanOrEqual(44);
}
