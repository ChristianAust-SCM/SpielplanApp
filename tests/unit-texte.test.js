'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/texte.js');

const basis = { heim: true, gegner: 'TSV Test', datumLang: 'Samstag, 16.01.2027', uhrzeit: '18:30 Uhr',
                link: 'https://spielplanapp.christianaust.eu/spieler.html?token=abc', mfName: 'Erika Muster' };

test('Abfragetext enthält Spiel, Datum, Link und MF-Vorname', () => {
  const t = T.abfrageText(basis);
  assert.match(t, /Heimspiel gegen TSV Test/);
  assert.match(t, /Samstag, 16\.01\.2027 · 18:30 Uhr/);
  assert.match(t, /👉 https:\/\/spielplanapp\.christianaust\.eu\/spieler\.html\?token=abc/);
  assert.match(t, /– Erika$/);
});

test('Ausweich- und Erinnerungstext', () => {
  assert.match(T.ausweichText({ ...basis, heim: false }), /Ausweichtermin[\s\S]*Auswärtsspiel gegen TSV Test/);
  assert.match(T.erinnerungText({ ...basis, namen: ['Anna', 'Ben'] }), /^Hallo Anna, Ben,/);
  assert.equal(T.mfVorname(''), 'Euer MF');
});

test('WhatsApp-URL ist vollständig kodiert (auch Sonderzeichen im Gegnernamen)', () => {
  const t = T.abfrageText({ ...basis, gegner: "SC O'Brien & Söhne" });
  const u = T.whatsappUrl(t);
  assert.ok(u.startsWith('https://wa.me/?text='));
  assert.equal(decodeURIComponent(u.slice('https://wa.me/?text='.length)), t);
  assert.ok(!/[\s&#]/.test(u.slice(20)), 'keine Leerzeichen, & oder # unkodiert');
});
