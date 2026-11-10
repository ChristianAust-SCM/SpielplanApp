// ============================================================================
// Design-Ansichten (Premium) – echte Bildschirmaufnahmen + Prüfungen
// Daten: tests/visuell/seed_ansichten.sql (Vorrunde laut Vorlage, Spieler synthetisch)
// Aufruf: scripts/staging.sh ansichten
// ============================================================================
const { test, expect, devices } = require('@playwright/test');
const OUT = process.env.ANSICHT_AUSGABE || '/work/tests/visuell/bilder';
const TOKEN = process.env.ANSICHT_TOKEN || '';

async function schutz(context) {
  const fremd = [];
  await context.route(/supabase\.co|christianaust\.eu|wa\.me|whatsapp\.com|fonts\.googleapis|fonts\.gstatic/, (r) => { fremd.push(r.request().url()); r.abort(); });
  return fremd;
}
async function anmelden(page, email) {
  await page.goto('/spieler.html');
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
  await page.goto('/login.html');
  await page.fill('#email', email); await page.fill('#passwort', 'staging-lokal-1');
  await page.click('#btn-login'); await page.waitForURL(/index\.html/);
  await expect(page.locator('#stat-gesamt')).toHaveText(/^\d+$/, { timeout: 15000 });
  await expect(page.locator('#table-container .loading-dot')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}
async function keinQuerscrollen(page) {
  const b = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(b[0], 'Seite scrollt nicht horizontal').toBeLessThanOrEqual(b[1] + 1);
}

test('1 · Spielplanübersicht mit Verfügbarkeitsampel (Desktop)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const fremd = await schutz(context); const page = await context.newPage();
  await anmelden(page, 'admin@test.invalid');
  expect(await page.evaluate(() => document.fonts.check('600 16px Barlow'))).toBe(true);
  await expect(page.locator('#tabs .tab.active')).toContainText('1. Mannschaft');
  await expect(page.locator('#tabs .tab')).toHaveCount(3);
  await expect(page.locator('#runde-umschalter')).toContainText('Termine importieren');
  await expect(page.locator('#tabs .tab-turnier')).toHaveCount(0);
  await expect(page.locator('#table-container tbody tr')).toHaveCount(9);
  await expect(page.locator('#stat-gesamt')).toHaveText('9');
  await expect(page.locator('#stat-offen')).toHaveText('0');
  await expect(page.locator('#stat-krit')).toHaveText('1');
  await expect(page.locator('#stat-ok')).toHaveText('8');
  const krit = page.locator('tr.zeile-kritisch');
  await expect(krit).toHaveCount(1);
  await expect(krit).toContainText('TT Griesingen-Rißtissen (SG)');
  await expect(krit.locator('button[aria-label="Verlegung prüfen"]')).toBeVisible();
  await expect(page.locator('#section-meta')).toHaveText(/9 Spieltage\s+·\s+27\.09\.26 – 29\.11\.26/);
  await keinQuerscrollen(page);
  await page.screenshot({ path: `${OUT}/1_uebersicht.png`, fullPage: true });
  expect(fremd, 'keine externen Abrufe').toEqual([]);
  await context.close();
});

test('2 · Detailansicht eines kritischen Spiels (Desktop)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await schutz(context); const page = await context.newPage();
  await anmelden(page, 'mf1@test.invalid');
  const zeile = page.locator('#table-container tbody tr', { hasText: 'TT Griesingen-Rißtissen' });
  await zeile.locator('td').nth(4).locator('button').click();
  const modal = page.locator('.sp-modal');
  await expect(modal).toContainText('Kritisch – Verlegung prüfen');
  await expect(modal).toContainText('3 von mindestens 6 Zusagen');
  await expect(modal).toContainText('Noch keine Antwort (1)');
  await expect(modal).toContainText('Haben geantwortet (8)');
  await expect(modal).toContainText('Urlaub bis 12.10.');
  await expect(modal.locator('button', { hasText: 'Erinnerung per WhatsApp' })).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/2_detail_kritisch.png` });
  await context.close();
});

test('3 · Mobile Spielerabfrage ohne Login (iPhone 13)', async ({ playwright }) => {
  test.skip(!TOKEN, 'ANSICHT_TOKEN fehlt');
  const b = await playwright.webkit.launch();
  const context = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  const fremd = await schutz(context); const page = await context.newPage();
  await page.goto('/spieler.html?token=' + TOKEN);
  await expect(page.locator('#spiel-titel')).toHaveText('Auswärtsspiel gegen SSV Ulm 1846 III');
  await expect(page.locator('#spiel-kicker')).toContainText('1. Mannschaft · Bezirksoberliga');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('#spieler-select').selectOption({ label: 'Simon Braun' });
  await page.click('.antwort-btn[data-val="Ja"]');
  await expect(page.locator('#btn-senden')).toBeEnabled();
  for (const h of await page.locator('.antwort-btn').evaluateAll(els => els.map(e => e.getBoundingClientRect().height))) {
    expect(h, 'Antwortknöpfe gut antippbar').toBeGreaterThanOrEqual(48);
  }
  await keinQuerscrollen(page);
  await page.screenshot({ path: `${OUT}/3_spielerabfrage_mobil.png`, fullPage: true });
  await page.click('#btn-senden');
  await expect(page.locator('.success-box')).toContainText('Danke, Simon!');
  await page.screenshot({ path: `${OUT}/3b_spielerabfrage_bestaetigt.png`, fullPage: true });
  expect(fremd, 'keine externen Abrufe').toEqual([]);
  await b.close();
});

test('Zusatz · Spielplanübersicht auf dem Smartphone', async ({ playwright }) => {
  const b = await playwright.webkit.launch();
  const context = await b.newContext({ ...devices['iPhone 13'], locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  await schutz(context); const page = await context.newPage();
  await anmelden(page, 'mf1@test.invalid');
  await keinQuerscrollen(page);
  await page.screenshot({ path: `${OUT}/4_uebersicht_mobil.png`, fullPage: true });
  await b.close();
});
