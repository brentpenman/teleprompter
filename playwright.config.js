import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3456',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx serve -l 3456 -s .',
    port: 3456,
    reuseExistingServer: true,
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-iphone',
      use: {
        ...devices['iPhone 14'],
        // Use Chromium instead of WebKit to avoid needing WebKit install
        browserName: 'chromium',
      },
    },
    {
      name: 'mobile-android',
      use: {
        ...devices['Pixel 7'],
        browserName: 'chromium',
      },
    },
  ],
});
