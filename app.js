// ============================================================
// Spielplan-App · app.js (Leitstand für Mannschaftsführer/Admins)
// ------------------------------------------------------------
// Sicherheitsgrundsätze (siehe docs/SICHERHEITSMODELL.md):
//  * Berechtigungen prüft ausschließlich der Server (RLS + Funktionen).
//    istAdmin steuert hier nur, welche Bedienelemente sichtbar sind.
//  * Jeder Datenwert in innerHTML läuft durch esc().
//  * In onclick-Attributen stehen nur geprüfte UUIDs oder Schlüssel,
//    niemals Freitext (WhatsApp-Texte liegen in einer Map).
//  * Nur ausdrücklich benötigte Spalten werden abgefragt.
// Benötigt: js/config.js, js/sicherheit.js, js/texte.js, js/rueckrunde.js
// ============================================================
const sb  = window.supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON);
const esc = SPS.esc;
const BASIS_URL = APP_CONFIG.BASIS_URL;

const SPALTEN = {
  termine:  'id, mannschaft_id, spieltag_nr, datum, uhrzeit, heim, gegner, ort, halbrunde, status, abfrage_token, saison',
  spieler:  'id, mannschaft_id, name, ttr, aktiv, position',
  verfueg:  'id, spieltermin_id, alternativtermin_id, spieler_id, antwort, anmerkung',
  alt:      'id, spieltermin_id, datum, uhrzeit, status, abfrage_token',
  aufst:    'id, spieltermin_id, spieler_id, ersatz_mannschaft_id',
  helfer:   'id, name, einsatz, anmerkung, created_at'
};

var alleMannschaften = [];
var aktiveMannschaft = null;
let alleTermineMannschaft = [];   // alle Halbrunden/Saisons der Mannschaft
let alleTermine      = [];        // gefiltert nach aktiver Halbrunde/Saison
let alleVerfueg      = [];
let alleSpieler      = [];
let alleAlternativtermine = [];
let alleAufstellungen = [];
let istAdmin         = false;
let alleHelfer       = [];
let waTexte          = {};        // Schlüssel → WhatsApp-Text (statt Text im onclick)
var aktiveHalbrunde  = ladeEinstellung('halbrunde') || SPRunde.standardHalbrunde();
var aktiveSaison     = null;      // null = aktuelle bzw. jüngste vorhandene Saison

// ------------------------------------------------------------
// Hilfen
// ------------------------------------------------------------
function ladeEinstellung(k) {
  try { return window.localStorage.getItem('spielplan.' + k); } catch (e) { return null; }
}
function speichereEinstellung(k, v) {
  try { window.localStorage.setItem('spielplan.' + k, v); } catch (e) { /* optional */ }
}
// Supabase-Antwort prüfen: Fehler werfen statt still leere Daten anzuzeigen
function pruefe(res) {
  if (res && res.error) throw res.error;
  return (res && res.data) || [];
}
function meldeFehler(err, kontext) {
  console.error(kontext || 'Fehler', err && err.code, err && err.message);
  alert((kontext ? kontext + ': ' : '') + SPS.fehlerText(err));
}
function uuidOderLeer(id) { return SPS.istUuid(id) ? id : ''; }
function datum(iso) { return SPS.lokalesDatum(iso); }
function fmt(iso, opt) { const d = datum(iso); return d ? d.toLocaleDateString('de-DE', opt) : ''; }
function uhr(u) { return u ? String(u).slice(0, 5) : ''; }
function minSpieler() { return (aktiveMannschaft && aktiveMannschaft.min_spieler) || 6; }
function abfrageLink(token) { return BASIS_URL + 'spieler.html?token=' + encodeURIComponent(token || ''); }
function altLink(token) { return BASIS_URL + 'spieler.html?alt=' + encodeURIComponent(token || ''); }
function modalOeffnen(innerHtml, maxBreite) {
  const modal = document.createElement('div');
  modal.className = 'sp-modal';
  modal.setAttribute('role', 'dialog');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px;overflow-y:auto';
  modal.innerHTML = innerHtml;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
  return modal;
}
function modalSchliessen() {
  document.querySelectorAll('.sp-modal').forEach(m => m.remove());
}
const X_BTN = '<button onclick="this.closest(\'.sp-modal\').remove()" aria-label="Schließen" style="background:none;border:none;color:#8996B4;font-size:20px;cursor:pointer">✕</button>';

// Feste Symbole in die statische Seite einsetzen (nur Konstanten, keine Daten)
function symboleEinsetzen() {
  document.querySelectorAll('[data-sym]').forEach(function (el) {
    const f = SYM[el.getAttribute('data-sym')];
    if (f) el.outerHTML = f(el.className);
  });
  const logo = document.getElementById('marke-logo');
  if (logo) logo.outerHTML = SYM.marke();
  const ex = document.getElementById('export-sym');
  if (ex) ex.outerHTML = SYM.laden('sym-s');
}

function renderNutzer(email) {
  const rolle = istAdmin ? 'Admin' : 'Mannschaftsführer';
  document.getElementById('header-status').innerHTML =
    '<span class="nutzer-bild">' + SYM.nutzer() + '</span>' +
    '<div><div class="nutzer-rolle">' + esc(rolle) + '</div><div class="nutzer-mail" title="' + esc(email) + '">' + esc(email) + '</div></div>' +
    '<button class="nutzer-ab" onclick="abmelden()" title="Abmelden" aria-label="Abmelden">' + SYM.abmelden('sym-s') + '<span class="nutzer-ab-text">Abmelden</span></button>';
}

// ============================================================
// Start
// ============================================================
async function init() {
  const { data: sessionData } = await sb.auth.getSession();
  if (!sessionData.session) {
    window.location.href = 'login.html';
    return;
  }

  const userId = sessionData.session.user.id;
  const email  = sessionData.session.user.email;

  renderNutzer(email);
  document.getElementById('config-hint').style.display = 'none';

  try {
    const rollen = pruefe(await sb
      .from('nutzer_rollen')
      .select('mannschaft_id, rolle, mannschaften(id, name, liga, mf_name, min_spieler)')
      .eq('user_id', userId));

    istAdmin = rollen.some(r => r.rolle === 'admin');
    renderNutzer(email);

    alleMannschaften = rollen
      .filter(r => r.mannschaften)
      .map(r => ({ ...r.mannschaften, min_spieler: r.mannschaften.min_spieler || 6 }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (alleMannschaften.length === 0) {
      document.getElementById('table-container').innerHTML =
        '<div class="loading">Keine Mannschaft zugewiesen. Bitte Admin kontaktieren.</div>';
      return;
    }

    renderTabs();
    await ladeMannschaft(alleMannschaften[0].id);

  } catch (err) {
    document.getElementById('header-status').textContent = 'Fehler';
    document.getElementById('table-container').innerHTML =
      '<div class="config-hint"><strong style="color:#E24B4A">Fehler:</strong> ' + esc(SPS.fehlerText(err)) + '</div>';
  }
}

async function abmelden() {
  await sb.auth.signOut();
  window.location.href = 'login.html';
}

// ============================================================
// Tabs
// ============================================================
function renderTabs() {
  const el = document.getElementById('tabs');
  let html = alleMannschaften.map(m =>
    '<button class="tab" onclick="ladeMannschaft(\'' + uuidOderLeer(m.id) + '\')" data-id="' + esc(m.id) + '">' +
      SYM.team() + '<span>' + esc(m.name) + ' <span class="tab-liga">· ' + esc(m.liga) + '</span></span>' +
    '</button>'
  ).join('');

  if (istAdmin && APP_CONFIG.TURNIER_HELFER_ANZEIGEN === true) {
    html += '<button class="tab tab-turnier" onclick="ladeTurnierHelfer()" data-id="turnier-helfer">Turnier-Helfer</button>';
  }
  el.innerHTML = html;
}

function setAktivTab(id) {
  document.querySelectorAll('#tabs .tab').forEach(t => {
    t.classList.toggle('active', t.dataset.id === id);
  });
}

// ============================================================
// Halbrunde / Saison
// ============================================================
function renderRundenUmschalter() {
  const el = document.getElementById('runde-umschalter');
  if (!el) return;
  if (!aktiveMannschaft) { el.innerHTML = ''; return; }

  const saisons = Array.from(new Set(alleTermineMannschaft.map(t => t.saison || SPRunde.saisonVon(t.datum)).filter(Boolean))).sort();
  const saisonAuswahl = saisons.length > 1
    ? '<select id="saison-auswahl" onchange="setzeSaison(this.value)" aria-label="Saison" style="padding:7px 12px;border-radius:20px;border:1px solid var(--line);background:var(--navy2);color:var(--white);font-family:Calibri,sans-serif;font-size:14px">' +
        saisons.map(s => '<option value="' + esc(s) + '"' + (s === aktiveSaison ? ' selected' : '') + '>Saison ' + esc(s) + '</option>').join('') +
      '</select>'
    : '';

  el.innerHTML =
    SPRunde.HALBRUNDEN.map(h =>
      '<button class="tab' + (h === aktiveHalbrunde ? ' active' : '') + '" onclick="setzeHalbrunde(\'' + (h === 'Vorrunde' ? 'Vorrunde' : 'Rückrunde') + '\')">' + esc(h) + '</button>'
    ).join('') +
    saisonAuswahl +
    (istAdmin ? '<button class="tab tab-aktion" onclick="zeigeImportModal()" title="Spieltermine aus CSV importieren">' + SYM.hochladen() + 'Termine importieren</button>' : '');
}

function setzeHalbrunde(h) {
  if (SPRunde.HALBRUNDEN.indexOf(h) === -1) return;
  aktiveHalbrunde = h;
  speichereEinstellung('halbrunde', h);
  filtereUndZeichne();
}

function setzeSaison(s) {
  aktiveSaison = s;
  filtereUndZeichne();
}

function filtereUndZeichne() {
  const saisons = Array.from(new Set(alleTermineMannschaft.map(t => t.saison || SPRunde.saisonVon(t.datum)).filter(Boolean))).sort();
  if (!aktiveSaison || saisons.indexOf(aktiveSaison) === -1) {
    const aktuell = SPRunde.aktuelleSaison();
    aktiveSaison = saisons.indexOf(aktuell) !== -1 ? aktuell : (saisons[saisons.length - 1] || aktuell);
  }
  alleTermine = SPRunde.filterTermine(alleTermineMannschaft, aktiveHalbrunde, aktiveSaison);
  const titel = document.getElementById('section-title');
  if (titel) titel.textContent = aktiveHalbrunde + ' ' + aktiveSaison;
  const meta = document.getElementById('section-meta');
  if (meta) {
    const kurz = { day: '2-digit', month: '2-digit', year: '2-digit' };
    meta.textContent = alleTermine.length === 0 ? '' :
      alleTermine.length + (alleTermine.length === 1 ? ' Spieltag' : ' Spieltage') + '  ·  ' +
      fmt(alleTermine[0].datum, kurz) + ' – ' + fmt(alleTermine[alleTermine.length - 1].datum, kurz);
  }
  renderRundenUmschalter();
  renderStats();
  renderTabelle();
}

// ============================================================
// Mannschaft laden
// ============================================================
async function ladeMannschaft(mannschaftId) {
  aktiveMannschaft = alleMannschaften.find(m => m.id === mannschaftId);
  if (!aktiveMannschaft) return;
  setAktivTab(mannschaftId);

  const statsEl = document.getElementById('stats');
  if (statsEl) statsEl.style.display = 'grid';

  document.getElementById('table-container').innerHTML =
    '<div class="loading"><span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></div>';

  try {
    const [termineRes, spielerRes] = await Promise.all([
      sb.from('spieltermine').select(SPALTEN.termine).eq('mannschaft_id', mannschaftId).order('datum'),
      sb.from('spieler').select(SPALTEN.spieler).eq('mannschaft_id', mannschaftId).eq('aktiv', true)
    ]);
    alleTermineMannschaft = pruefe(termineRes);
    alleSpieler = pruefe(spielerRes);

    if (alleTermineMannschaft.length > 0) {
      const ids = alleTermineMannschaft.map(t => t.id);
      const [verfRes, altRes, aufRes] = await Promise.all([
        sb.from('verfuegbarkeiten').select(SPALTEN.verfueg).in('spieltermin_id', ids),
        sb.from('alternativtermine').select(SPALTEN.alt).in('spieltermin_id', ids).order('datum'),
        sb.from('aufstellungen').select(SPALTEN.aufst).in('spieltermin_id', ids)
      ]);
      alleVerfueg = pruefe(verfRes);
      alleAlternativtermine = pruefe(altRes);
      alleAufstellungen = pruefe(aufRes);
    } else {
      alleVerfueg = [];
      alleAlternativtermine = [];
      alleAufstellungen = [];
    }
  } catch (err) {
    document.getElementById('table-container').innerHTML =
      '<div class="config-hint"><strong style="color:#E24B4A">Daten konnten nicht geladen werden:</strong> ' + esc(SPS.fehlerText(err)) + '</div>';
    return;
  }

  filtereUndZeichne();
}

// ============================================================
// Statistiken
// ============================================================
function renderStats() {
  const gesamt = alleTermine.length;
  const min    = minSpieler();
  let offen = 0, krit = 0, ok = 0;

  alleTermine.forEach(t => {
    const kl = ampelKlasse(t.id);
    if (kl === 'offen') offen++;
    else if (kl === 'ok') ok++;
    else krit++;
  });

  document.getElementById('stat-gesamt').textContent = gesamt;
  document.getElementById('stat-offen').textContent  = offen;
  document.getElementById('stat-krit').textContent   = krit;
  document.getElementById('stat-ok').textContent     = ok;

  const lk = document.querySelector('[for-stat="krit"]');
  if (lk) lk.textContent = `Zu wenig (<${min} Zusagen)`;
  const lo = document.querySelector('[for-stat="ok"]');
  if (lo) lo.textContent = `Spielbereit (≥${min} Ja)`;
}

function kaderIds() {
  // Votes von deaktivierten oder in andere Mannschaften verschobenen
  // Spielern bleiben in der DB, werden aber nicht mitgezählt.
  return new Set(alleSpieler.map(function(s) { return s.id; }));
}

function hauptVotes(terminId) {
  const ids = kaderIds();
  return alleVerfueg.filter(v =>
    v.spieltermin_id === terminId && ids.has(v.spieler_id) && v.alternativtermin_id == null);
}

function zaehleAntworten(terminId, antwort) {
  return hauptVotes(terminId).filter(v => v.antwort === antwort).length;
}

function ampelKlasse(terminId) {
  if (hauptVotes(terminId).length === 0) return 'offen';
  const ja  = zaehleAntworten(terminId, 'Ja');
  const min = minSpieler();
  if (ja >= min)     return 'ok';
  if (ja >= min - 2) return 'warn';
  return 'crit';
}

function ampelText(terminId) {
  if (hauptVotes(terminId).length === 0) return null;
  return {
    ja: zaehleAntworten(terminId, 'Ja'),
    nein: zaehleAntworten(terminId, 'Nein'),
    vielleicht: zaehleAntworten(terminId, 'Vielleicht')
  };
}

function rueckmeldungText(terminId) {
  const votes = hauptVotes(terminId);
  if (votes.length === 0) return null;
  const gesamt = votes.length;
  const kader  = alleSpieler.length || minSpieler();
  return { gesamt, kader, fehlen: Math.max(0, kader - gesamt) };
}

function rueckmeldungAlt(altTermine) {
  if (!altTermine || altTermine.length === 0) return '';
  const kader = alleSpieler.length || minSpieler();
  const aktiveIds = kaderIds();
  return altTermine.map(function(at, i) {
    const gesamt  = alleVerfueg.filter(v => v.alternativtermin_id === at.id && aktiveIds.has(v.spieler_id)).length;
    const fehlen  = Math.max(0, kader - gesamt);
    const ad      = fmt(at.datum, { day:'2-digit', month:'2-digit' });
    const pill    = gesamt === 0 ? '<span class="pill pill-offen">offen</span>'
                  : fehlen === 0 ? '<span class="pill pill-alle">alle ✓</span>'
                  : '<span class="pill pill-fehlen">' + fehlen + ' fehlen</span>';
    return '<div class="rm-alt" onclick="zeigeFehlende(\'' + uuidOderLeer(at.spieltermin_id) + '\',\'' + uuidOderLeer(at.id) + '\')">' +
      '<div class="rm-alt-titel">Alt.' + (i+1) + ' · ' + esc(ad) + '</div>' +
      '<div class="rm-zahl">' + gesamt + ' / ' + kader + '</div>' + pill +
    '</div>';
  }).join('');
}

function antwortBadges(ja, viel, nein, klein) {
  const k = klein ? ' pill-k' : '';
  const badge = (art, text) => '<span class="pill pill-' + art + k + '"><span class="pill-punkt"></span>' + text + '</span>';
  return badge('ja', ja + ' Ja') + badge('viel', viel + ' Vllt.') + badge('nein', nein + ' Nein');
}

// ============================================================
// Tabelle
// ============================================================
function renderTabelle() {
  waTexte = {};
  if (alleTermine.length === 0) {
    document.getElementById('table-container').innerHTML =
      '<div class="loading" style="padding:40px">Keine Spieltermine in der ' + esc(aktiveHalbrunde) + ' ' + esc(aktiveSaison || '') + ' vorhanden.' +
      (istAdmin && aktiveHalbrunde === 'Rückrunde' ? '<br><span style="font-size:13px">Termine können über „Termine importieren“ als CSV eingelesen werden.</span>' : '') +
      '</div>';
    return;
  }

  const rows = alleTermine.map(function(t) {
    const tid = uuidOderLeer(t.id);
    const wt  = fmt(t.datum, { weekday: 'short' });
    const dt  = fmt(t.datum, { day:'2-digit', month:'2-digit', year:'2-digit' });
    const u   = t.uhrzeit ? uhr(t.uhrzeit) + ' Uhr' : '';
    const txt = ampelText(t.id);
    const rm  = rueckmeldungText(t.id);
    const link = abfrageLink(t.abfrage_token);
    const ampel = ampelKlasse(t.id);

    waTexte['t:' + t.id] = SPTexte.abfrageText({
      heim: t.heim, gegner: t.gegner,
      datumLang: fmt(t.datum, { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' }),
      uhrzeit: u, link: link, mfName: aktiveMannschaft && aktiveMannschaft.mf_name
    });

    const statusBadge = t.status === 'Verschoben'
      ? '<span class="datum-status">· ALTERNATIVTERMIN</span>'
      : t.status === 'Verschiebung nötig'
      ? '<span class="datum-status noetig">· VERSCHIEBUNG NÖTIG</span>'
      : '';

    const altTermineInfo = alleAlternativtermine.filter(a => a.spieltermin_id === t.id);
    const aktiveIds = kaderIds();

    const altInfo = altTermineInfo.length > 0
      ? altTermineInfo.map(function(at, i) {
          const ad   = fmt(at.datum, { weekday:'short', day:'2-digit', month:'2-digit' });
          const auhr = uhr(at.uhrzeit);
          const av   = alleVerfueg.filter(v => v.alternativtermin_id === at.id && aktiveIds.has(v.spieler_id));
          return '<div class="alt-box">' +
            '<div class="alt-box-titel">Alt.' + (i+1) + ': ' + esc(ad) + (auhr ? ' · ' + esc(auhr) + ' Uhr' : '') + '</div>' +
            '<div class="badges">' +
              antwortBadges(av.filter(v => v.antwort === 'Ja').length, av.filter(v => v.antwort === 'Vielleicht').length, av.filter(v => v.antwort === 'Nein').length, true) +
            '</div>' +
          '</div>';
        }).join('')
      : '';

    // Nur 'Verschiebung nötig' gilt als offen; 'Verschoben' ist ein vollwertiger Termin.
    const istAlternativ = t.status === 'Verschiebung nötig';
    // Kritisch: zu wenige Zusagen für die Mindeststärke (wie Kennzahl „Zu wenig“)
    const istKritisch   = !istAlternativ && (ampel === 'crit' || ampel === 'warn');
    const zeilenKlasse  = istAlternativ ? 'zeile-offen-verlegung' : istKritisch ? 'zeile-kritisch' : '';

    let datumBlock;
    if (istAlternativ && altTermineInfo.length > 0) {
      const altDaten = altTermineInfo.map(function(at, i) {
        const ad   = fmt(at.datum, { weekday:'short', day:'2-digit', month:'2-digit', year:'2-digit' });
        const auhr = uhr(at.uhrzeit);
        return '<div class="datum-alt">↔ Alt.' + (i+1) + ': ' + esc(ad) + (auhr ? ' ' + esc(auhr) + ' Uhr' : '') + '</div>';
      }).join('');
      datumBlock = '<div class="datum-block">' +
        '<div class="datum-main datum-alt-alt">' + esc(wt) + ', ' + esc(dt) + '</div>' +
        altDaten +
      '</div>';
    } else {
      datumBlock = '<div class="datum-block"><div class="datum-main">' + esc(wt) + ', ' + esc(dt) + statusBadge + '</div>' +
        (u ? '<div class="datum-sub">' + SYM.uhr() + esc(u) + '</div>' : '') + '</div>';
    }

    const verlegung = istKritisch
      ? '<button class="ak-verlegung" onclick="meldeVerschiebung(\'' + tid + '\')" title="Zu wenige Zusagen – Alternativtermin prüfen" aria-label="Verlegung prüfen">' + SYM.warnung() + 'Verlegung prüfen</button>'
      : '';
    const aktionButtons = istAlternativ
      ? '<button class="ak ak-alt" onclick="meldeVerschiebung(\'' + tid + '\')" title="Alternativtermin läuft" aria-label="Alternativtermin">' + SYM.tausch() + '</button>'
      : verlegung +
        '<a class="ak ak-link" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer" title="Abfragelink öffnen" aria-label="Link öffnen">' + SYM.link() + '</a>' +
        '<button class="ak ak-wa" onclick="kopierenWA(this, \'t:' + tid + '\')" title="WhatsApp-Text kopieren" aria-label="WhatsApp">' + SYM.whatsapp() + '</button>' +
        '<button class="ak ak-alt" onclick="meldeVerschiebung(\'' + tid + '\')" title="Alternativtermin" aria-label="Alternativtermin">' + SYM.tausch() + '</button>' +
        '<button class="ak ak-auf" onclick="zeigeAufstellung(\'' + tid + '\')" title="Aufstellung festlegen" aria-label="Aufstellung">' + SYM.team() + '</button>';

    const rueckmeldung = istAlternativ && altTermineInfo.length > 0
      ? rueckmeldungAlt(altTermineInfo)
      : rm
        ? '<button class="rm-knopf" onclick="zeigeFehlende(\'' + tid + '\',null)" title="Rückmeldungen anzeigen">' +
            '<span class="rm-zahl' + (rm.fehlen === 0 ? ' voll' : '') + '">' + rm.gesamt + ' / ' + rm.kader + '</span>' +
            (rm.fehlen === 0 ? '<span class="pill pill-alle">✓ alle</span>' : '<span class="pill pill-fehlen">' + rm.fehlen + ' fehlen</span>') +
          '</button>'
        : '<button class="rm-knopf rm-leer" onclick="zeigeFehlende(\'' + tid + '\',null)" title="Rückmeldungen anzeigen">–</button>';

    return '<tr class="' + zeilenKlasse + '">' +
      '<td><div class="zelle-datum">' + SYM.kalender() + datumBlock + '</div></td>' +
      '<td><span class="pill ' + (t.heim ? 'pill-heim' : 'pill-ausw') + '">' + (t.heim ? 'Heim' : 'Auswärts') + '</span></td>' +
      '<td><div class="zelle-gegner">' + SYM.wappen() + '<span class="gegner-name">' + esc(t.gegner) + '</span>' +
        (alleAufstellungen.some(a => a.spieltermin_id === t.id)
          ? '<span class="pill pill-auf" title="Aufstellung gesetzt">✓ Aufstellung</span>'
          : '') +
      '</div></td>' +
      '<td>' + (txt
        ? '<div class="badges">' + antwortBadges(txt.ja, txt.vielleicht, txt.nein, false) + '</div>'
        : '<span class="rm-leer">–</span>') + altInfo + '</td>' +
      '<td>' + rueckmeldung + '</td>' +
      '<td><div class="aktionen">' + aktionButtons + '</div></td>' +
    '</tr>';
  }).join('');

  document.getElementById('table-container').innerHTML =
    '<div class="tabellen-rahmen"><div class="table-scroll">' +
    '<table class="spielplan-table">' +
      '<thead><tr>' +
        '<th>Datum</th><th>H/A</th><th>Gegner</th><th>Verfügbarkeit</th><th>Rückmeldung</th><th style="text-align:right">Aktion</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>' +
    '</div></div>';
}

// ============================================================
// Verschiebungslogik
// ============================================================
async function meldeVerschiebung(terminId) {
  const termin = alleTermine.find(t => t.id === terminId);
  if (!termin) return;
  try {
    if (istAdmin) await zeigeAdminVerschiebungsModal(termin);
    else          await zeigeMFVerschiebungsModal(termin);
  } catch (err) {
    meldeFehler(err, 'Alternativtermine konnten nicht geladen werden');
  }
}

function altListeHtml(termin, liste) {
  if (!liste || liste.length === 0)
    return '<div style="font-size:13px;color:#8996B4;font-style:italic">Noch keine Alternativtermine eingetragen.</div>';
  return liste.map(function(at, i) {
    const ad   = fmt(at.datum, { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric' });
    const auhr = at.uhrzeit ? uhr(at.uhrzeit) + ' Uhr' : '';
    waTexte['a:' + at.id] = SPTexte.ausweichText({
      heim: termin.heim, gegner: termin.gegner, datumLang: ad, uhrzeit: auhr,
      link: altLink(at.abfrage_token), mfName: aktiveMannschaft && aktiveMannschaft.mf_name
    });
    return '<div style="background:#1e3048;border-radius:8px;padding:12px 14px;display:grid;gap:8px;margin-bottom:8px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<div style="font-weight:700;color:#F7F9FF;font-size:14px">Alternative ' + (i+1) + ': ' + esc(ad) + (auhr ? ' · ' + esc(auhr) : '') + '</div>' +
        '<button onclick="loescheAlternativtermin(\'' + uuidOderLeer(at.id) + '\')" style="background:none;border:none;color:#8996B4;cursor:pointer;font-size:16px" title="Löschen" aria-label="Alternativtermin löschen">🗑</button>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button onclick="kopierenWA(this,\'a:' + uuidOderLeer(at.id) + '\')" ' +
          'style="padding:5px 10px;border-radius:6px;background:#25D366;border:none;color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:Calibri,sans-serif">' +
          '💬 WhatsApp-Link kopieren' +
        '</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function zeigeMFVerschiebungsModal(termin) {
  const altTermine = pruefe(await sb.from('alternativtermine')
    .select(SPALTEN.alt).eq('spieltermin_id', termin.id).order('datum'));
  const d   = fmt(termin.datum, { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
  const tid = uuidOderLeer(termin.id);
  const bedarf = termin.status === 'Verschiebung nötig';

  modalOeffnen(
    '<div style="background:#152232;border:1px solid rgba(255,255,255,0.12);border-radius:16px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto">' +
      '<div style="padding:18px 22px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#152232;z-index:1">' +
        '<div>' +
          '<div style="font-family:Bahnschrift SemiBold,sans-serif;font-size:16px;color:#F07830">Verschiebung – Alternativtermine</div>' +
          '<div style="font-size:13px;color:#8996B4;margin-top:2px">' + (termin.heim?'Heimspiel':'Auswärtsspiel') + ' gegen ' + esc(termin.gegner) + ' · ' + esc(d) + '</div>' +
        '</div>' + X_BTN +
      '</div>' +
      '<div style="padding:20px 22px;display:grid;gap:16px">' +
        '<div>' +
          '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;color:#8996B4;margin-bottom:10px">Alternativtermine</div>' +
          '<div id="alt-liste">' + altListeHtml(termin, altTermine) + '</div>' +
        '</div>' +
        '<div style="background:#1e3048;border-radius:8px;padding:14px">' +
          '<div style="font-size:12px;font-weight:700;color:#1D9E75;margin-bottom:10px">+ Alternativtermin hinzufügen</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
            '<div>' +
              '<label for="alt-datum" style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;color:#8996B4;margin-bottom:6px">Datum</label>' +
              '<input type="date" id="alt-datum" style="width:100%;padding:9px 12px;background:#0D1B2A;border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#F7F9FF;font-family:Calibri,sans-serif;font-size:13px;outline:none">' +
            '</div>' +
            '<div>' +
              '<label for="alt-uhrzeit" style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;color:#8996B4;margin-bottom:6px">Uhrzeit</label>' +
              '<input type="time" id="alt-uhrzeit" value="14:30" style="width:100%;padding:9px 12px;background:#0D1B2A;border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#F7F9FF;font-family:Calibri,sans-serif;font-size:13px;outline:none">' +
            '</div>' +
          '</div>' +
          '<button onclick="speichereAlternativtermin(\'' + tid + '\', this)" style="width:100%;margin-top:12px;padding:10px;background:#1D9E75;color:#fff;border:none;border-radius:8px;font-family:Bahnschrift SemiBold,Calibri,sans-serif;font-size:14px;cursor:pointer">Termin hinzufügen</button>' +
        '</div>' +
        '<div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:14px">' +
          '<button onclick="meldeVerschiebungsBedarf(\'' + tid + '\')" style="width:100%;padding:10px;background:' +
            (bedarf ? 'rgba(212,98,10,0.3)' : 'rgba(212,98,10,0.15)') +
            ';color:#F07830;border:1px solid rgba(212,98,10,0.35);border-radius:8px;font-family:Calibri,sans-serif;font-size:14px;font-weight:700;cursor:pointer">' +
            (bedarf ? '⚠️ Verschiebungsbedarf zurückziehen' : '↔️ Verschiebungsbedarf beim Admin melden') +
          '</button>' +
        '</div>' +
      '</div>' +
    '</div>');
}

async function speichereAlternativtermin(terminId, btn) {
  const datumWert = document.getElementById('alt-datum').value;
  const uhrzeit   = document.getElementById('alt-uhrzeit').value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datumWert)) { alert('Bitte ein gültiges Datum eingeben.'); return; }
  if (uhrzeit && !/^\d{2}:\d{2}$/.test(uhrzeit)) { alert('Bitte eine gültige Uhrzeit eingeben.'); return; }
  if (btn) btn.disabled = true;

  try {
    // Token wird serverseitig erzeugt (Trigger), nicht im Browser
    pruefe(await sb.from('alternativtermine').insert({ spieltermin_id: terminId, datum: datumWert, uhrzeit: uhrzeit || null }));
    const neu = pruefe(await sb.from('alternativtermine').select(SPALTEN.alt).eq('spieltermin_id', terminId).order('datum'));
    const termin = alleTermine.find(t => t.id === terminId);
    const liste = document.getElementById('alt-liste');
    if (liste && termin) liste.innerHTML = altListeHtml(termin, neu);
    document.getElementById('alt-datum').value = '';
    alleAlternativtermine = alleAlternativtermine.filter(a => a.spieltermin_id !== terminId).concat(neu);
  } catch (err) {
    meldeFehler(err, 'Alternativtermin konnte nicht gespeichert werden');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function loescheAlternativtermin(altId) {
  if (!confirm('Alternativtermin und alle Abstimmungen dazu löschen?')) return;
  try {
    // Abstimmungen werden per Fremdschlüssel (ON DELETE CASCADE) mitgelöscht
    pruefe(await sb.from('alternativtermine').delete().eq('id', altId));
  } catch (err) {
    meldeFehler(err, 'Löschen fehlgeschlagen');
    return;
  }
  modalSchliessen();
  await ladeMannschaft(aktiveMannschaft.id);
}

async function meldeVerschiebungsBedarf(terminId) {
  const termin = alleTermine.find(t => t.id === terminId);
  if (!termin) return;
  const neuerStatus = termin.status === 'Verschiebung nötig' ? 'Geplant' : 'Verschiebung nötig';
  try {
    pruefe(await sb.from('spieltermine').update({ status: neuerStatus }).eq('id', terminId));
  } catch (err) {
    meldeFehler(err, 'Status konnte nicht geändert werden');
    return;
  }
  modalSchliessen();
  await ladeMannschaft(aktiveMannschaft.id);
}

async function zeigeAdminVerschiebungsModal(termin) {
  const altTermine = pruefe(await sb.from('alternativtermine')
    .select(SPALTEN.alt).eq('spieltermin_id', termin.id).order('datum'));
  alleAlternativtermine = alleAlternativtermine.filter(a => a.spieltermin_id !== termin.id).concat(altTermine);
  const aktiveIds = kaderIds();
  const altIds = altTermine.map(a => a.id);
  const votes = altIds.length
    ? pruefe(await sb.from('verfuegbarkeiten').select('alternativtermin_id, spieler_id, antwort').in('alternativtermin_id', altIds))
    : [];
  altTermine.forEach(at => {
    const g = votes.filter(v => v.alternativtermin_id === at.id && aktiveIds.has(v.spieler_id));
    at._ja = g.filter(v => v.antwort === 'Ja').length;
    at._vielleicht = g.filter(v => v.antwort === 'Vielleicht').length;
    at._nein = g.filter(v => v.antwort === 'Nein').length;
  });

  const d   = fmt(termin.datum, { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
  const tid = uuidOderLeer(termin.id);
  const min = minSpieler();

  const altHtml = altTermine.length > 0
    ? altTermine.map(function(at, i) {
        const ad = fmt(at.datum, { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
        const auhr = at.uhrzeit ? uhr(at.uhrzeit) + ' Uhr' : '';
        return '<div style="background:#1e3048;border-radius:10px;padding:14px 16px;border:1px solid rgba(255,255,255,0.08)">' +
          '<div style="font-weight:700;color:#F7F9FF;font-size:14px;margin-bottom:6px">Alternative ' + (i+1) + ': ' + esc(ad) + (auhr ? ' · ' + esc(auhr) : '') + '</div>' +
          '<div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap">' +
            '<span style="background:rgba(29,158,117,0.15);color:#4FD4A8;padding:3px 10px;border-radius:12px;font-size:13px;font-weight:700">' + at._ja + ' Ja</span>' +
            '<span style="background:rgba(240,180,41,0.12);color:#F0C060;padding:3px 10px;border-radius:12px;font-size:13px;font-weight:700">' + at._vielleicht + ' Vielleicht</span>' +
            '<span style="background:rgba(226,75,74,0.12);color:#F08080;padding:3px 10px;border-radius:12px;font-size:13px;font-weight:700">' + at._nein + ' Nein</span>' +
            (at._ja >= min ? '' : '<span style="color:#8996B4;font-size:12px;align-self:center">(min. ' + min + ' Ja nötig)</span>') +
          '</div>' +
          '<button onclick="bestaetigeAlternativtermin(\'' + tid + '\',\'' + uuidOderLeer(at.id) + '\')" ' +
            'style="width:100%;padding:10px;background:#1D9E75;color:#fff;border:none;border-radius:8px;font-family:Bahnschrift SemiBold,Calibri,sans-serif;font-size:14px;cursor:pointer">' +
            '✓ Diesen Termin als neuen Spieltermin bestätigen' +
          '</button>' +
        '</div>';
      }).join('')
    : '<div style="font-size:13px;color:#8996B4;font-style:italic">Noch keine Alternativtermine vom MF eingetragen.</div>';

  // Admin kann ebenfalls Alternativtermine anlegen (wie der MF)
  modalOeffnen(
    '<div style="background:#152232;border:1px solid rgba(255,255,255,0.12);border-radius:16px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto">' +
      '<div style="padding:18px 22px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#152232">' +
        '<div>' +
          '<div style="font-family:Bahnschrift SemiBold,sans-serif;font-size:16px;color:#F07830">Admin – Verschiebung bestätigen</div>' +
          '<div style="font-size:13px;color:#8996B4;margin-top:2px">' + (termin.heim?'Heimspiel':'Auswärtsspiel') + ' gegen ' + esc(termin.gegner) + ' · ' + esc(d) + '</div>' +
        '</div>' + X_BTN +
      '</div>' +
      '<div style="padding:20px 22px;display:grid;gap:14px">' +
        '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;color:#8996B4">Abstimmungsergebnisse</div>' +
        altHtml +
        '<div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:14px">' +
          '<div style="font-size:12px;color:#8996B4;margin-bottom:10px;font-weight:700">Oder: Eigenen Termin eintragen</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
            '<input type="date" id="admin-datum" aria-label="Datum" style="padding:9px 12px;background:#1e3048;border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#F7F9FF;font-family:Calibri,sans-serif;font-size:13px;outline:none">' +
            '<input type="time" id="admin-uhrzeit" aria-label="Uhrzeit" value="14:30" style="padding:9px 12px;background:#1e3048;border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#F7F9FF;font-family:Calibri,sans-serif;font-size:13px;outline:none">' +
          '</div>' +
          '<button onclick="bestaetigeEigenerTermin(\'' + tid + '\')" style="width:100%;margin-top:10px;padding:10px;background:#D4620A;color:#fff;border:none;border-radius:8px;font-family:Bahnschrift SemiBold,Calibri,sans-serif;font-size:14px;cursor:pointer">Eigenen Termin bestätigen</button>' +
        '</div>' +
      '</div>' +
    '</div>');
}

async function bestaetigeAlternativtermin(terminId, altId) {
  const alt = alleAlternativtermine.find(a => a.id === altId);
  if (!alt) { alert('Alternativtermin nicht gefunden – bitte Seite neu laden.'); return; }
  if (!confirm('Diesen Alternativtermin als neuen Spieltermin bestätigen?\nDie Abstimmung zu diesem Termin wird übernommen, die übrigen Alternativtermine werden gelöscht.')) return;
  await _verschiebungFertigstellen(terminId, alt.datum, alt.uhrzeit, altId);
}

async function bestaetigeEigenerTermin(terminId) {
  const datumWert = document.getElementById('admin-datum').value;
  const uhrzeit   = document.getElementById('admin-uhrzeit').value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datumWert)) { alert('Bitte ein gültiges Datum eingeben.'); return; }
  if (!confirm('Neuen Termin bestätigen?\nAlle Alternativtermine und alten Abstimmungen werden gelöscht.')) return;
  await _verschiebungFertigstellen(terminId, datumWert, uhrzeit, null);
}

// Eine Serverfunktion in EINER Transaktion (vorher 5 einzelne Schritte).
// Mit Stimmen-Übernahme bleibt der Link gültig, sonst erzeugt der Server einen neuen.
async function _verschiebungFertigstellen(terminId, datumWert, uhrzeit, uebernahmeAltId) {
  try {
    pruefe(await sb.rpc('verschiebung_abschliessen', {
      p_spieltermin_id: terminId,
      p_datum: datumWert,
      p_uhrzeit: uhrzeit ? String(uhrzeit).slice(0, 5) : null,
      p_alternativtermin_id: uebernahmeAltId
    }));
  } catch (err) {
    meldeFehler(err, 'Verschiebung konnte nicht abgeschlossen werden');
    return;
  }
  modalSchliessen();
  await ladeMannschaft(aktiveMannschaft.id);
  alert(uebernahmeAltId
    ? '✓ Termin bestätigt. Die Abstimmung wurde übernommen – der bestehende Link gilt weiter für die noch fehlenden Spieler.'
    : '✓ Termin bestätigt. Der MF kann jetzt den neuen WhatsApp-Link schicken.');
}

// ============================================================
// Aufstellung – Modal
// ============================================================
function zeigeAufstellung(terminId) {
  const termin = alleTermine.find(t => t.id === terminId);
  if (!termin) return;

  const min = minSpieler();

  // Ersatz aus der 3. Mannschaft: nur für die 2. Mannschaft, Platzhalter-Slot
  const dritteMannschaft = alleMannschaften.find(m => m.name === '3. Mannschaft');
  const zeigeErsatzOption = aktiveMannschaft?.name === '2. Mannschaft' && !!dritteMannschaft;
  const vorhandeneErsatzAnzahl = alleAufstellungen.filter(
    a => a.spieltermin_id === terminId && a.ersatz_mannschaft_id != null
  ).length;

  function ersatzRowHtml() {
    return '<div class="auf-ersatz-row" style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:rgba(212,98,10,0.12);border:1px solid rgba(212,98,10,0.3);border-radius:8px;margin-bottom:6px">' +
      '<input type="checkbox" class="auf-check auf-check-ersatz" checked disabled style="width:18px;height:18px;accent-color:#D4620A;flex-shrink:0">' +
      '<span style="flex:1;font-size:14px;color:#F07830;font-weight:700">Ersatz · 3. Mannschaft</span>' +
      '<button type="button" class="auf-ersatz-entfernen" title="Entfernen" aria-label="Ersatz entfernen" style="background:none;border:none;color:#8996B4;cursor:pointer;font-size:16px;line-height:1;padding:2px 4px">✕</button>' +
    '</div>';
  }

  const ersatzListeHtml = Array(vorhandeneErsatzAnzahl).fill(0).map(ersatzRowHtml).join('');
  function posLabel(sp) { return sp.position != null ? sp.position + '.' : '–'; }

  const antwortVon = (sid) => {
    const v = alleVerfueg.find(v => v.spieltermin_id === terminId && v.spieler_id === sid && v.alternativtermin_id == null);
    return v ? v.antwort : '';
  };

  const waehlbar = alleSpieler
    .filter(s => { const a = antwortVon(s.id); return a === 'Ja' || a === 'Vielleicht'; })
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99));

  const gesetzt = new Set(
    alleAufstellungen.filter(a => a.spieltermin_id === terminId).map(a => a.spieler_id)
  );

  const d = fmt(termin.datum, { weekday:'long', day:'2-digit', month:'2-digit' }) +
            (termin.uhrzeit ? ' · ' + uhr(termin.uhrzeit) + ' Uhr' : '');
  const titel = 'Aufstellung · ' + (termin.heim?'Heim':'Auswärts') + ' gegen ' + termin.gegner;

  function spielerRow(s) {
    const a = antwortVon(s.id);
    const antFarbe = a === 'Ja' ? '#4FD4A8' : '#F0C060';
    const checked = gesetzt.has(s.id) ? 'checked' : '';
    return '<label class="auf-row" style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:#1e3048;border-radius:8px;margin-bottom:6px;cursor:pointer">' +
      '<input type="checkbox" class="auf-check" value="' + esc(s.id) + '" ' + checked + ' style="width:18px;height:18px;accent-color:#1D9E75;cursor:pointer;flex-shrink:0">' +
      '<span style="font-family:IBM Plex Mono,monospace;font-size:12px;font-weight:700;color:#F07830;min-width:26px">' + esc(posLabel(s)) + '</span>' +
      '<span style="flex:1;font-size:14px;color:#F7F9FF">' + esc(SPS.anzeigeName(s.name)) + '</span>' +
      '<span style="font-size:11px;font-weight:700;color:' + antFarbe + '">' + esc(a) + '</span>' +
      (s.ttr != null ? '<span style="font-size:11px;color:#8996B4;font-family:monospace;min-width:34px;text-align:right">' + esc(s.ttr) + '</span>' : '<span style="min-width:34px"></span>') +
    '</label>';
  }

  const listeHtml = waehlbar.length === 0
    ? '<div style="font-size:13px;color:#8996B4;padding:16px 0;text-align:center">Noch keine Ja/Vielleicht-Zusagen für diesen Spieltag.</div>'
    : waehlbar.map(spielerRow).join('');

  const modal = modalOeffnen(
    '<div style="background:#152232;border:1px solid rgba(255,255,255,0.12);border-radius:16px;max-width:500px;width:100%;max-height:85vh;overflow-y:auto;display:flex;flex-direction:column">' +
      '<div style="padding:18px 20px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#152232;z-index:2">' +
        '<div>' +
          '<div style="font-family:Bahnschrift SemiBold,sans-serif;font-size:15px;color:#F07830">' + esc(titel) + '</div>' +
          '<div style="font-size:12px;color:#8996B4;margin-top:2px">' + esc(d) + '</div>' +
        '</div>' + X_BTN +
      '</div>' +
      '<div style="padding:16px 20px;flex:1">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
          '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;color:#8996B4">Verfügbare Spieler (Ja / Vielleicht)</div>' +
          '<div id="auf-counter" style="font-size:12px;font-weight:700;color:#8996B4">0 / ' + min + '</div>' +
        '</div>' +
        listeHtml +
        '<div id="auf-ersatz-liste">' + ersatzListeHtml + '</div>' +
        (zeigeErsatzOption
          ? '<button type="button" id="auf-ersatz-add" style="margin-top:2px;padding:8px 14px;border-radius:8px;border:1px dashed rgba(212,98,10,0.5);background:rgba(212,98,10,0.06);color:#F07830;font-size:12px;font-weight:700;cursor:pointer;font-family:Calibri,sans-serif">+ Ersatz 3. Mannschaft hinzufügen</button>'
          : '') +
      '</div>' +
      '<div style="padding:14px 20px;border-top:1px solid rgba(255,255,255,0.1);display:flex;gap:10px;justify-content:flex-end;position:sticky;bottom:0;background:#152232">' +
        '<button onclick="this.closest(\'.sp-modal\').remove()" style="padding:9px 16px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:transparent;color:#8996B4;font-size:13px;font-weight:700;cursor:pointer;font-family:Calibri,sans-serif">Abbrechen</button>' +
        '<button id="auf-save" onclick="speichereAufstellung(\'' + uuidOderLeer(terminId) + '\', this)" style="padding:9px 18px;border-radius:8px;border:none;background:#1D9E75;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:Calibri,sans-serif">Aufstellung speichern</button>' +
      '</div>' +
    '</div>');

  const checks = () => Array.from(modal.querySelectorAll('.auf-check'));
  const counter = modal.querySelector('#auf-counter');
  const saveBtn = modal.querySelector('#auf-save');

  function updateCounter() {
    const n = checks().filter(c => c.checked).length;
    counter.textContent = n + ' / ' + min;
    counter.style.color = n === min ? '#4FD4A8' : n > min ? '#F08080' : '#8996B4';
    saveBtn.disabled = (n !== min);
    saveBtn.style.opacity = (n === min) ? '1' : '0.5';
    saveBtn.style.cursor  = (n === min) ? 'pointer' : 'not-allowed';
  }

  checks().forEach(c => c.addEventListener('change', () => {
    const n = checks().filter(x => x.checked).length;
    if (n > min) { c.checked = false; return; }
    updateCounter();
  }));

  const ersatzListe = modal.querySelector('#auf-ersatz-liste');
  const ersatzAddBtn = modal.querySelector('#auf-ersatz-add');
  function wireErsatzEntfernen(row) {
    row.querySelector('.auf-ersatz-entfernen').addEventListener('click', () => { row.remove(); updateCounter(); });
  }
  ersatzListe.querySelectorAll('.auf-ersatz-row').forEach(wireErsatzEntfernen);
  if (ersatzAddBtn) {
    ersatzAddBtn.addEventListener('click', () => {
      if (checks().filter(x => x.checked).length >= min) return;
      ersatzListe.insertAdjacentHTML('beforeend', ersatzRowHtml());
      wireErsatzEntfernen(ersatzListe.lastElementChild);
      updateCounter();
    });
  }
  updateCounter();
}

async function speichereAufstellung(terminId, btn) {
  const modal = btn.closest('.sp-modal');
  const gewaehlt = Array.from(modal.querySelectorAll('.auf-check:not(.auf-check-ersatz)'))
    .filter(c => c.checked).map(c => c.value).filter(SPS.istUuid);
  const ersatzAnzahl = modal.querySelectorAll('.auf-ersatz-row').length;
  const min = minSpieler();
  if (gewaehlt.length + ersatzAnzahl !== min) {
    alert('Bitte genau ' + min + ' Spieler/Ersatz auswählen.');
    return;
  }
  const dritteMannschaft = alleMannschaften.find(m => m.name === '3. Mannschaft');
  if (ersatzAnzahl > 0 && !dritteMannschaft) {
    alert('3. Mannschaft nicht gefunden – Ersatz kann nicht gespeichert werden.');
    return;
  }

  btn.disabled = true; btn.textContent = 'Speichert...';
  try {
    // Löschen + Einfügen in EINER Transaktion auf dem Server
    pruefe(await sb.rpc('aufstellung_speichern', {
      p_spieltermin_id: terminId,
      p_spieler_ids: gewaehlt,
      p_ersatz_mannschaft_id: ersatzAnzahl > 0 ? dritteMannschaft.id : null,
      p_ersatz_anzahl: ersatzAnzahl
    }));
    alleAufstellungen = alleAufstellungen.filter(a => a.spieltermin_id !== terminId);
    gewaehlt.forEach(sid => alleAufstellungen.push({ spieltermin_id: terminId, spieler_id: sid, ersatz_mannschaft_id: null }));
    for (let i = 0; i < ersatzAnzahl; i++) {
      alleAufstellungen.push({ spieltermin_id: terminId, spieler_id: null, ersatz_mannschaft_id: dritteMannschaft.id });
    }
    modal.remove();
    renderTabelle();
  } catch (err) {
    meldeFehler(err, 'Fehler beim Speichern');
    btn.disabled = false; btn.textContent = 'Aufstellung speichern';
  }
}

// ============================================================
// Rückmeldungen anzeigen (inkl. Anmerkungen) + Erinnerung
// ============================================================
function zeigeFehlende(terminId, altTerminId) {
  const termin = alleTermine.find(t => t.id === terminId);
  if (!termin) return;
  const altTermin = altTerminId ? alleAlternativtermine.find(a => a.id === altTerminId) : null;

  const passend = v => v.spieltermin_id === terminId &&
    (altTerminId ? v.alternativtermin_id === altTerminId : v.alternativtermin_id == null);
  const hatGeantwortet = new Set(alleVerfueg.filter(passend).map(v => v.spieler_id));
  const nochNicht = alleSpieler.filter(s => !hatGeantwortet.has(s.id));
  const haben     = alleSpieler.filter(s => hatGeantwortet.has(s.id));

  const d = altTermin
    ? fmt(altTermin.datum, { weekday:'long', day:'2-digit', month:'2-digit' }) + (altTermin.uhrzeit ? ' · ' + uhr(altTermin.uhrzeit) + ' Uhr' : '')
    : fmt(termin.datum, { weekday:'long', day:'2-digit', month:'2-digit' });

  const titel = (altTermin ? 'Alternativtermin · ' : 'Rückmeldungen · ') + (termin.heim?'Heim':'Auswärts') + ' gegen ' + termin.gegner;

  if (nochNicht.length > 0) {
    waTexte['e:' + (altTerminId || terminId)] = SPTexte.erinnerungText({
      namen: nochNicht.map(s => SPS.anzeigeName(s.name).split(' ')[0]),
      heim: termin.heim, gegner: termin.gegner, datumLang: d, uhrzeit: '',
      link: altTermin ? altLink(altTermin.abfrage_token) : abfrageLink(termin.abfrage_token),
      mfName: aktiveMannschaft && aktiveMannschaft.mf_name
    });
  }

  // Lage des Termins (gleiche Regeln wie die Ampel in der Übersicht)
  const votes = alleVerfueg.filter(v => passend(v) && kaderIds().has(v.spieler_id));
  const zahl  = a => votes.filter(v => v.antwort === a).length;
  const ja = zahl('Ja'), viel = zahl('Vielleicht'), nein = zahl('Nein');
  const min = minSpieler();
  const lage = votes.length === 0 ? 'offen' : ja >= min ? 'ok' : ja >= min - 2 ? 'warn' : 'crit';
  const lageText = {
    offen: ['Noch keine Rückmeldungen', 'Abfragelink per WhatsApp verschicken.'],
    ok:    ['Spielbereit', ja + ' Zusagen – Mindeststärke ' + min + ' erreicht.'],
    warn:  ['Knapp – zu wenig Zusagen', ja + ' von mindestens ' + min + ' Zusagen. Noch ' + (min - ja) + ' fehlen.'],
    crit:  ['Kritisch – Verlegung prüfen', ja + ' von mindestens ' + min + ' Zusagen. Noch ' + (min - ja) + ' fehlen.']
  }[lage];
  const lageSym = lage === 'ok' ? SYM.haken() : lage === 'offen' ? SYM.uhr() : SYM.warnung();
  const verlegenKnopf = (lage === 'crit' || lage === 'warn') && !altTermin && termin.status !== 'Verschiebung nötig'
    ? '<button class="knopf knopf-gefahr knopf-klein" onclick="this.closest(\'.sp-modal\').remove();meldeVerschiebung(\'' + uuidOderLeer(terminId) + '\')">' + SYM.tausch('sym-s') + 'Alternativtermin</button>'
    : '';

  const initialen = n => SPS.anzeigeName(n).split(' ').filter(Boolean).slice(0, 2).map(w => w.charAt(0)).join('').toUpperCase();
  const pillArt = { 'Ja': 'ja', 'Vielleicht': 'viel', 'Nein': 'nein' };

  const fehlenHtml = nochNicht.length === 0
    ? '<div class="dt-alle">' + SYM.haken('sym-s') + 'Alle haben geantwortet!</div>'
    : nochNicht.map(s =>
        '<div class="rm-zeile">' +
          '<span class="rm-avatar">' + esc(initialen(s.name)) + '</span>' +
          '<div class="rm-text"><div class="rm-kopf">' +
            '<span class="rm-name">' + esc(SPS.anzeigeName(s.name)) + '</span>' +
            '<span class="rm-keine">Keine Antwort</span>' +
          '</div></div>' +
        '</div>'
      ).join('') +
      '<button class="knopf knopf-wa knopf-klein" style="margin-top:6px" onclick="kopierenWA(this,\'e:' + uuidOderLeer(altTerminId || terminId) + '\')">' + SYM.whatsapp('sym-s') + 'Erinnerung per WhatsApp</button>';

  const habenHtml = haben.map(s => {
    const v = alleVerfueg.find(v => passend(v) && v.spieler_id === s.id);
    const art = pillArt[v?.antwort] || 'viel';
    return '<div class="rm-zeile">' +
      '<span class="rm-avatar">' + esc(initialen(s.name)) + '</span>' +
      '<div class="rm-text">' +
        '<div class="rm-kopf">' +
          '<span class="rm-name">' + esc(SPS.anzeigeName(s.name)) + '</span>' +
          '<span class="pill pill-' + art + '"><span class="pill-punkt"></span>' + esc(v?.antwort || '–') + '</span>' +
        '</div>' +
        (v && v.anmerkung ? '<div class="rm-notiz">' + esc(v.anmerkung) + '</div>' : '') +
      '</div>' +
    '</div>';
  }).join('');

  const zeit = altTermin ? '' : (termin.uhrzeit ? uhr(termin.uhrzeit) + ' Uhr' : '');
  const dMitJahr = fmt(altTermin ? altTermin.datum : termin.datum, { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' }) +
    (altTermin && altTermin.uhrzeit ? ' · ' + uhr(altTermin.uhrzeit) + ' Uhr' : '');
  modalOeffnen(
    '<div class="dt">' +
      '<div class="dt-kopf">' +
        SYM.wappen() +
        '<div style="min-width:0">' +
          '<div class="dt-kicker">' +
            '<span class="pill ' + (termin.heim ? 'pill-heim' : 'pill-ausw') + '">' + (termin.heim ? 'Heim' : 'Auswärts') + '</span>' +
            '<span>' + esc(altTermin ? 'Alternativtermin' : 'Rückmeldungen') + '</span>' +

          '</div>' +
          '<div class="dt-titel" title="' + esc(titel) + '">' + esc(termin.gegner) + '</div>' +
          '<div class="dt-meta">' +
            '<span>' + SYM.kalender() + esc(dMitJahr) + '</span>' +
            (zeit ? '<span>' + SYM.uhr() + esc(zeit) + '</span>' : '') +
            (aktiveMannschaft ? '<span>' + SYM.team() + esc(aktiveMannschaft.name) + ' · ' + esc(aktiveMannschaft.liga) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<button class="dt-zu" onclick="this.closest(\'.sp-modal\').remove()" aria-label="Schließen">' + SYM.kreuz() + '</button>' +
      '</div>' +
      '<div class="dt-inhalt">' +
        '<div class="dt-lage ' + lage + '">' + lageSym +
          '<div><div class="dt-lage-titel">' + esc(lageText[0]) + '</div><div class="dt-lage-text">' + esc(lageText[1]) + '</div></div>' +
          verlegenKnopf +
        '</div>' +
        '<div class="dt-zahlen">' +
          '<div class="dt-zahl ja"><b>' + ja + '</b><span>Ja</span></div>' +
          '<div class="dt-zahl viel"><b>' + viel + '</b><span>Vielleicht</span></div>' +
          '<div class="dt-zahl nein"><b>' + nein + '</b><span>Nein</span></div>' +
          '<div class="dt-zahl offen"><b>' + nochNicht.length + '</b><span>Offen</span></div>' +
        '</div>' +
        (nochNicht.length > 0
          ? '<div class="dt-gruppe fehlt">Noch keine Antwort (' + nochNicht.length + ')</div>' +
            fehlenHtml +
            '<div class="dt-trenner"></div>'
          : fehlenHtml) +
        '<div class="dt-gruppe">Haben geantwortet (' + haben.length + ')</div>' +
        habenHtml +
      '</div>' +
    '</div>');
}

// ============================================================
// WhatsApp kopieren
// ============================================================
function kopierenWA(btn, schluessel) {
  const text = waTexte[schluessel];
  if (!text) { alert('Text nicht gefunden – bitte Seite neu laden.'); return; }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(function() {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
    });
  }
  btn.classList.add('kopiert');
  setTimeout(function() { btn.classList.remove('kopiert'); }, 2500);

  // Gruppe wählt der MF selbst – WhatsApp erlaubt keine Gruppen-Vorauswahl per Link
  window.open(SPTexte.whatsappUrl(text), '_blank', 'noopener');
}

// ============================================================
// CSV-Terminimport (nur Admin; Berechtigung prüft der Server)
// ============================================================
let importErgebnis = null;
let importMannschaften = [];

async function zeigeImportModal() {
  try {
    importMannschaften = pruefe(await sb.from('mannschaften').select('id, name, liga').order('name'));
  } catch (err) {
    meldeFehler(err, 'Mannschaften konnten nicht geladen werden');
    return;
  }
  importErgebnis = null;
  modalOeffnen(
    '<div style="background:#152232;border:1px solid rgba(255,255,255,0.12);border-radius:16px;max-width:760px;width:100%;max-height:90vh;overflow-y:auto">' +
      '<div style="padding:18px 22px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#152232;z-index:1">' +
        '<div>' +
          '<div style="font-family:Bahnschrift SemiBold,sans-serif;font-size:16px;color:#F07830">Spieltermine importieren (CSV)</div>' +
          '<div style="font-size:13px;color:#8996B4;margin-top:2px">Erst Vorschau und Prüfung – gespeichert wird nur nach Bestätigung.</div>' +
        '</div>' + X_BTN +
      '</div>' +
      '<div style="padding:18px 22px;display:grid;gap:14px">' +
        '<div style="font-size:13px;color:#CBD8E6;line-height:1.6">Spalten (Kopfzeile, Trenner ; oder ,): <code>Mannschaft;Datum;Uhrzeit;Heim/Auswärts;Gegner;Ort;Spieltag</code><br>' +
          'Mannschaft: ' + importMannschaften.map(m => '„' + esc(m.name) + '“').join(', ') + ' · Datum: TT.MM.JJJJ · Heim/Auswärts: H oder A</div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
          '<input type="file" id="import-datei" accept=".csv,text/csv" style="color:#CBD8E6;font-size:13px">' +
          '<label style="font-size:13px;color:#8996B4">Halbrunde ' +
            '<select id="import-halbrunde" style="padding:6px 10px;border-radius:8px;background:#1e3048;color:#F7F9FF;border:1px solid rgba(255,255,255,0.1)">' +
              '<option value="Rückrunde" selected>Rückrunde</option><option value="Vorrunde">Vorrunde</option>' +
            '</select></label>' +
          '<button onclick="pruefeImportDatei(this)" style="padding:8px 14px;border-radius:8px;background:#D4620A;border:none;color:#fff;font-weight:700;cursor:pointer;font-family:Calibri,sans-serif">Prüfen & Vorschau</button>' +
        '</div>' +
        '<div id="import-vorschau"></div>' +
      '</div>' +
    '</div>');
}

function importVorschauHtml(erg, serverFehler, serverWarnungen) {
  if (erg.fehlerGesamt.length) {
    return '<div class="config-hint" style="margin:0">' + erg.fehlerGesamt.map(esc).join('<br>') + '</div>';
  }
  const sf = {}, sw = {};
  (serverFehler || []).forEach(f => { sf[f.zeile] = f.fehler; });
  (serverWarnungen || []).forEach(w => { sw[w.zeile] = w.warnungen; });
  // Serverzeile n entspricht der n-ten gültigen Zeile
  const gueltige = erg.zeilen.filter(z => z.fehler.length === 0);
  gueltige.forEach((z, i) => {
    if (sf[i + 1]) z.fehler = z.fehler.concat(sf[i + 1]);
    if (sw[i + 1]) z.warnungen = Array.from(new Set(z.warnungen.concat(sw[i + 1])));
  });
  const anzFehler = erg.zeilen.filter(z => z.fehler.length).length;
  const rows = erg.zeilen.map(z => {
    const d = z.daten;
    const st = z.fehler.length ? '#F08080' : z.warnungen.length ? '#F0C060' : '#4FD4A8';
    return '<tr>' +
      '<td style="color:#8996B4">' + z.nr + '</td>' +
      '<td>' + esc(d.mannschaft) + '</td>' +
      '<td>' + esc(d.datum ? fmt(d.datum, { day:'2-digit', month:'2-digit', year:'numeric' }) : '–') + ' ' + esc(d.uhrzeit) + '</td>' +
      '<td>' + (d.heim === null ? '?' : d.heim ? 'H' : 'A') + '</td>' +
      '<td>' + esc(d.gegner) + '</td>' +
      '<td style="color:' + st + ';font-size:12px">' +
        (z.fehler.length ? z.fehler.map(esc).join('<br>') : z.warnungen.length ? z.warnungen.map(esc).join('<br>') : '✓ ok') +
      '</td></tr>';
  }).join('');
  const ok = anzFehler === 0 && erg.zeilen.length > 0;
  return '<div style="font-size:13px;margin-bottom:8px;color:' + (ok ? '#4FD4A8' : '#F08080') + '">' +
      erg.zeilen.length + ' Zeilen · ' + (erg.zeilen.length - anzFehler) + ' gültig · ' + anzFehler + ' mit Fehlern' +
    '</div>' +
    '<div class="table-scroll"><table class="spielplan-table"><thead><tr><th>Zeile</th><th>Mannschaft</th><th>Datum</th><th>H/A</th><th>Gegner</th><th>Prüfung</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    (ok
      ? '<button onclick="importSpeichern(this)" style="margin-top:12px;width:100%;padding:11px;background:#1D9E75;color:#fff;border:none;border-radius:8px;font-family:Bahnschrift SemiBold,Calibri,sans-serif;font-size:14px;cursor:pointer">' + erg.zeilen.length + ' Termine jetzt importieren</button>'
      : '<div style="margin-top:10px;font-size:13px;color:#8996B4">Bitte die Datei korrigieren und erneut prüfen. Es wird nichts gespeichert, solange Fehler vorhanden sind.</div>');
}

async function pruefeImportDatei(btn) {
  const datei = document.getElementById('import-datei').files[0];
  const ziel = document.getElementById('import-vorschau');
  if (!datei) { alert('Bitte eine CSV-Datei auswählen.'); return; }
  if (datei.size > 200 * 1024) { alert('Die Datei ist zu groß (max. 200 KB).'); return; }
  btn.disabled = true;
  try {
    const text = await datei.text();
    const erg = SPRunde.pruefeImport(text, {
      mannschaften: importMannschaften,
      bestehend: alleTermineMannschaft,
      halbrunde: document.getElementById('import-halbrunde').value
    });
    let server = null;
    if (!erg.fehlerGesamt.length && erg.gueltig > 0) {
      server = pruefe(await sb.rpc('termine_importieren', { p_zeilen: SPRunde.rpcZeilen(erg), p_speichern: false }));
    }
    importErgebnis = erg;
    ziel.innerHTML = importVorschauHtml(erg, server && server.fehler, server && server.warnungen);
  } catch (err) {
    ziel.innerHTML = '<div class="config-hint" style="margin:0">' + esc(SPS.fehlerText(err, 'Prüfung fehlgeschlagen.')) + '</div>';
  } finally {
    btn.disabled = false;
  }
}

async function importSpeichern(btn) {
  if (!importErgebnis || !importErgebnis.ok) return;
  if (!confirm(importErgebnis.zeilen.length + ' Termine importieren? Bestehende Termine und Antworten bleiben unverändert.')) return;
  btn.disabled = true; btn.textContent = 'Importiere...';
  try {
    const res = pruefe(await sb.rpc('termine_importieren', { p_zeilen: SPRunde.rpcZeilen(importErgebnis), p_speichern: true }));
    if (!res.ok) {
      document.getElementById('import-vorschau').innerHTML = importVorschauHtml(importErgebnis, res.fehler, res.warnungen);
      return;
    }
    modalSchliessen();
    alert('✓ ' + res.gespeichert + ' Termine importiert.');
    if (aktiveMannschaft) await ladeMannschaft(aktiveMannschaft.id);
  } catch (err) {
    meldeFehler(err, 'Import fehlgeschlagen');
    btn.disabled = false; btn.textContent = 'Erneut versuchen';
  }
}

// ============================================================
// Turnier-Helfer (nur Admin)
// ============================================================
async function ladeTurnierHelfer() {
  aktiveMannschaft = null;
  setAktivTab('turnier-helfer');
  renderRundenUmschalter();

  const statsEl = document.getElementById('stats');
  if (statsEl) statsEl.style.display = 'none';
  const secTitle = document.getElementById('section-title');
  if (secTitle) secTitle.textContent = 'Turnier-Helfer · Mitternachtsturnier 05.09.2026';

  document.getElementById('table-container').innerHTML =
    '<div class="loading"><span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></div>';

  const res = await sb.from('turnier_helfer').select(SPALTEN.helfer).order('created_at');
  if (res.error) {
    document.getElementById('table-container').innerHTML =
      '<div class="config-hint"><strong style="color:#E24B4A">Fehler:</strong> ' + esc(SPS.fehlerText(res.error)) + '</div>';
    return;
  }
  alleHelfer = res.data || [];
  renderHelferAnsicht();
}

function renderHelferAnsicht() {
  const helferBaseUrl = BASIS_URL + 'helfer.html';

  const gesamt  = alleHelfer.length;
  const aufbau  = alleHelfer.filter(h => h.einsatz === 'aufbau').length;
  const turnier = alleHelfer.filter(h => h.einsatz === 'turnier').length;
  const beides  = alleHelfer.filter(h => h.einsatz === 'beides').length;

  const einsatzBadge = (e) => {
    if (e === 'aufbau')  return '<span style="background:rgba(240,180,41,0.15);color:#F0C060;padding:2px 9px;border-radius:10px;font-size:12px;font-weight:700">Auf-/Abbau</span>';
    if (e === 'turnier') return '<span style="background:rgba(29,158,117,0.15);color:#4FD4A8;padding:2px 9px;border-radius:10px;font-size:12px;font-weight:700">Turnier</span>';
    return '<span style="background:rgba(212,83,126,0.18);color:#E88FB0;padding:2px 9px;border-radius:10px;font-size:12px;font-weight:700">Beides</span>';
  };

  const kennzahlen =
    '<div class="stats" style="display:grid">' +
      '<div class="stat-card"><div class="stat-label">Helfer gesamt</div><div class="stat-value">' + gesamt + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Auf-/Abbau</div><div class="stat-value warn">' + aufbau + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Turnier</div><div class="stat-value ok">' + turnier + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Beides</div><div class="stat-value" style="color:#E88FB0">' + beides + '</div></div>' +
    '</div>';

  const aktionsLeiste =
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">' +
      '<a href="' + esc(helferBaseUrl) + '" target="_blank" rel="noopener noreferrer" class="btn-abfrage" style="text-decoration:none">Eintrage-Seite öffnen</a>' +
      '<button class="btn-wa" onclick="zeigeHelferEinladung()">💬 Einladung erstellen</button>' +
    '</div>';

  let tabelle;
  if (gesamt === 0) {
    tabelle = '<div class="loading" style="padding:40px">Noch keine Helfer eingetragen. Verschick die Einladung, damit sich Helfer eintragen können.</div>';
  } else {
    const rows = alleHelfer.map(function(h) {
      const dt = new Date(h.created_at).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' }) +
                 ' ' + new Date(h.created_at).toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
      const anm = h.anmerkung && h.anmerkung.trim()
        ? '<span style="color:#CBD8E6">' + esc(h.anmerkung) + '</span>'
        : '<span style="color:#8996B4">–</span>';
      return '<tr>' +
        '<td style="font-weight:700">' + esc(h.name) + '</td>' +
        '<td>' + einsatzBadge(h.einsatz) + '</td>' +
        '<td style="font-size:13px">' + anm + '</td>' +
        '<td style="color:#8996B4;font-size:13px">' + esc(dt) + '</td>' +
      '</tr>';
    }).join('');

    tabelle =
      '<div class="table-scroll"><table class="spielplan-table">' +
        '<thead><tr><th>Name</th><th>Einsatz</th><th>Sonstiges / Anmerkung</th><th>Eingetragen</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>';
  }

  document.getElementById('table-container').innerHTML = kennzahlen + aktionsLeiste + tabelle;
}

function zeigeHelferEinladung() {
  const helferBaseUrl = BASIS_URL + 'helfer.html';
  const vorgabe =
    'Hallo zusammen,\n' +
    'wir suchen Helfer für unser Mitternachtsturnier am 05.09.2026 (Tisch 7).\n\n' +
    'Trag dich hier ein, wobei du helfen kannst:\n' +
    '👉 ' + helferBaseUrl + '\n\n' +
    'Danke euch!';

  modalOeffnen(
    '<div style="background:#152232;border:1px solid rgba(255,255,255,0.12);border-radius:16px;max-width:460px;width:100%">' +
      '<div style="padding:18px 22px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center">' +
        '<div>' +
          '<div style="font-family:Bahnschrift SemiBold,sans-serif;font-size:16px;color:#F07830">Helfer-Einladung</div>' +
          '<div style="font-size:13px;color:#8996B4;margin-top:2px">Text anpassen, kopieren, in die WhatsApp-Gruppe einfügen</div>' +
        '</div>' + X_BTN +
      '</div>' +
      '<div style="padding:20px 22px">' +
        '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;color:#8996B4;margin-bottom:8px">Nachricht</div>' +
        '<textarea id="helfer-einladung-text" style="width:100%;min-height:170px;background:#0D1B2A;border:1px solid rgba(255,255,255,0.14);border-radius:8px;padding:12px 14px;font-size:14px;line-height:1.6;color:#F7F9FF;font-family:Calibri,sans-serif;resize:vertical;outline:none"></textarea>' +
        '<div style="font-size:12px;color:#8996B4;margin-top:6px">Der Text ist frei editierbar – anpassen, dann kopieren.</div>' +
        '<div style="display:flex;gap:8px;margin-top:16px">' +
          '<button id="helfer-copy-btn" onclick="kopiereHelferText(this)" style="flex:1;background:#25D366;border:none;border-radius:8px;padding:12px;text-align:center;font-size:14px;font-weight:700;color:#fff;cursor:pointer;font-family:Calibri,sans-serif">📋 Text kopieren</button>' +
          '<button onclick="this.closest(\'.sp-modal\').remove()" style="background:#2a445f;border:none;border-radius:8px;padding:12px 16px;text-align:center;font-size:14px;color:#CBD8E6;cursor:pointer;font-family:Calibri,sans-serif">Schließen</button>' +
        '</div>' +
      '</div>' +
    '</div>');
  document.getElementById('helfer-einladung-text').value = vorgabe;
}

function kopiereHelferText(btn) {
  const ta = document.getElementById('helfer-einladung-text');
  if (!ta) return;
  const text = ta.value;

  function feedback() {
    const alt = btn.textContent;
    btn.textContent = 'Kopiert ✓';
    btn.style.background = '#128C45';
    setTimeout(function() { btn.textContent = alt; btn.style.background = '#25D366'; }, 2000);
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(feedback).catch(function() {
      ta.select(); try { document.execCommand('copy'); } catch (e) {} feedback();
    });
  } else {
    ta.select(); try { document.execCommand('copy'); } catch (e) {} feedback();
  }
}

// ============================================================
// Start
// ============================================================
symboleEinsetzen();
init();
