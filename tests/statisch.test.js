'use strict';
// Statische Sicherheitsprüfungen über den gesamten Quellcode
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');

const lies = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const HTML = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
const JS = ['app.js', 'export.js', ...fs.readdirSync(path.join(ROOT, 'js')).map(f => 'js/' + f)];
const MIGRATIONEN = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).map(f => 'supabase/migrations/' + f);
const ALLE = [...HTML, ...JS];

test('Jede Seite setzt Referrer-Schutz', () => {
  HTML.forEach(f => assert.match(lies(f), /<meta name="referrer" content="no-referrer">/, f));
});

test('Externe Skripte sind versioniert und per SRI abgesichert', () => {
  ALLE.forEach(f => {
    const s = lies(f);
    for (const m of s.matchAll(/<script src="(https:[^"]+)"([^>]*)>/g)) {
      assert.match(m[1], /@\d+\.\d+\.\d+\/|\/\d+\.\d+\.\d+\//, f + ': Version fehlt in ' + m[1]);
      assert.match(m[2], /integrity="sha384-/, f + ': SRI fehlt für ' + m[1]);
    }
    for (const m of s.matchAll(/\.src = '(https:[^']+)'/g)) {
      assert.match(m[1], /@\d+\.\d+\.\d+\/|\/\d+\.\d+\.\d+\//, f + ': Version fehlt in ' + m[1]);
    }
  });
  const nachladen = (lies('export.js').match(/\.src = 'https:/g) || []).length;
  const sri = (lies('export.js').match(/\.integrity = 'sha384-/g) || []).length;
  assert.equal(sri, nachladen, 'export.js: jede nachgeladene Bibliothek mit SRI');
});

test("Kein select('*')", () => {
  ALLE.forEach(f => assert.ok(!/\.select\(\s*['"`]\*/.test(lies(f)), f));
});

test('Öffentliche Seiten greifen nicht direkt auf Tabellen zu und speichern nichts im Browser', () => {
  ['spieler.html', 'helfer.html'].forEach(f => {
    const s = lies(f);
    assert.ok(!/sb\.from\(/.test(s), f + ': direkter Tabellenzugriff');
    assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(s), f + ': Browser-Speicher');
    assert.ok(!/console\.(log|info|debug)/.test(s), f + ': Konsolenausgabe');
    assert.match(s, /persistSession: false/, f + ': Supabase-Session nicht persistieren');
  });
});

test('Keine Secrets, Service-Role-Keys oder JWTs im Quellcode', () => {
  [...ALLE, ...MIGRATIONEN].forEach(f => {
    const s = lies(f);
    assert.ok(!/service_role['"]?\s*[:=]\s*['"]|sb_secret_|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(s), f);
  });
  assert.match(lies('js/config.js'), /SUPABASE_ANON: 'sb_publishable_/, 'nur Publishable Key im Frontend');
});

test('Tokens werden nicht im Browser erzeugt', () => {
  ALLE.forEach(f => assert.ok(!/Math\.random/.test(lies(f)), f));
});

test('Konfiguration ist zentral (keine verstreuten Supabase-Zugangsdaten)', () => {
  ALLE.filter(f => f !== 'js/config.js').forEach(f => {
    assert.ok(!/supabase\.co'|sb_publishable_/.test(lies(f)), f);
  });
});

test('Leitstand: Datenfelder in HTML-Strings laufen durch esc()', () => {
  const felder = /\+\s*(?:t|termin|s|sp|m|h|v|at|alt|d|z)\??\.(?:gegner|name|liga|anmerkung|mf_name|ort|email|mannschaft)\b/;
  ['app.js', 'export.js'].forEach(f => {
    lies(f).split('\n').forEach((zeile, i) => {
      if (/^\s*(const|let|var) titel =|doc\.text|\.value = `|addWorksheet|\.name\.replace|getCell|\bt1\.value/.test(zeile)) return;   // kein HTML
      assert.ok(!felder.test(zeile), f + ':' + (i + 1) + ' ungeschützt: ' + zeile.trim().slice(0, 120));
    });
  });
});

test('Leitstand: keine Freitexte in onclick-Attributen', () => {
  const s = lies('app.js');
  assert.ok(!/kopierenWA\(this,\s*\\?'\s*\+\s*(?!'|uuidOderLeer|tid)/.test(s), 'kopierenWA nur mit Schlüssel');
  assert.ok(!/onclick="[^"]*'\s*\+\s*(?:t|at|termin|m)\.(?:gegner|name|status|datum|uhrzeit)/.test(s));
});

test('Migrationen: transaktional, SECURITY DEFINER nur mit festem search_path, keine SR-Tabellen', () => {
  MIGRATIONEN.forEach(f => {
    const s = lies(f);
    assert.match(s, /^begin;$/m, f + ': begin fehlt');
    assert.match(s, /^commit;$/m, f + ': commit fehlt');
    assert.ok(!/\bsr_[a-z_]+/.test(s.replace(/--.*$/gm, '')), f + ': berührt SR-Tabellen');
    assert.ok(!/all tables in schema|alter default privileges/i.test(s), f + ': pauschale Rechteänderung');
    const funktionen = s.split(/create or replace function/i).slice(1);
    funktionen.forEach(fn => {
      const kopf = fn.split('$$')[0];
      if (/security definer/i.test(kopf)) {
        assert.match(kopf, /set search_path = ''/, f + ': search_path fehlt bei ' + fn.slice(0, 60));
      }
    });
  });
});

test('Migration 09 lässt anon nur Funktionen ausführen', () => {
  const s = lies('supabase/migrations/20261110000900_anon_tabellenzugriff_entziehen.sql').replace(/--.*$/gm, '');
  const grants = s.match(/grant [^;]+ to anon/gi) || [];
  assert.deepEqual(grants.map(g => g.replace(/\s+/g, ' ')), ['grant insert on public.vereinsbefragung to anon']);
});
