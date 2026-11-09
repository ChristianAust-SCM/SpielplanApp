// ============================================================
// Halbrunden/Saison-Logik und CSV-Terminimport (reine Funktionen)
// ------------------------------------------------------------
// Der Import läuft in drei Schritten:
//   1. CSV im Browser lesen und prüfen (diese Datei)        → Vorschau
//   2. Serverprüfung termine_importieren(..., false)        → Dubletten DB-weit
//   3. Erst nach Bestätigung termine_importieren(..., true) → speichert alles
//      oder nichts (eine Transaktion)
// ============================================================
(function (root) {
  'use strict';

  var HALBRUNDEN = ['Vorrunde', 'Rückrunde'];

  // Saison wechselt zum 1. Juli (identisch zur generierten DB-Spalte)
  function saisonVon(iso) {
    var m = /^(\d{4})-(\d{2})/.exec(String(iso || ''));
    if (!m) return null;
    var jahr = Number(m[1]), monat = Number(m[2]);
    var start = monat < 7 ? jahr - 1 : jahr;
    return start + '/' + String((start + 1) % 100).padStart(2, '0');
  }

  // Januar–Juni: Rückrunde, Juli–Dezember: Vorrunde
  function standardHalbrunde(heute) {
    var d = heute || new Date();
    return d.getMonth() < 6 ? 'Rückrunde' : 'Vorrunde';
  }

  function aktuelleSaison(heute) {
    var d = heute || new Date();
    var iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
    return saisonVon(iso);
  }

  function filterTermine(termine, halbrunde, saison) {
    return (termine || []).filter(function (t) {
      var hr = t.halbrunde || 'Vorrunde';
      var s = t.saison || saisonVon(t.datum);
      return (!halbrunde || hr === halbrunde) && (!saison || s === saison);
    });
  }

  // ---------------------------------------------------------------- CSV
  function parseCsv(text) {
    var s = String(text || '').replace(/^﻿/, '');
    var ersteZeile = s.split(/\r?\n/)[0] || '';
    var trenner = (ersteZeile.split(';').length >= ersteZeile.split(',').length) ? ';' : ',';
    var zeilen = [], feld = '', zeile = [], inQuote = false;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (inQuote) {
        if (c === '"' && s[i + 1] === '"') { feld += '"'; i++; }
        else if (c === '"') inQuote = false;
        else feld += c;
      } else if (c === '"') inQuote = true;
      else if (c === trenner) { zeile.push(feld); feld = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        zeile.push(feld); zeilen.push(zeile); zeile = []; feld = '';
      } else feld += c;
    }
    if (feld !== '' || zeile.length) { zeile.push(feld); zeilen.push(zeile); }
    return { trenner: trenner, zeilen: zeilen };
  }

  var SPALTEN = {
    mannschaft: ['mannschaft', 'team'],
    datum: ['datum', 'date', 'tag'],
    uhrzeit: ['uhrzeit', 'zeit', 'beginn', 'uhr'],
    heim: ['heim/auswärts', 'heim/auswaerts', 'h/a', 'heim', 'ha', 'spielort-art'],
    gegner: ['gegner', 'gast/heim', 'gegnerische mannschaft'],
    ort: ['ort', 'halle', 'spiellokal'],
    spieltag: ['spieltag', 'spieltag_nr', 'nr'],
    halbrunde: ['halbrunde', 'runde']
  };

  function spaltenZuordnen(kopf) {
    var idx = {};
    kopf.forEach(function (k, i) {
      var n = String(k || '').trim().toLowerCase();
      Object.keys(SPALTEN).forEach(function (feld) {
        if (idx[feld] === undefined && SPALTEN[feld].indexOf(n) !== -1) idx[feld] = i;
      });
    });
    return idx;
  }

  function normDatum(wert) {
    var w = String(wert || '').trim(), j, m, t, r;
    if ((r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(w))) { j = +r[1]; m = +r[2]; t = +r[3]; }
    else if ((r = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(w))) {
      t = +r[1]; m = +r[2]; j = +r[3]; if (j < 100) j += 2000;
    } else return null;
    var d = new Date(j, m - 1, t);
    if (d.getFullYear() !== j || d.getMonth() !== m - 1 || d.getDate() !== t) return null;
    return j + '-' + String(m).padStart(2, '0') + '-' + String(t).padStart(2, '0');
  }

  function normUhrzeit(wert) {
    var w = String(wert || '').trim().replace(/\s*uhr$/i, '');
    if (!w) return '';
    var r = /^(\d{1,2})[:.](\d{2})$/.exec(w);
    if (!r || +r[1] > 23 || +r[2] > 59) return null;
    return String(+r[1]).padStart(2, '0') + ':' + r[2];
  }

  function normHeim(wert) {
    var w = String(wert || '').trim().toLowerCase();
    if (['h', 'heim', 'heimspiel', 'ja', 'j', 'true', '1'].indexOf(w) !== -1) return true;
    if (['a', 'auswärts', 'auswaerts', 'auswärtsspiel', 'gast', 'nein', 'n', 'false', '0'].indexOf(w) !== -1) return false;
    return null;
  }

  function normText(wert) { return String(wert || '').trim().replace(/\s+/g, ' '); }

  function mannschaftFinden(wert, mannschaften) {
    var w = normText(wert).toLowerCase();
    if (!w) return null;
    var treffer = (mannschaften || []).filter(function (m) {
      var name = String(m.name || '').toLowerCase();
      var nr = (/^(\d+)/.exec(name) || [])[1];
      return name === w || (nr && (w === nr || w === nr + '.' || w === nr + '. mannschaft'));
    });
    return treffer.length === 1 ? treffer[0] : null;
  }

  // Prüft eine CSV-Datei vollständig und liefert eine Vorschau.
  // optionen: { mannschaften:[{id,name}], bestehend:[{mannschaft_id,datum,gegner}],
  //             halbrunde:'Rückrunde', heute: Date }
  function pruefeImport(text, optionen) {
    var o = optionen || {};
    var heute = o.heute || new Date();
    var heuteIso = heute.getFullYear() + '-' + String(heute.getMonth() + 1).padStart(2, '0') + '-' + String(heute.getDate()).padStart(2, '0');
    var csv = parseCsv(text);
    var roh = csv.zeilen.filter(function (z) { return z.some(function (f) { return String(f).trim() !== ''; }); });
    var ergebnis = { zeilen: [], fehlerGesamt: [], ok: false, gueltig: 0 };

    if (roh.length < 2) {
      ergebnis.fehlerGesamt.push('Die Datei enthält keine Termine (Kopfzeile + mindestens eine Zeile erwartet).');
      return ergebnis;
    }
    var idx = spaltenZuordnen(roh[0]);
    ['mannschaft', 'datum', 'heim', 'gegner'].forEach(function (pflicht) {
      if (idx[pflicht] === undefined) ergebnis.fehlerGesamt.push('Pflichtspalte fehlt: ' + pflicht);
    });
    if (ergebnis.fehlerGesamt.length) return ergebnis;
    if (roh.length - 1 > 300) {
      ergebnis.fehlerGesamt.push('Zu viele Zeilen (max. 300 je Import).');
      return ergebnis;
    }

    var bestehend = {};
    (o.bestehend || []).forEach(function (t) {
      bestehend[t.mannschaft_id + '|' + t.datum + '|' + normText(t.gegner).toLowerCase()] = true;
    });
    var gesehen = {};

    roh.slice(1).forEach(function (z, i) {
      var feld = function (name) { return idx[name] === undefined ? '' : (z[idx[name]] || ''); };
      var f = [], w = [];
      var m = mannschaftFinden(feld('mannschaft'), o.mannschaften);
      if (!m) f.push('Mannschaft unbekannt oder nicht eindeutig: "' + normText(feld('mannschaft')) + '"');
      var datum = normDatum(feld('datum'));
      if (!datum) f.push('Ungültiges Datum: "' + normText(feld('datum')) + '"');
      else if (datum < heuteIso) w.push('Datum liegt in der Vergangenheit');
      var uhr = normUhrzeit(feld('uhrzeit'));
      if (uhr === null) f.push('Ungültige Uhrzeit: "' + normText(feld('uhrzeit')) + '"');
      var heim = normHeim(feld('heim'));
      if (heim === null) f.push('Heim/Auswärts unklar: "' + normText(feld('heim')) + '" (erlaubt: H/A, Heim/Auswärts)');
      var gegner = normText(feld('gegner'));
      if (gegner.length < 2 || gegner.length > 80) f.push('Gegner fehlt oder ist zu lang (2–80 Zeichen)');
      else if (/[<>]/.test(gegner)) f.push('Gegner enthält unzulässige Zeichen');
      var ort = normText(feld('ort'));
      if (ort.length > 120 || /[<>]/.test(ort)) f.push('Ort ist zu lang oder enthält unzulässige Zeichen');
      var nrText = normText(feld('spieltag')), nr = null;
      if (nrText) {
        if (/^\d{1,2}$/.test(nrText) && +nrText >= 1 && +nrText <= 40) nr = +nrText;
        else f.push('Ungültige Spieltagsnummer: "' + nrText + '"');
      }
      var hr = normText(feld('halbrunde')) || o.halbrunde || 'Rückrunde';
      if (HALBRUNDEN.indexOf(hr) === -1) f.push('Halbrunde muss Vorrunde oder Rückrunde sein');

      if (m && datum && gegner.length >= 2) {
        var k = m.id + '|' + datum + '|' + gegner.toLowerCase();
        if (gesehen[k]) f.push('Doppelte Zeile (wie Zeile ' + gesehen[k] + ')');
        else gesehen[k] = i + 2;
        if (bestehend[k]) f.push('Termin existiert bereits (Dublette)');
      }

      var daten = { mannschaft_id: m ? m.id : null, mannschaft: m ? m.name : normText(feld('mannschaft')),
                    datum: datum, uhrzeit: uhr || '', heim: heim, gegner: gegner, ort: ort,
                    spieltag_nr: nr, halbrunde: hr };
      ergebnis.zeilen.push({ nr: i + 2, daten: daten, fehler: f, warnungen: w });
    });

    ergebnis.gueltig = ergebnis.zeilen.filter(function (z) { return z.fehler.length === 0; }).length;
    ergebnis.ok = ergebnis.zeilen.length > 0 && ergebnis.gueltig === ergebnis.zeilen.length;
    return ergebnis;
  }

  // Nutzlast für public.termine_importieren
  function rpcZeilen(ergebnis) {
    return ergebnis.zeilen.filter(function (z) { return z.fehler.length === 0; }).map(function (z) {
      var d = z.daten;
      return { mannschaft_id: d.mannschaft_id, datum: d.datum, uhrzeit: d.uhrzeit, heim: d.heim,
               gegner: d.gegner, ort: d.ort, halbrunde: d.halbrunde,
               spieltag_nr: d.spieltag_nr === null ? '' : String(d.spieltag_nr) };
    });
  }

  var CSV_VORLAGE = 'Mannschaft;Datum;Uhrzeit;Heim/Auswärts;Gegner;Ort;Spieltag\n' +
                    '1. Mannschaft;16.01.2027;18:30;H;Beispielverein;;10\n';

  var api = {
    HALBRUNDEN: HALBRUNDEN, saisonVon: saisonVon, standardHalbrunde: standardHalbrunde,
    aktuelleSaison: aktuelleSaison, filterTermine: filterTermine, parseCsv: parseCsv,
    normDatum: normDatum, normUhrzeit: normUhrzeit, normHeim: normHeim,
    mannschaftFinden: mannschaftFinden, pruefeImport: pruefeImport, rpcZeilen: rpcZeilen,
    CSV_VORLAGE: CSV_VORLAGE
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SPRunde = api;
})(this);
