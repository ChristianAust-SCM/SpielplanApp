// ============================================================================
// Desktop-Breiten: Spielplantabelle ohne Querscrollen, alle Aktionen sichtbar
// Aufruf: scripts/staging.sh ansichten (zusammen mit den Design-Ansichten)
// ============================================================================
const { test, expect } = require('@playwright/test');
const OUT = process.env.ANSICHT_AUSGABE || '/work/tests/visuell/bilder';
const BREITEN = [1024, 1280, 1366, 1440, 1536, 1920];

for (const breite of BREITEN) {
  test(`Spielplantabelle passt bei ${breite} px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: breite, height: 900 }, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
    await context.route(/supabase\.co|christianaust\.eu|wa\.me|whatsapp\.com/, r => r.abort());
    const page = await context.newPage();
    await page.goto('/login.html');
    await page.fill('#email', 'admin@test.invalid'); await page.fill('#passwort', 'staging-lokal-1');
    await page.click('#btn-login'); await page.waitForURL(/index\.html/);
    await expect(page.locator('#table-container tbody tr')).toHaveCount(9);
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate(() => {
      const sc = document.querySelector('.table-scroll');
      const r = sc.getBoundingClientRect();
      const knoepfe = Array.from(document.querySelectorAll('#table-container .aktionen > *')).map(b => b.getBoundingClientRect());
      return {
        tabelleUeber: sc.scrollWidth - sc.clientWidth,
        seiteUeber: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
        knopfRechts: Math.max(...knoepfe.map(k => k.right)),
        rahmenRechts: r.right,
        knoepfe: knoepfe.length
      };
    });
    expect(m.knoepfe).toBeGreaterThanOrEqual(36);
    expect(m.tabelleUeber, 'Tabelle scrollt nicht seitlich').toBeLessThanOrEqual(1);
    expect(m.seiteUeber, 'Seite scrollt nicht seitlich').toBeLessThanOrEqual(1);
    expect(m.knopfRechts, 'Aktionen vollständig sichtbar').toBeLessThanOrEqual(m.rahmenRechts + 0.5);
    if ([1024, 1280, 1366].includes(breite)) await page.screenshot({ path: `${OUT}/12_breite_${breite}.png`, fullPage: true });
    await context.close();
  });
}
