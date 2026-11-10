// Abnahme NEUES Frontend gegen den ECHTEN lokalen Supabase-Stack (Migrationen 01–05, Stufe "neu",
// bzw. zusätzlich 09, Stufe "09"). Nur synthetische Daten (supabase/tests/_seed.sql).
const { test, expect } = require('@playwright/test');

const STUFE = process.env.STAGING_STUFE || '';
const API = process.env.STAGING_API_URL;
const KEY = process.env.STAGING_ANON_KEY;
const PASSWORT = 'staging-lokal-1';
const TOK_T1 = 'altlink-termin1-aaaaaaaaaaaaaaaa';
const TOK_A1 = 'altlink-alternativ1-dddddddddddd';
const S = (n) => `00000000-0000-4000-d000-0000000000${n}`;

test.skip(!['neu', '09'].includes(STUFE), 'Datei gilt für Stufen neu und 09');
if (!API || !API.startsWith('http://127.0.0.1')) throw new Error('Nur gegen lokalen Stack (STAGING_API_URL)');

// Isolation: Browser darf Produktion nie ansprechen; WhatsApp wird nur abgefangen.
let produktiv = [];
let waUrls = [];
// WhatsApp-Aufruf auslösen und den übergebenen Text zurückgeben (wa.me wird abgefangen, nie geöffnet)
async function waText(page, klick) {
  const vorher = waUrls.length;
  await klick();
  await expect.poll(() => waUrls.length, { timeout: 10000 }).toBeGreaterThan(vorher);
  const url = waUrls[waUrls.length - 1];
  expect(url).toMatch(/wa\.me|whatsapp/);
  return decodeURIComponent(new URL(url).searchParams.get('text') || '');
}
test.beforeEach(async ({ page, context }, info) => {
  produktiv = [];
  page.on('request', (r) => {
    const h = new URL(r.url()).hostname;
    if (h.endsWith('supabase.co') || h.endsWith('christianaust.eu')) produktiv.push(h);
  });
  waUrls = [];
  await context.route(/wa\.me|whatsapp\.com/, (r) => { waUrls.push(r.request().url()); r.abort(); });
  await context.route(/supabase\.co|christianaust\.eu/, (r) => r.abort());
  page.on('dialog', (d) => d.accept());   // confirm()/alert() wie ein Nutzer bestätigen
  if (info.project.name === 'chromium-desktop') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  }
});
test.afterEach(() => expect(produktiv, 'keine Anfrage an Produktion').toEqual([]));

async function anmelden(page, email) {
  // vorhandene Sitzung verwerfen (login.html leitet sonst direkt weiter) – wie ein Nutzerwechsel
  await page.goto('/spieler.html');
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} });
  await page.goto('/login.html');
  await page.fill('#email', email);
  await page.fill('#passwort', PASSWORT);
  await page.click('#btn-login');
  await page.waitForURL(/index\.html/);
  await expect(page.locator('#tabs .tab').first()).toBeVisible();
  await geladen(page);
}
async function geladen(page) {   // Daten geladen und Kennzahlen gerendert
  await expect(page.locator('#stat-gesamt')).toHaveText(/^\d+$/);
  await expect(page.locator('#table-container .loading-dot')).toHaveCount(0);
}
async function waehleMannschaft(page, name) {
  await page.locator('#tabs .tab', { hasText: name }).click();
  await expect(page.locator('#tabs .tab.active')).toContainText(name);
  await geladen(page);
}
function zeile(page, gegner) {
  return page.locator('#table-container tbody tr', { hasText: gegner });
}
async function antworten(page, token, spielerId, antwort) {
  await page.goto('/spieler.html?token=' + token);
  await expect(page.locator('#spieler-select')).toBeVisible();
  await page.selectOption('#spieler-select', spielerId);
  await page.click(`.antwort-btn[data-val="${antwort}"]`);
  await page.click('#btn-senden');
  await expect(page.locator('.success-box')).toContainText(antwort);
}
async function rest(pfad, jwt) {
  return fetch(`${API}/rest/v1/${pfad}`, { headers: { apikey: KEY, Authorization: `Bearer ${jwt || KEY}` } });
}

test.describe.serial(`Neues Frontend · Abnahme · Stufe ${STUFE}`, () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'chromium-desktop', 'zustandsändernde Abnahme einmal'));

  test('MF-Login: genau die eigene Mannschaft, Mindeststärke 6', async ({ page }) => {
    await anmelden(page, 'mf1@test.invalid');
    await expect(page.locator('#tabs .tab')).toHaveCount(1);
    await expect(page.locator('#tabs .tab').first()).toContainText('1. Mannschaft');
    await expect(zeile(page, 'TSV Testhausen')).toBeVisible();
    await expect(page.locator('[for-stat="ok"]')).toContainText('≥6');
    await expect(page.locator('#runde-umschalter')).toContainText('Rückrunde');
    await expect(page.locator('#runde-umschalter')).not.toContainText('importieren');   // nur Admin
  });

  test('Spielerabfrage ohne Login: Ja / Vielleicht / Nein', async ({ page }) => {
    await antworten(page, TOK_T1, S(13), 'Ja');
    await antworten(page, TOK_T1, S(14), 'Vielleicht');
    await antworten(page, TOK_T1, S(15), 'Nein');
    // Spieler einer anderen Mannschaft ist über diesen Link nicht auswählbar
    await page.goto('/spieler.html?token=' + TOK_T1);
    await expect(page.locator(`#spieler-select option[value="${S(21)}"]`)).toHaveCount(0);
    await expect(page.locator(`#spieler-select option[value="${S(17)}"]`)).toHaveCount(0);  // inaktiv
  });

  test('Rückmeldungen im Leitstand inkl. Erinnerung per WhatsApp', async ({ page, context }) => {
    test.skip(STUFE !== 'neu', 'Ausgangslage mit fehlender Antwort nur im ersten Durchlauf');
    await anmelden(page, 'mf1@test.invalid');
    await zeile(page, 'TSV Testhausen').locator('td').nth(4).locator('button').click();
    const modal = page.locator('.sp-modal');
    await expect(modal).toContainText('Noch keine Antwort (1)');                    // nur Zoe fehlt
    await expect(modal.locator('div', { hasText: 'Gina Gamma' }).last()).toContainText('Ja');
    await expect(modal.locator('div', { hasText: 'Dirk Delta' }).last()).toContainText('Vielleicht');
    await expect(modal.locator('div', { hasText: 'Eva Epsilon' }).last()).toContainText('Nein');
    const text = await waText(page, () => modal.locator('button', { hasText: /WhatsApp|Erinnerung/ }).click());
    expect(text).toContain('Zoe');
    expect(text).toContain('spieler.html?token=' + TOK_T1);
  });

  test('Verfügbarkeitsampel und Mindeststärke: 3 Ja → zu wenig, 6 Ja → spielbereit', async ({ page }) => {
    await anmelden(page, 'mf1@test.invalid');
    const okVorher = Number(await page.locator('#stat-ok').textContent());
    const kritVorher = Number(await page.locator('#stat-krit').textContent());
    // alle sechs aktiven Spieler auf Ja (Anna wurde ggf. im Kompatibilitätslauf geändert)
    for (const n of ['11', '12', '14', '15', '16']) await antworten(page, TOK_T1, S(n), 'Ja');
    await anmelden(page, 'mf1@test.invalid');
    // vorher 2 Ja (unter 6-2) → "zu wenig"; jetzt 6 Ja → "spielbereit"
    await expect(page.locator('#stat-ok')).toHaveText(String(okVorher + 1));
    if (STUFE === 'neu') await expect(page.locator('#stat-krit')).toHaveText(String(kritVorher - 1));
    await expect(zeile(page, 'TSV Testhausen').locator('td').nth(4)).toContainText('alle');
  });

  test('WhatsApp-Abfragelink des Termins', async ({ page, context }) => {
    await anmelden(page, 'mf1@test.invalid');
    const text = await waText(page, () => zeile(page, 'TSV Testhausen').locator('button[aria-label="WhatsApp"]').click());
    expect(text).toContain('TSV Testhausen');
    expect(text).toContain('http://127.0.0.1:55381/spieler.html?token=' + TOK_T1);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  });

  test('Aufstellung: genau Mindeststärke, Speichern über Serverfunktion', async ({ page }) => {
    await anmelden(page, 'mf1@test.invalid');
    await zeile(page, 'TSV Testhausen').locator('button[aria-label="Aufstellung"]').click();
    const modal = page.locator('.sp-modal');
    const boxen = modal.locator('.auf-check:not(.auf-check-ersatz)');
    for (let i = 0; i < await boxen.count(); i++) await boxen.nth(i).uncheck();
    for (let i = 0; i < 6; i++) await boxen.nth(i).check();
    await modal.locator('#auf-save').click();
    await expect(modal).toHaveCount(0);
    await expect(zeile(page, 'TSV Testhausen')).toContainText('Aufstellung');
    await anmelden(page, 'mf1@test.invalid');                                      // nach Neuladen noch da
    await expect(zeile(page, 'TSV Testhausen')).toContainText('Aufstellung');
  });

  test('Alternativtermin: MF legt an, Spieler stimmt ab, Admin bestätigt die Verlegung', async ({ page, context }) => {
    // MF der 2. Mannschaft
    await anmelden(page, 'mf2@test.invalid');
    await zeile(page, 'SC Probedorf').locator('button[aria-label="Alternativtermin"]').first().click();
    const modal = page.locator('.sp-modal');
    const neu = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
    await modal.locator('#alt-datum').fill(neu);
    await modal.locator('#alt-uhrzeit').fill('19:00');
    await modal.locator('button', { hasText: 'Termin hinzufügen' }).click();
    await expect(modal.locator('#alt-liste')).toContainText('Alternative');
    const text = await waText(page, () => modal.locator('button', { hasText: 'WhatsApp-Link kopieren' }).last().click());
    const altToken = (text.match(/spieler\.html\?alt=([A-Za-z0-9_-]+)/) || [])[1];
    expect(altToken, 'Alternativ-Link im WhatsApp-Text').toBeTruthy();
    await modal.locator('button', { hasText: /Verschiebungsbedarf beim Admin melden|zurückziehen/ }).click();

    // Spieler stimmt über den Alternativ-Link ab
    await page.goto('/spieler.html?alt=' + altToken);
    await expect(page.locator('#spiel-titel')).toContainText('Ausweichtermin');
    await page.selectOption('#spieler-select', S(21));
    await page.click('.antwort-btn[data-val="Ja"]');
    await page.click('#btn-senden');
    await expect(page.locator('.success-box')).toBeVisible();

    // Admin bestätigt
    await anmelden(page, 'admin@test.invalid');
    await waehleMannschaft(page, '2. Mannschaft');
    await zeile(page, 'SC Probedorf').locator('button[aria-label="Alternativtermin"]').first().click();
    const am = page.locator('.sp-modal');
    await expect(am).toContainText('1 Ja');
    await am.locator('button', { hasText: 'Diesen Termin als neuen Spieltermin bestätigen' }).last().click();
    await expect(page.locator('.sp-modal')).toHaveCount(0);
    const z = zeile(page, 'SC Probedorf');
    await expect(z).toContainText(new Date(neu).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }));
  });

  test('Bestehender Alternativtermin-Link (Altbestand) funktioniert', async ({ page }) => {
    await page.goto('/spieler.html?alt=' + TOK_A1);
    await expect(page.locator('#spiel-titel')).toContainText('Ausweichtermin');
    await page.selectOption('#spieler-select', S(11));
    await page.click('.antwort-btn[data-val="Vielleicht"]');
    await page.click('#btn-senden');
    await expect(page.locator('.success-box')).toContainText('Vielleicht');
  });

  test('Admin: Mindeststärke 3. Mannschaft = 4, alle Mannschaften sichtbar', async ({ page }) => {
    await anmelden(page, 'admin@test.invalid');
    await expect(page.locator('#tabs .tab:not(.tab-turnier)')).toHaveCount(3);
    await waehleMannschaft(page, '3. Mannschaft');
    await expect(page.locator('[for-stat="ok"]')).toContainText('≥4');
    await waehleMannschaft(page, '1. Mannschaft');
    await expect(page.locator('[for-stat="ok"]')).toContainText('≥6');
  });

  test('Exporte: Verfügbarkeit und Einsatzplan als PDF und Excel', async ({ page }) => {
    await anmelden(page, 'mf1@test.invalid');
    for (const [abschnitt, typ] of [[0, 'PDF'], [0, 'Excel'], [1, 'PDF'], [1, 'Excel']]) {
      await page.click('#btn-export');
      const gruppe = page.locator('#export-menu-overlay .exp-gruppe').nth(abschnitt);
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }),
        gruppe.locator('button', { hasText: typ }).click()]);
      expect(dl.suggestedFilename()).toMatch(typ === 'PDF' ? /\.pdf$/ : /\.xlsx$/);
      const pfad = await dl.path();
      expect(require('fs').statSync(pfad).size).toBeGreaterThan(1000);
    }
  });

  test('Rückrunde: CSV-Import mit Vorschau, Speichern und Dublettenerkennung', async ({ page }) => {
    const csv = 'Mannschaft;Datum;Uhrzeit;Heim/Auswärts;Gegner;Ort;Spieltag\n' +
      '1. Mannschaft;16.01.2027;18:30;H;Synthetik Gegner A;;10\n' +
      '3. Mannschaft;23.01.2027;14:00;A;Synthetik Gegner B;;11\n';
    await anmelden(page, 'admin@test.invalid');
    const importieren = async () => {
      await page.locator('#runde-umschalter button', { hasText: 'importieren' }).click();
      await page.setInputFiles('#import-datei', { name: 'rueckrunde.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
      await page.locator('.sp-modal button', { hasText: 'Prüfen' }).click();
      return page.locator('#import-vorschau');
    };
    let v = await importieren();
    if (STUFE === 'neu') {
      await expect(v).toContainText('2 Zeilen · 2 gültig · 0 mit Fehlern');
      await v.locator('button', { hasText: 'Termine jetzt importieren' }).click();
      await expect(page.locator('.sp-modal')).toHaveCount(0);
      await page.locator('#runde-umschalter button', { hasText: 'Rückrunde' }).click();
      await waehleMannschaft(page, '1. Mannschaft');
      await expect(zeile(page, 'Synthetik Gegner A')).toBeVisible();
      v = await importieren();
    }
    // zweiter Import derselben Datei: als Dublette erkannt, nichts gespeichert
    await expect(v).toContainText('mit Fehlern');
    await expect(v).toContainText('Termin existiert bereits (Dublette)');
    await expect(v.locator('button', { hasText: 'Termine jetzt importieren' })).toHaveCount(0);
  });

  test('Neuer Termin aus dem Import erhält serverseitig einen Abfragelink', async ({ page, context }) => {
    await anmelden(page, 'mf1@test.invalid');
    await page.locator('#runde-umschalter button', { hasText: 'Rückrunde' }).click();
    const text = await waText(page, () => zeile(page, 'Synthetik Gegner A').locator('button[aria-label="WhatsApp"]').click());
    const tok = (text.match(/spieler\.html\?token=([A-Za-z0-9_-]+)/) || [])[1];
    expect(tok && tok.length).toBeGreaterThanOrEqual(32);
    await antworten(page, tok, S(11), 'Ja');
  });

  test('SR-Platzhalter und anonymer Tabellenzugriff', async () => {
    const sr = await rest('sr_platzhalter?select=id');
    expect(sr.status).toBe(200);                                                    // SR unberührt
    const ttr = await rest('spieler?select=name,ttr');
    expect([401, 403]).toContain(ttr.status);                                       // TTR nie anonym
    const sp = await rest('spieler?select=id,name');
    if (STUFE === '09') expect([401, 403]).toContain(sp.status);                     // anon ohne Tabellen
    else expect(sp.status).toBe(200);                                               // Übergangsphase (Altseite)
  });
});

test.describe('Smartphone-Darstellung', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'webkit-mobil', 'nur iPhone-Profil'));

  test('Spielerseite ohne horizontales Scrollen, Antwort möglich', async ({ page }) => {
    await page.goto('/spieler.html?token=' + TOK_T1);
    await expect(page.locator('#spieler-select')).toBeVisible();
    const breit = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(breit).toBeLessThanOrEqual(1);
    const btn = await page.locator('.antwort-btn').first().boundingBox();
    expect(btn.height).toBeGreaterThanOrEqual(40);                                  // Touch-Ziel
    await page.selectOption('#spieler-select', S(16));
    await page.click('.antwort-btn[data-val="Ja"]');
    await page.click('#btn-senden');
    await expect(page.locator('.success-box')).toBeVisible();
  });

  test('Leitstand: Tabelle scrollt im eigenen Container, Seite nicht', async ({ page }) => {
    await anmelden(page, 'mf1@test.invalid');
    const breit = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
    expect(breit).toBeLessThanOrEqual(1);
    await expect(page.locator('.table-scroll')).toBeVisible();
    await expect(page.locator('#stat-gesamt')).toBeVisible();
  });
});
