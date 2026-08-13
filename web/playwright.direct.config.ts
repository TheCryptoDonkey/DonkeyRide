import { defineConfig, devices } from '@playwright/test';

const port = 4180;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/direct-*.spec.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL,
    locale: 'en-GB',
    colorScheme: 'light',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{
    name: 'direct-mobile-chromium',
    use: {
      ...devices['Pixel 7'],
      viewport: { width: 390, height: 844 },
    },
  }],
  webServer: {
    command: 'VITE_COORDINATION_MODE=direct VITE_NOSTR_RELAYS=wss://relay.test '
      + 'VITE_PUBLIC_ROUTING_URL=/routing npm run build && '
      + `STATIC_PWA_PORT=${port} node e2e/static-server.mjs`,
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
