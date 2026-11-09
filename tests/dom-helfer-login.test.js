'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { seiteLaden, warten, supabaseMock } = require('./hilfen-dom.js');

test('Helferseite trägt über Serverfunktion ein und escaped den Namen', async () => {
  const mock = supabaseMock({ rpc: { helfer_eintragen: { data: { ok: true }, error: null } } });
  const { document, window } = seiteLaden('helfer.html', { mock });
  await warten();
  const name = document.getElementById('name');
  name.value = 'Max <b>Muster</b>';
  name.dispatchEvent(new window.Event('input'));
  document.querySelector('.opt[data-val="turnier"]').click();
  document.getElementById('btn').click();
  await warten();
  const r = mock.aufrufe.find(a => a.name === 'helfer_eintragen');
  assert.deepEqual({ ...r.args }, { p_name: 'Max <b>Muster</b>', p_einsatz: 'turnier', p_anmerkung: null });
  assert.equal(mock.aufrufe.filter(a => a.art === 'from').length, 0);
  assert.equal(document.querySelectorAll('b').length, 0);
  assert.match(document.querySelector('.msg h2').textContent, /Danke, Max <b>Muster<\/b>!/);
});

test('Helferseite zeigt Serverfehler verständlich', async () => {
  const mock = supabaseMock({ rpc: { helfer_eintragen: { data: null, error: { code: 'P0001', message: 'Bitte einen Einsatzbereich auswählen.' } } } });
  const { document, window } = seiteLaden('helfer.html', { mock });
  await warten();
  document.getElementById('name').value = 'Max';
  document.getElementById('name').dispatchEvent(new window.Event('input'));
  document.querySelector('.opt[data-val="aufbau"]').click();
  document.getElementById('btn').click();
  await warten();
  assert.match(document.getElementById('err').textContent, /Einsatzbereich/);
});

test('Login-Seite escaped Fehlermeldungen und nutzt zentrale Konfiguration', async () => {
  const mock = supabaseMock();
  mock.auth.signInWithPassword = () => Promise.resolve({ error: { message: 'Invalid login credentials' } });
  const { document, window } = seiteLaden('login.html', { mock });
  await warten();
  document.getElementById('email').value = 'a@test.invalid';
  document.getElementById('passwort').value = 'x';
  await window.anmelden();
  assert.match(document.getElementById('error-box').textContent, /E-Mail oder Passwort falsch/);
});
