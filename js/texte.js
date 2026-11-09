// ============================================================
// Nachrichtentexte (WhatsApp) – reine Funktionen, testbar
// ============================================================
(function (root) {
  'use strict';

  function mfVorname(mfName) {
    var n = String(mfName || '').trim();
    return n ? n.split(/\s+/)[0] : 'Euer MF';
  }

  // Abfrage für einen Spieltermin
  function abfrageText(o) {
    return 'Hallo zusammen,\nbitte meldet eure Verfügbarkeit für unser Spiel:\n\n' +
      '🏓 ' + (o.heim ? 'Heimspiel' : 'Auswärtsspiel') + ' gegen ' + o.gegner + '\n' +
      '📅 ' + o.datumLang + (o.uhrzeit ? ' · ' + o.uhrzeit : '') + '\n\n' +
      '👉 ' + o.link + '\n\n' +
      'Bitte bis Mittwoch antworten. Danke!\n– ' + mfVorname(o.mfName);
  }

  // Abfrage für einen Ausweichtermin
  function ausweichText(o) {
    return 'Hallo zusammen,\nbitte prüft ob ihr an folgendem Ausweichtermin spielen könnt:\n\n' +
      '🏓 ' + (o.heim ? 'Heimspiel' : 'Auswärtsspiel') + ' gegen ' + o.gegner + '\n' +
      '📅 ' + o.datumLang + (o.uhrzeit ? ' · ' + o.uhrzeit : '') + '\n\n' +
      '👉 ' + o.link + '\n\n' +
      'Bitte bis Mittwoch antworten. Danke!\n– ' + mfVorname(o.mfName);
  }

  // Erinnerung an Spieler ohne Rückmeldung
  function erinnerungText(o) {
    var namen = (o.namen || []).join(', ');
    return 'Hallo ' + namen + ',\nvon euch fehlt noch die Rückmeldung für unser Spiel:\n\n' +
      '🏓 ' + (o.heim ? 'Heimspiel' : 'Auswärtsspiel') + ' gegen ' + o.gegner + '\n' +
      '📅 ' + o.datumLang + (o.uhrzeit ? ' · ' + o.uhrzeit : '') + '\n\n' +
      '👉 ' + o.link + '\n\nDanke!\n– ' + mfVorname(o.mfName);
  }

  function whatsappUrl(text) {
    return 'https://wa.me/?text=' + encodeURIComponent(text);
  }

  var api = { abfrageText: abfrageText, ausweichText: ausweichText, erinnerungText: erinnerungText,
              whatsappUrl: whatsappUrl, mfVorname: mfVorname };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SPTexte = api;
})(this);
