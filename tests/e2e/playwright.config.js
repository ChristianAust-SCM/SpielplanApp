// Playwright-Konfiguration für die LOKALE Staging-Umgebung (scripts/staging.sh).
// Kein Test spricht Produktion an: baseURL ist immer 127.0.0.1.
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: /.*\.spec\.js/,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.STAGING_FRONTEND || 'http://127.0.0.1:55380',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit-mobil', use: { ...devices['iPhone 13'] } },
  ],
});
