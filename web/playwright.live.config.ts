import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/live-production.spec.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 1,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.LIVE_PWA_URL || 'https://ride.trotters.dev',
    locale: 'en-GB',
    colorScheme: 'light',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{
    name: 'live-mobile-chromium',
    use: {
      ...devices['Pixel 7'],
      viewport: { width: 390, height: 844 },
    },
  }],
});
