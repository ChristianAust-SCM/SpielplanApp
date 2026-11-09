'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/rueckrunde.js');

const MANNSCHAFTEN = [
  { id: '00000000-0000-4000-c000-000000000001', name: '1. Mannschaft' },
  { id: '00000000-0000-4000-c000-000000000002', name: '2. Mannschaft' },
  { id: '00000000-0000-4000-c000-000000000003', name: '3. Mannschaft' }
];
const HEUTE = new Date(2026, 10, 9);
const KOPF = 'Mannschaft;Datum;Uhrzeit;Heim/Auswärts;Gegner;Ort;Spieltag\n';

test('Saison wechselt zum 1. Juli', () => {
  assert.equal(R.saisonVon('2026-09-20'), '2026/27');
  assert.equal(R.saisonVon('2027-04-30'), '2026/27');
  assert.equal(R.saisonVon('2027-07-01'), '2027/28');
  assert.equal(R.saisonVon('1999-12-31'), '1999/00');
});

test('Standard-Halbrunde nach Monat', () => {
  assert.equal(R.standardHalbrunde(new Date(2026, 10, 9)), 'Vorrunde');
  assert.equal(R.standardHalbrunde(new Date(2027, 0, 10)), 'Rückrunde');
  assert.equal(R.aktuelleSaison(new Date(2027, 0, 10)), '2026/27');
});

test('Filter erhält Vorrunde, trennt Halbrunden und Saisons', () => {
  const t = [
    { id: 1, datum: '2026-09-20', halbrunde: 'Vorrunde' },
    { id: 2, datum: '2027-01-16', halbrunde: 'Rückrunde' },
    { id: 3, datum: '2027-09-18', halbrunde: 'Vorrunde' },
    { id: 4, datum: '2026-10-01', halbrunde: null }
  ];
  assert.deepEqual(R.filterTermine(t, 'Vorrunde', '2026/27').map(x => x.id), [1, 4]);
  assert.deepEqual(R.filterTermine(t, 'Rückrunde', '2026/27').map(x => x.id), [2]);
  assert.deepEqual(R.filterTermine(t, 'Vorrunde', '2027/28').map(x => x.id), [3]);
});

test('CSV-Parser: Semikolon, Komma, Anführungszeichen, BOM, CRLF', () => {
  const a = R.parseCsv('﻿a;b;c\r\n"x;y";"sag ""hi""";\r\n');
  assert.equal(a.trenner, ';');
  assert.deepEqual(a.zeilen, [['a', 'b', 'c'], ['x;y', 'sag "hi"', '']]);
  const b = R.parseCsv('a,b\n1,2');
  assert.equal(b.trenner, ',');
  assert.deepEqual(b.zeilen, [['a', 'b'], ['1', '2']]);
});

test('Normalisierung von Datum, Uhrzeit, Heim/Auswärts', () => {
  assert.equal(R.normDatum('16.01.2027'), '2027-01-16');
  assert.equal(R.normDatum('6.1.27'), '2027-01-06');
  assert.equal(R.normDatum('2027-01-16'), '2027-01-16');
  assert.equal(R.normDatum('30.02.2027'), null);
  assert.equal(R.normDatum('2027/01/16'), null);
  assert.equal(R.normUhrzeit('9:30'), '09:30');
  assert.equal(R.normUhrzeit('18.30 Uhr'), '18:30');
  assert.equal(R.normUhrzeit(''), '');
  assert.equal(R.normUhrzeit('25:00'), null);
  assert.equal(R.normHeim('H'), true);
  assert.equal(R.normHeim('Auswärts'), false);
  assert.equal(R.normHeim('vielleicht'), null);
});

test('Mannschaft per Name oder Nummer, eindeutig', () => {
  assert.equal(R.mannschaftFinden('2. Mannschaft', MANNSCHAFTEN).id, MANNSCHAFTEN[1].id);
  assert.equal(R.mannschaftFinden('3', MANNSCHAFTEN).id, MANNSCHAFTEN[2].id);
  assert.equal(R.mannschaftFinden('Damen', MANNSCHAFTEN), null);
});

test('Gültiger Import: Vorschau ok, Nutzlast für Server', () => {
  const csv = KOPF +
    '1. Mannschaft;16.01.2027;18:30;H;SV Synthetisch;Halle Nord;10\n' +
    '2;17.01.2027;;A;TTC Erfunden;;\n';
  const e = R.pruefeImport(csv, { mannschaften: MANNSCHAFTEN, halbrunde: 'Rückrunde', heute: HEUTE });
  assert.equal(e.ok, true);
  assert.equal(e.gueltig, 2);
  const z = R.rpcZeilen(e);
  assert.deepEqual(z[0], { mannschaft_id: MANNSCHAFTEN[0].id, datum: '2027-01-16', uhrzeit: '18:30', heim: true,
    gegner: 'SV Synthetisch', ort: 'Halle Nord', halbrunde: 'Rückrunde', spieltag_nr: '10' });
  assert.equal(z[1].heim, false);
  assert.equal(z[1].uhrzeit, '');
});

test('Fehlerhafte Zeilen werden mit Zeilennummer gemeldet', () => {
  const csv = KOPF +
    'Damen;16.01.2027;18:30;H;SV X;;\n' +
    '1;30.02.2027;18:30;H;SV Y;;\n' +
    '1;20.01.2027;25:61;?;<script>;;99\n';
  const e = R.pruefeImport(csv, { mannschaften: MANNSCHAFTEN, heute: HEUTE });
  assert.equal(e.ok, false);
  assert.equal(e.gueltig, 0);
  assert.equal(e.zeilen[0].nr, 2);
  assert.match(e.zeilen[0].fehler.join(), /Mannschaft unbekannt/);
  assert.match(e.zeilen[1].fehler.join(), /Ungültiges Datum/);
  const f3 = e.zeilen[2].fehler.join('|');
  assert.match(f3, /Ungültige Uhrzeit/);
  assert.match(f3, /Heim\/Auswärts unklar/);
  assert.match(f3, /unzulässige Zeichen/);
  assert.match(f3, /Spieltagsnummer/);
});

test('Dubletten in der Datei und gegen bestehende Termine', () => {
  const csv = KOPF +
    '1;16.01.2027;18:30;H;SV Synthetisch;;\n' +
    '1;16.01.2027;18:30;H;sv synthetisch;;\n' +
    '1;20.09.2026;14:30;H;SC Bestand;;\n';
  const e = R.pruefeImport(csv, {
    mannschaften: MANNSCHAFTEN, heute: HEUTE,
    bestehend: [{ mannschaft_id: MANNSCHAFTEN[0].id, datum: '2026-09-20', gegner: 'SC Bestand' }]
  });
  assert.equal(e.zeilen[0].fehler.length, 0);
  assert.match(e.zeilen[1].fehler.join(), /Doppelte Zeile \(wie Zeile 2\)/);
  assert.match(e.zeilen[2].fehler.join(), /Dublette/);
  assert.match(e.zeilen[2].warnungen.join(), /Vergangenheit/);
});

test('Pflichtspalten und Leerdatei', () => {
  assert.match(R.pruefeImport('', { mannschaften: MANNSCHAFTEN }).fehlerGesamt[0], /keine Termine/);
  const e = R.pruefeImport('Mannschaft;Datum\n1;16.01.2027\n', { mannschaften: MANNSCHAFTEN });
  assert.ok(e.fehlerGesamt.some(f => /heim/.test(f)));
  assert.ok(e.fehlerGesamt.some(f => /gegner/.test(f)));
});

test('CSV-Vorlage ist selbst gültig', () => {
  const e = R.pruefeImport(R.CSV_VORLAGE, { mannschaften: MANNSCHAFTEN, heute: HEUTE });
  assert.equal(e.ok, true);
});
