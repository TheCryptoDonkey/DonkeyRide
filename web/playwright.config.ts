import { defineConfig, devices } from '@playwright/test';

const HTTP_PORT = 4178;
const WS_PORT = 4179;
const baseURL = `http://127.0.0.1:${HTTP_PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    geolocation: { latitude: 53.4808, longitude: -2.2426 },
    permissions: ['geolocation', 'notifications'],
    locale: 'en-GB',
    colorScheme: 'light',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: `VITE_WS_URL=ws://127.0.0.1:${WS_PORT} npm run build && cd .. && `
      + `PORT=${HTTP_PORT} WS_PORT=${WS_PORT} NODE_ENV=test PAYMENT_PROVIDER=cash `
      + 'DISABLE_REDIS=true ENABLE_NIP98_AUTH=true ENABLE_RATE_LIMITING=false '
      + 'NOSTR_RELAY= PUBLIC_RELAY_URLS= REPUTATION_RELAYS= node server.js',
    url: `${baseURL}/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
