'use strict';
// Lädt eine HTML-Seite der App in jsdom – ohne Netzwerk:
// CDN-Skripte werden durch einen Supabase-Mock ersetzt, lokale Skripte inline eingebettet.
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');

function seiteLaden(datei, { url, mock, vorbereiten } = {}) {
  let html = fs.readFileSync(path.join(ROOT, datei), 'utf8');
  html = html.replace(/<script src="https:\/\/[^"]+"[^>]*><\/script>/g,
    '<script>window.supabase = { createClient: function () { return window.__mock; } };</script>');
  html = html.replace(/<script src="([^":]+\.js)"><\/script>/g, (_, src) =>
    '<script>' + fs.readFileSync(path.join(ROOT, src), 'utf8') + '\n</script>');
  const storageZugriffe = [];
  const dom = new JSDOM(html, {
    url: url || 'https://spielplanapp.christianaust.eu/' + datei,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.__mock = mock;
      window.alert = (m) => { (window.__alerts = window.__alerts || []).push(String(m)); };
      window.confirm = () => true;
      window.open = (u) => { (window.__geoeffnet = window.__geoeffnet || []).push(u); return null; };
      window.console.error = () => {};
      for (const art of ['localStorage', 'sessionStorage']) {
        const echt = window[art];
        Object.defineProperty(window, art, { configurable: true, get() {
          storageZugriffe.push(art);
          return echt;
        } });
      }
      if (vorbereiten) vorbereiten(window);
    }
  });
  return { dom, window: dom.window, document: dom.window.document, storageZugriffe };
}

async function warten(n = 10) {
  for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0));
}

// Supabase-Mock: zeichnet alle Aufrufe auf, liefert Fixtures je Tabelle/RPC
function supabaseMock({ tabellen = {}, rpc = {}, session = null } = {}) {
  const aufrufe = [];
  function builder(tabelle) {
    const b = { tabelle, schritte: [] };
    const kette = ['select', 'eq', 'in', 'order', 'insert', 'update', 'delete', 'upsert', 'is', 'single'];
    kette.forEach(m => { b[m] = (...args) => { b.schritte.push([m, args]); aufrufe.push({ art: 'from', tabelle, m, args }); return b; }; });
    b.then = (ok, fehler) => {
      const f = tabellen[tabelle];
      const r = typeof f === 'function' ? f(b.schritte) : { data: f === undefined ? [] : f, error: null };
      return Promise.resolve(r).then(ok, fehler);
    };
    return b;
  }
  return {
    aufrufe,
    from: (t) => builder(t),
    rpc: (name, args) => {
      aufrufe.push({ art: 'rpc', name, args });
      const f = rpc[name];
      return Promise.resolve(typeof f === 'function' ? f(args) : (f || { data: null, error: { code: 'PGRST202', message: 'nicht gemockt' } }));
    },
    auth: {
      getSession: () => Promise.resolve({ data: { session } }),
      signOut: () => Promise.resolve({}),
      signInWithPassword: () => Promise.resolve({ error: null })
    }
  };
}

module.exports = { seiteLaden, warten, supabaseMock, ROOT };
