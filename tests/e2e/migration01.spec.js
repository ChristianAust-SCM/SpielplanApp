// Smoke-Tests altes Frontend (main) gegen den ECHTEN lokalen Supabase-Stack.
// STAGING_STUFE=ist  → Ausgangszustand (Lücke nachweisbar)
// STAGING_STUFE=01   → nach Migration 01 (Lücke zu, Funktionen unverändert)
// Nur synthetische Konten aus supabase/tests/_seed.sql + staging/seed_staging.sql.
const { test, expect } = require('@playwright/test');

const STUFE = process.env.STAGING_STUFE || 'ist';
const API = process.env.STAGING_API_URL;
const KEY = process.env.STAGING_ANON_KEY;
const PASSWORT = 'staging-lokal-1';
const M1 = '00000000-0000-4000-c000-000000000001';
const M2 = '00000000-0000-4000-c000-000000000002';
const OHNE = '00000000-0000-4000-a000-0000000000c1';
const MF1 = '00000000-0000-4000-a000-0000000000b1';

test.skip(!['ist', '01'].includes(STUFE), 'Datei gilt für Stufen ist und 01');
if (!API || !API.startsWith('http://127.0.0.1')) throw new Error('Nur gegen lokalen Stack (STAGING_API_URL)');

async function anmelden(page, email) {
  await page.goto('/login.html');
  await page.fill('#email', email);
  await page.fill('#passwort', PASSWORT);
  await page.click('#btn-login');
  await page.waitForURL(/index\.html/);
  await expect(page.locator('#tabs .tab').first()).toBeVisible();
}

async function token(email) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORT }),
  });
  expect(r.ok).toBeTruthy();
  return (await r.json()).access_token;
}
function rest(pfad, jwt, init = {}) {
  return fetch(`${API}/rest/v1/${pfad}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json',
               Prefer: 'return=representation', ...(init.headers || {}) },
  });
}

// Isolation: jeder Datenzugriff des Browsers muss an den lokalen Stack gehen.
let produktivAnfragen = [];
test.beforeEach(async ({ page }) => {
  produktivAnfragen = [];
  page.on('request', (req) => {
    const host = new URL(req.url()).hostname;
    if (host.endsWith('supabase.co') || host.endsWith('christianaust.eu')) produktivAnfragen.push(host);
  });
  await page.route(/supabase\.co|christianaust\.eu/, (route) => route.abort());
});
test.afterEach(() => {
  expect(produktivAnfragen, 'Browser darf Produktion nie ansprechen').toEqual([]);
});

test.describe(`Altes Frontend · Stufe ${STUFE}`, () => {
  test('MF-Anmeldung zeigt genau die eigene Mannschaft', async ({ page }) => {
    await anmelden(page, 'mf1@test.invalid');
    await expect(page.locator('#tabs .tab')).toHaveCount(1);
    await expect(page.locator('#tabs .tab').first()).toContainText('1. Mannschaft');
  });

  test('Admin-Anmeldung zeigt Admin-Funktionen', async ({ page }) => {
    await anmelden(page, 'admin@test.invalid');
    await expect(page.locator('#tabs .tab-turnier')).toBeVisible();
  });

  test('Spieler antwortet ohne Login über bestehenden Link', async ({ page }) => {
    await page.goto('/spieler.html?token=altlink-termin1-aaaaaaaaaaaaaaaa');
    await expect(page.locator('#spieler-select')).toBeVisible();
    await page.locator('#spieler-select').selectOption({ index: 1 });
    await page.click('.antwort-btn[data-val="Vielleicht"]');
    await page.click('#btn-senden');
    await expect(page.locator('.success-box')).toBeVisible();
  });

  test('Selbstvergabe von Adminrechten über die echte REST-API', async ({}, info) => {
    test.skip(info.project.name !== 'chromium-desktop', 'REST-Prüfung nur einmal');
    const jwt = await token('ohnerolle@test.invalid');
    const r = await rest('nutzer_rollen', jwt, {
      method: 'POST', body: JSON.stringify({ user_id: OHNE, mannschaft_id: M2, rolle: 'admin' }) });
    if (STUFE === 'ist') {
      expect(r.status).toBe(201);                        // Lücke nachgewiesen
      const d = await rest(`nutzer_rollen?user_id=eq.${OHNE}`, jwt, { method: 'DELETE' });
      expect(d.ok).toBeTruthy();                         // aufräumen
    } else {
      expect(r.status).toBe(403);                        // RLS verweigert
    }
  });

  test('MF kann eigene Rolle nicht hochstufen (Stufe 01)', async ({}, info) => {
    test.skip(STUFE !== '01' || info.project.name !== 'chromium-desktop');
    const jwt = await token('mf1@test.invalid');
    const r = await rest(`nutzer_rollen?user_id=eq.${MF1}`, jwt, {
      method: 'PATCH', body: JSON.stringify({ rolle: 'admin', mannschaft_id: M2 }) });
    expect(await r.json()).toEqual([]);                  // keine Zeile geändert
    const l = await rest(`nutzer_rollen?select=rolle,mannschaft_id&user_id=eq.${MF1}`, jwt);
    expect(await l.json()).toEqual([{ rolle: 'mf', mannschaft_id: M1 }]);
  });

  test('SR-Platzhalter: anon liest und schreibt wie vorher', async ({}, info) => {
    test.skip(info.project.name !== 'chromium-desktop', 'REST-Prüfung nur einmal');
    const anon = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
    const l = await fetch(`${API}/rest/v1/sr_platzhalter?select=id`, { headers: anon });
    expect(l.status).toBe(200);
    const i = await fetch(`${API}/rest/v1/sr_platzhalter`, {
      method: 'POST', headers: anon, body: JSON.stringify({ wert: `smoke-${STUFE}` }) });
    expect(i.status).toBe(201);
  });
});
