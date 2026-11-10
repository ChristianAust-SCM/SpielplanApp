// ============================================================
// Einheitliche Symbole (Inline-SVG, currentColor) und Vereinsmarke.
// Reine Tischtennis-Bildsprache: Schläger und Ball – kein Vereinslogo.
// Nur feste Zeichenketten, keine Daten.
// ============================================================
(function (root) {
  function s(pfad, extra) {
    return function (klasse) {
      return '<svg class="sym' + (klasse ? ' ' + klasse : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + pfad + '</svg>';
    };
  }
  var SYM = {
    team:      s('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    kalender:  s('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>'),
    uhr:       s('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
    liste:     s('<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>'),
    warnung:   s('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>'),
    haken:     s('<path d="M20 6 9 17l-5-5"/>'),
    kreuz:     s('<path d="M18 6 6 18M6 6l12 12"/>'),
    frage:     s('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'),
    hochladen: s('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>'),
    laden:     s('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>'),
    link:      s('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
    tausch:    s('<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>'),
    wappen:    s('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="M12 6v12" opacity=".55"/><path d="M8 9.5h8" opacity=".55"/>'),
    nutzer:    s('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.66V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.66"/>'),
    ort:       s('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'),
    nachricht: s('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>'),
    datei:     s('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h8M8 17h5"/>'),
    raster:    s('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>'),
    plus:      s('<path d="M12 5v14M5 12h14"/>'),
    loeschen:  s('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
    schloss:   s('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
    mail:      s('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>'),
    flagge:    s('<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 8 2a6 6 0 0 0 3.6-1.2A1 1 0 0 1 21 3.6v10.8a1 1 0 0 1-.4.8A6 6 0 0 1 17 16c-3 0-5-2-8-2a6 6 0 0 0-5 2"/>'),
    abmelden:  s('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>'),
    whatsapp: function (klasse) {
      return '<svg class="sym' + (klasse ? ' ' + klasse : '') + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.47-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.28-.2-.57-.35M11.91 0C5.34 0 0 5.34 0 11.91c0 2.11.55 4.1 1.51 5.82L0 24l6.46-1.47a11.88 11.88 0 0 0 5.45 1.32C18.49 23.85 23.83 18.5 23.83 11.9 23.83 5.34 18.49 0 11.91 0m0 21.83a9.9 9.9 0 0 1-5.03-1.37l-.36-.21-3.73.85.87-3.64-.24-.37A9.86 9.86 0 0 1 2 11.91C2 6.44 6.44 2 11.91 2s9.92 4.44 9.92 9.91-4.45 9.92-9.92 9.92"/></svg>';
    },
    // Vereinsmarke: Tischtennisschläger mit Ball (allgemeine Sportbildsprache)
    marke: function (klasse) {
      return '<svg class="' + (klasse || 'marke-logo') + '" viewBox="0 0 64 64" aria-hidden="true">' +
        '<defs><linearGradient id="sp-blatt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffa04d"/><stop offset="1" stop-color="#e5600c"/></linearGradient></defs>' +
        '<g transform="rotate(40 28 30)">' +
          '<path d="M23.5 41 h9 l1.6 6.5 v10.5 a3.5 3.5 0 0 1 -3.5 3.5 h-5.2 a3.5 3.5 0 0 1 -3.5 -3.5 v-10.5 z" fill="#e9eef8"/>' +
          '<path d="M25 47 h6 M25 51.5 h6 M25 56 h6" stroke="#b9c4da" stroke-width="1.4"/>' +
          '<circle cx="28" cy="22" r="20" fill="url(#sp-blatt)"/>' +
          '<circle cx="28" cy="22" r="20" fill="none" stroke="#fff" stroke-opacity=".95" stroke-width="2.4"/>' +
        '</g>' +
        '<circle cx="53" cy="12" r="7.5" fill="#f3f6fc"/><circle cx="51" cy="10" r="2.4" fill="#fff"/>' +
      '</svg>';
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = SYM;
  else root.SYM = SYM;
})(this);
