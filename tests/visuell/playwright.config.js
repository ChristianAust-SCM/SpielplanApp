// Visuelle Prüfung der Design-Ansichten – NUR gegen die lokale Staging-Umgebung.
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: __dirname,
  testMatch: /ansichten\.spec\.js/,
  workers: 1,
  retries: 0,
  timeout: 60000,
  reporter: [['list']],
  use: { baseURL: process.env.STAGING_FRONTEND || 'http://127.0.0.1:55381', locale: 'de-DE', timezoneId: 'Europe/Berlin' },
});
