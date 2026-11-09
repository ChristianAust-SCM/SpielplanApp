'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { seiteLaden, warten, supabaseMock } = require('./hilfen-dom.js');

const TOKEN = 'altlink-termin1-aaaaaaaaaaaaaaaa';
const XSS = '<img src=x onerror="window.__xss=1">';

function ladeDaten(extra = {}) {
  return {
    data: Object.assign({
      persoenlich: false,
      nachmeldung_erlaubt: true,
      termin: { datum: '2027-01-16', uhrzeit: '18:30:00', heim: true, gegner: 'SV ' + XSS, ort: null, status: 'Geplant' },
      alternativtermin: null,
      mannschaft: { name: '1. Mannschaft', liga: 'Liga ' + XSS },
      spieler: [
        { id: '00000000-0000-4000-d000-000000000011', name: 'Alpha, Anna' },
        { id: '00000000-0000-4000-d000-000000000012', name: XSS + ', Böse' }
      ]
    }, extra),
    error: null
  };
}

test('Spielerseite lädt über RPC und rendert Daten nur als Text', async () => {
  const mock = supabaseMock({ rpc: { abfrage_laden: ladeDaten() } });
  const { window, document, storageZugriffe } = seiteLaden('spieler.html', { url: 'https://x.test/spieler.html?token=' + TOKEN, mock });
  await warten();
  assert.deepEqual(mock.aufrufe.filter(a => a.art === 'rpc').map(a => [a.name, a.args.p_token]), [['abfrage_laden', TOKEN]]);
  assert.equal(mock.aufrufe.filter(a => a.art === 'from').length, 0, 'kein direkter Tabellenzugriff');
  assert.equal(document.querySelectorAll('img').length, 0, 'kein eingeschleustes Element');
  assert.equal(window.__xss, undefined);
  assert.match(document.getElementById('spiel-titel').textContent, /Heimspiel gegen SV <img/);
  const opts = Array.from(document.querySelectorAll('#spieler-select option')).map(o => o.textContent);
  assert.deepEqual(opts, ['– bitte auswählen –', 'Anna Alpha', 'Böse ' + XSS]);
  assert.deepEqual(storageZugriffe, [], 'Token/Daten nicht im Browser-Storage');
  assert.equal(document.querySelector('meta[name=referrer]').content, 'no-referrer');
});

test('Antwort wird mit Token und Spieler-ID an die Serverfunktion gesendet', async () => {
  const mock = supabaseMock({ rpc: { abfrage_laden: ladeDaten(), abfrage_antworten: { data: { ok: true }, error: null } } });
  const { document } = seiteLaden('spieler.html', { url: 'https://x.test/spieler.html?token=' + TOKEN, mock });
  await warten();
  const sel = document.getElementById('spieler-select');
  sel.value = '00000000-0000-4000-d000-000000000012';
  sel.dispatchEvent(new document.defaultView.Event('change'));
  document.querySelector('.antwort-btn[data-val="Vielleicht"]').click();
  document.getElementById('anmerkung').value = 'ab 15 Uhr';
  assert.equal(document.getElementById('btn-senden').disabled, false);
  document.getElementById('btn-senden').click();
  await warten();
  const r = mock.aufrufe.find(a => a.name === 'abfrage_antworten');
  assert.deepEqual({ ...r.args }, { p_token: TOKEN, p_spieler_id: '00000000-0000-4000-d000-000000000012', p_antwort: 'Vielleicht', p_anmerkung: 'ab 15 Uhr' });
  assert.match(document.querySelector('.success-box h2').textContent, /^Danke, Böse/);
  assert.equal(document.querySelectorAll('img').length, 0);
});

test('Nachmeldung nutzt eigene Serverfunktion', async () => {
  const mock = supabaseMock({ rpc: { abfrage_laden: ladeDaten(), abfrage_nachmelden: { data: { ok: true }, error: null } } });
  const { document } = seiteLaden('spieler.html', { url: 'https://x.test/spieler.html?token=' + TOKEN, mock });
  await warten();
  document.getElementById('nicht-kader').click();
  const f = document.getElementById('freitext');
  f.value = 'Neu, Nina';
  f.dispatchEvent(new document.defaultView.Event('input'));
  document.querySelector('.antwort-btn[data-val="Ja"]').click();
  document.getElementById('btn-senden').click();
  await warten();
  const r = mock.aufrufe.find(a => a.name === 'abfrage_nachmelden');
  assert.equal(r.args.p_name, 'Neu, Nina');
  assert.equal(r.args.p_antwort, 'Ja');
});

test('Persönlicher Link: nur eigener Name, bisherige Antwort vorbelegt, keine Nachmeldung', async () => {
  const mock = supabaseMock({ rpc: { abfrage_laden: ladeDaten({
    persoenlich: true, nachmeldung_erlaubt: false,
    spieler: [{ id: '00000000-0000-4000-d000-000000000011', name: 'Alpha, Anna' }],
    eigene_antwort: { antwort: 'Nein', anmerkung: 'Urlaub' }
  }) } });
  const { document } = seiteLaden('spieler.html', { url: 'https://x.test/spieler.html?token=' + 'p'.repeat(64), mock });
  await warten();
  assert.equal(document.querySelectorAll('#spieler-select option').length, 1);
  assert.equal(document.getElementById('nicht-kader'), null);
  assert.ok(document.querySelector('.antwort-btn[data-val="Nein"]').classList.contains('sel-nein'));
  assert.equal(document.getElementById('anmerkung').value, 'Urlaub');
});

test('Ungültiges Token wird ohne Serveraufruf abgewiesen', async () => {
  const mock = supabaseMock();
  const { document } = seiteLaden('spieler.html', { url: 'https://x.test/spieler.html?token=%3Cscript%3E', mock });
  await warten();
  assert.equal(mock.aufrufe.length, 0);
  assert.match(document.querySelector('.error-msg').textContent, /Ungültiger Link/);
});

test('Serverfehler werden verständlich und escaped angezeigt', async () => {
  const mock = supabaseMock({ rpc: { abfrage_laden: { data: null, error: { code: 'P0001', message: 'Dieser Link ist ungültig oder abgelaufen. <b>x</b>' } } } });
  const { document } = seiteLaden('spieler.html', { url: 'https://x.test/spieler.html?alt=' + TOKEN, mock });
  await warten();
  assert.equal(document.querySelectorAll('b').length, 0);
  assert.match(document.querySelector('.error-msg').textContent, /ungültig oder abgelaufen/);
});
