'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const SPS = require('../js/sicherheit.js');

test('esc entschärft HTML- und Attribut-Sonderzeichen', () => {
  assert.equal(SPS.esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(SPS.esc('"\'`&'), '&quot;&#39;&#96;&amp;');
  assert.equal(SPS.esc(null), '');
  assert.equal(SPS.esc(undefined), '');
  assert.equal(SPS.esc(1480), '1480');
});

test('istUuid akzeptiert nur UUIDs', () => {
  assert.ok(SPS.istUuid('00000000-0000-4000-a000-0000000000a1'));
  assert.ok(!SPS.istUuid("x'); alert(1); ('"));
  assert.ok(!SPS.istUuid(''));
  assert.ok(!SPS.istUuid(null));
});

test('istGueltigesToken entspricht der Serverprüfung', () => {
  assert.ok(SPS.istGueltigesToken('a'.repeat(32)));
  assert.ok(SPS.istGueltigesToken('altlink-termin1-aaaaaaaaaaaaaaaa'));
  assert.ok(!SPS.istGueltigesToken('kurz'));
  assert.ok(!SPS.istGueltigesToken("' or 1=1 --aaaaaaaaaaaaaa"));
  assert.ok(!SPS.istGueltigesToken('a'.repeat(129)));
});

test('anzeigeName dreht "Nachname, Vorname"', () => {
  assert.equal(SPS.anzeigeName('Alpha, Anna'), 'Anna Alpha');
  assert.equal(SPS.anzeigeName('Anna Alpha'), 'Anna Alpha');
  assert.equal(SPS.anzeigeName(null), '');
});

test('fehlerText liefert verständliche Meldungen ohne Technikdetails', () => {
  assert.equal(SPS.fehlerText({ code: 'P0001', message: 'Ungültige Antwort.' }), 'Ungültige Antwort.');
  assert.equal(SPS.fehlerText({ code: '42501', message: 'permission denied for table spieler' }), 'Keine Berechtigung für diese Aktion.');
  assert.equal(SPS.fehlerText({ code: '23505', message: 'duplicate key value violates unique constraint "x"' }), 'Dieser Eintrag existiert bereits.');
  assert.match(SPS.fehlerText({ message: 'TypeError: Failed to fetch' }), /Keine Verbindung/);
  assert.match(SPS.fehlerText({ code: 'PGRST202', message: 'Could not find the function' }), /noch nicht verfügbar/);
  const intern = SPS.fehlerText({ code: 'XX000', message: 'select abfrage_token from spieltermine' });
  assert.ok(!/abfrage_token|select/.test(intern), 'keine SQL-/Token-Details');
});

test('lokalesDatum parst ohne UTC-Versatz', () => {
  const d = SPS.lokalesDatum('2027-01-16');
  assert.equal(d.getFullYear(), 2027);
  assert.equal(d.getMonth(), 0);
  assert.equal(d.getDate(), 16);
  assert.equal(SPS.lokalesDatum('kaputt'), null);
});
