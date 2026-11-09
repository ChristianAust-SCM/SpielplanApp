// ============================================================
// Sicherheits- und Hilfsfunktionen (Browser + Node-Tests)
// ------------------------------------------------------------
// Grundregel: Jeder Wert aus der Datenbank oder aus Nutzereingaben,
// der in innerHTML landet, MUSS durch esc() laufen. Werte in
// HTML-Attributen ebenfalls esc() (escaped auch Anführungszeichen).
// Keine Daten in onclick-Strings einbetten – stattdessen data-*-Attribute
// mit IDs und Event-Delegation verwenden.
// ============================================================
(function (root) {
  'use strict';

  var ERSATZ = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

  function esc(wert) {
    if (wert === null || wert === undefined) return '';
    return String(wert).replace(/[&<>"'`]/g, function (z) { return ERSATZ[z]; });
  }

  // Nur UUIDs dürfen als Kennung in data-Attributen/Selektoren landen
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function istUuid(wert) { return typeof wert === 'string' && UUID_RE.test(wert); }

  // Link-Token: nur URL-sichere Zeichen, 16–128 Zeichen (wie serverseitig)
  var TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;
  function istGueltigesToken(wert) { return typeof wert === 'string' && TOKEN_RE.test(wert); }

  // "Nachname, Vorname" → "Vorname Nachname"
  function anzeigeName(dbName) {
    var n = String(dbName || '');
    var p = n.split(',');
    return p.length === 2 ? p[1].trim() + ' ' + p[0].trim() : n;
  }

  // Verständliche Fehlermeldung aus Supabase-/Netzwerkfehlern.
  // Technische Details (SQL, Tokens) werden nicht angezeigt.
  function fehlerText(err, standard) {
    var basis = standard || 'Das hat leider nicht geklappt. Bitte später erneut versuchen.';
    if (!err) return basis;
    var code = err.code || '';
    var msg = String(err.message || '');
    if (code === 'P0001' && msg) return msg;                 // fachliche Meldung der Serverfunktion
    if (code === '42501' || /permission denied|row-level security/i.test(msg)) {
      return 'Keine Berechtigung für diese Aktion.';
    }
    if (code === '23505') return 'Dieser Eintrag existiert bereits.';
    if (code === 'PGRST202' || code === '42883') {
      return 'Die Serverfunktion ist noch nicht verfügbar. Bitte den Administrator informieren.';
    }
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
      return 'Keine Verbindung zum Server. Bitte Internetverbindung prüfen.';
    }
    if (/JWT|session/i.test(msg)) return 'Die Anmeldung ist abgelaufen. Bitte neu anmelden.';
    return basis;
  }

  // Datum "YYYY-MM-DD" als lokales Datum (nicht UTC) – vermeidet Tagesversatz
  function lokalesDatum(iso) {
    if (!iso) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  var api = {
    esc: esc,
    istUuid: istUuid,
    istGueltigesToken: istGueltigesToken,
    anzeigeName: anzeigeName,
    fehlerText: fehlerText,
    lokalesDatum: lokalesDatum
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SPS = api;
})(this);
