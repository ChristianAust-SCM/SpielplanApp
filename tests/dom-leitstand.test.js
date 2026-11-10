'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { seiteLaden, warten, supabaseMock } = require('./hilfen-dom.js');

const XSS = '<img src=x onerror="window.__xss=1">';
const M1 = '00000000-0000-4000-c000-000000000001';
const T_VR = '00000000-0000-4000-e000-000000000001';
const T_RR = '00000000-0000-4000-e000-000000000002';
const S = n => '00000000-0000-4000-d000-0000000000' + String(n).padStart(2, '0');

function fixtures(rolle) {
  return {
    nutzer_rollen: [{ mannschaft_id: M1, rolle, mannschaften: { id: M1, name: '1. Mannschaft', liga: 'Liga ' + XSS, mf_name: 'Erika ' + XSS, min_spieler: 4 } }],
    spieltermine: [
      { id: T_VR, mannschaft_id: M1, datum: '2026-11-21', uhrzeit: '14:30:00', heim: true, gegner: "O'Brien " + XSS, halbrunde: 'Vorrunde', status: 'Geplant', abfrage_token: 'tok-vr-aaaaaaaaaaaaaaaa', saison: '2026/27' },
      { id: T_RR, mannschaft_id: M1, datum: '2027-01-16', uhrzeit: '18:30:00', heim: false, gegner: 'Rückrundengegner', halbrunde: 'Rückrunde', status: 'Geplant', abfrage_token: 'tok-rr-bbbbbbbbbbbbbbbb', saison: '2026/27' }
    ],
    spieler: [11, 12, 13, 14, 15].map(n => ({ id: S(n), mannschaft_id: M1, name: (n === 12 ? XSS : 'Spieler') + ', Nr' + n, ttr: 1400 + n, aktiv: true, position: n - 10 })),
    verfuegbarkeiten: [
      { id: 'v1', spieltermin_id: T_VR, alternativtermin_id: null, spieler_id: S(11), antwort: 'Ja', anmerkung: 'Notiz ' + XSS },
      { id: 'v2', spieltermin_id: T_VR, alternativtermin_id: null, spieler_id: S(12), antwort: 'Ja', anmerkung: null },
      { id: 'v3', spieltermin_id: T_VR, alternativtermin_id: null, spieler_id: S(13), antwort: 'Ja', anmerkung: null },
      { id: 'v4', spieltermin_id: T_VR, alternativtermin_id: null, spieler_id: S(14), antwort: 'Ja', anmerkung: null }
    ],
    alternativtermine: [],
    aufstellungen: []
  };
}

async function leitstand(rolle = 'mf', rpc = {}, quelltext) {
  const mock = supabaseMock({
    tabellen: fixtures(rolle), rpc,
    session: { user: { id: '00000000-0000-4000-a000-0000000000b1', email: 'mf' + XSS + '@test.invalid' } }
  });
  const seite = seiteLaden('index.html', {
    mock, quelltext,
    vorbereiten(w) {
      w.navigator.clipboard = { writeText: (t) => { w.__zwischenablage = t; return Promise.resolve(); } };
    }
  });
  await warten(20);
  return { mock, ...seite };
}

test('Leitstand rendert Datenbankwerte ausschließlich als Text', async () => {
  const { document, window } = await leitstand();
  assert.equal(document.querySelectorAll('img').length, 0, 'kein eingeschleustes Element');
  assert.equal(window.__xss, undefined);
  assert.match(document.querySelector('.spielplan-table tbody').textContent, /O'Brien <img/);
  assert.match(document.getElementById('header-status').textContent, /mf<img/);
});

test('Es werden nur ausdrücklich benötigte Spalten abgefragt', async () => {
  const { mock } = await leitstand();
  const selects = mock.aufrufe.filter(a => a.m === 'select').map(a => a.args[0]);
  assert.ok(selects.length >= 5);
  selects.forEach(s => assert.ok(!/(^|[\s,(])\*/.test(s), 'kein select(*): ' + s));
  const termSel = mock.aufrufe.find(a => a.tabelle === 'spieltermine' && a.m === 'select').args[0];
  assert.match(termSel, /halbrunde/);
  assert.ok(!/mf_email/.test(mock.aufrufe.find(a => a.tabelle === 'nutzer_rollen' && a.m === 'select').args[0]));
});

test('Mindestspielerzahl der Mannschaft wird verwendet (hier 4)', async () => {
  const { document } = await leitstand();
  assert.equal(document.getElementById('stat-ok').textContent, '1');
  assert.match(document.querySelector('[for-stat="ok"]').textContent, /≥4/);
});

test('Umschalten Vorrunde/Rückrunde filtert ohne Daten zu verlieren', async () => {
  const { document, window } = await leitstand();
  const tabelle = () => document.querySelector('#table-container').textContent;
  window.setzeHalbrunde('Vorrunde');
  assert.match(tabelle(), /O'Brien/);
  assert.ok(!/Rückrundengegner/.test(tabelle()));
  assert.match(document.getElementById('section-title').textContent, /Vorrunde 2026\/27/);
  window.setzeHalbrunde('Rückrunde');
  assert.match(tabelle(), /Rückrundengegner/);
  assert.ok(!/O'Brien/.test(tabelle()));
  assert.equal(document.getElementById('stat-gesamt').textContent, '1');
  window.setzeHalbrunde('Vorrunde');
  assert.match(tabelle(), /O'Brien/);
});

test('WhatsApp: Text mit Sonderzeichen wird korrekt übergeben (nicht im onclick)', async () => {
  const { document, window } = await leitstand();
  window.setzeHalbrunde('Vorrunde');
  const btn = document.querySelector('button[aria-label="WhatsApp"]');
  assert.ok(!/O'Brien|Brien/.test(btn.getAttribute('onclick')), 'kein Freitext im onclick');
  btn.click();
  await warten();
  assert.match(window.__zwischenablage, /Heimspiel gegen O'Brien <img/);
  assert.match(window.__zwischenablage, /spieler\.html\?token=tok-vr-aaaaaaaaaaaaaaaa/);
  assert.ok(window.__geoeffnet[0].startsWith('https://wa.me/?text='));
});

test('Rückmeldungen zeigen Anmerkungen escaped', async () => {
  const { document, window } = await leitstand();
  window.setzeHalbrunde('Vorrunde');
  window.zeigeFehlende(T_VR, null);
  const modal = document.querySelector('.sp-modal');
  assert.match(modal.textContent, /Notiz <img/);
  assert.match(modal.textContent, /Noch keine Antwort \(1\)/);
  assert.equal(document.querySelectorAll('img').length, 0);
});

test('Aufstellung wird über die transaktionale Serverfunktion gespeichert', async () => {
  const { document, window, mock } = await leitstand('mf', { aufstellung_speichern: { data: { ok: true }, error: null } });
  window.setzeHalbrunde('Vorrunde');
  window.zeigeAufstellung(T_VR);
  const checks = Array.from(document.querySelectorAll('.sp-modal .auf-check'));
  assert.equal(checks.length, 4, 'nur Ja/Vielleicht-Spieler');
  checks.forEach(c => { c.checked = true; c.dispatchEvent(new window.Event('change')); });
  await window.speichereAufstellung(T_VR, document.getElementById('auf-save'));
  const r = mock.aufrufe.find(a => a.name === 'aufstellung_speichern');
  assert.equal(r.args.p_spieltermin_id, T_VR);
  assert.equal(r.args.p_spieler_ids.length, 4);
  assert.equal(mock.aufrufe.filter(a => a.tabelle === 'aufstellungen' && (a.m === 'delete' || a.m === 'insert')).length, 0);
});

test('Verschiebung durch Admin über eine Serverfunktion', async () => {
  const { window, mock } = await leitstand('admin', { verschiebung_abschliessen: { data: { ok: true }, error: null } });
  window.document.body.insertAdjacentHTML('beforeend', '<input id="admin-datum" value="2026-12-05"><input id="admin-uhrzeit" value="15:00">');
  await window.bestaetigeEigenerTermin(T_VR);
  const r = mock.aufrufe.find(a => a.name === 'verschiebung_abschliessen');
  assert.deepEqual({ ...r.args }, { p_spieltermin_id: T_VR, p_datum: '2026-12-05', p_uhrzeit: '15:00', p_alternativtermin_id: null });
  assert.equal(mock.aufrufe.filter(a => a.tabelle === 'verfuegbarkeiten' && a.m === 'delete').length, 0);
});

test('Admin sieht Importfunktion, MF nicht', async () => {
  const mf = await leitstand('mf');
  assert.ok(!/Termine importieren/.test(mf.document.getElementById('runde-umschalter').textContent));
  const admin = await leitstand('admin');
  assert.match(admin.document.getElementById('runde-umschalter').textContent, /Termine importieren/);
});

test('Turnier-Helfer-Reiter ist standardmäßig ausgeblendet, auch für Admins', async () => {
  for (const rolle of ['admin', 'mf']) {
    const { document, mock } = await leitstand(rolle);
    assert.equal(document.querySelectorAll('#tabs .tab-turnier').length, 0, rolle + ': kein Turnier-Reiter');
    assert.equal(mock.aufrufe.filter(a => a.tabelle === 'turnier_helfer').length, 0, rolle + ': keine Helferdaten geladen');
  }
});

test('Turnier-Helfer lässt sich per Konfiguration reaktivieren (nur Admin)', async () => {
  const an = (src, code) => src === 'js/config.js' ? code.replace('TURNIER_HELFER_ANZEIGEN: false', 'TURNIER_HELFER_ANZEIGEN: true') : code;
  const admin = await leitstand('admin', {}, an);
  const tab = admin.document.querySelector('#tabs .tab-turnier');
  assert.ok(tab, 'Admin sieht den Reiter nach Reaktivierung');
  tab.click();
  await warten(20);
  assert.ok(admin.mock.aufrufe.some(a => a.tabelle === 'turnier_helfer' && a.m === 'select'), 'Helferübersicht lädt');
  const mf = await leitstand('mf', {}, an);
  assert.equal(mf.document.querySelectorAll('#tabs .tab-turnier').length, 0, 'MF sieht ihn weiterhin nicht');
});

test('Datenbankfehler werden verständlich angezeigt statt leerer Tabelle', async () => {
  const mock = supabaseMock({
    tabellen: { ...fixtures('mf'), spieltermine: () => ({ data: null, error: { code: '42501', message: 'permission denied for table spieltermine' } }) },
    session: { user: { id: 'u', email: 'x@test.invalid' } }
  });
  const { document } = seiteLaden('index.html', { mock });
  await warten(20);
  assert.match(document.getElementById('table-container').textContent, /Keine Berechtigung für diese Aktion/);
});
