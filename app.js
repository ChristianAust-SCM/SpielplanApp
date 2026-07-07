// ============================================================
// Spielplan-App · app.js
// ============================================================
const SUPABASE_URL  = 'https://nwutgxjnverlvmkrpiep.supabase.co';
const SUPABASE_ANON = 'sb_publishable_09tn0DY3wswcIVQ-mN1S8A_znKWQXaF';
const VEREIN_KUERZEL = 'fcstrass';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

let alleMannschaften = [];
let aktiveMannschaft = null;
let alleTermine      = [];
let alleVerfueg      = [];
let alleSpieler      = [];
let alleAlternativtermine = [];
let istAdmin         = false;

async function init() {
  // Auth prüfen
  const { data: sessionData } = await sb.auth.getSession();
  if (!sessionData.session) {
    window.location.href = 'login.html';
    return;
  }

  const userId = sessionData.session.user.id;
  const email  = sessionData.session.user.email;

  // Header E-Mail + Abmelden
  document.getElementById('header-status').innerHTML =
    email + ' &nbsp;·&nbsp; <a href="#" onclick="abmelden()" style="color:var(--muted);text-decoration:underline;font-size:12px">Abmelden</a>';

  document.getElementById('config-hint').style.display = 'none';

  try {
    // Erlaubte Mannschaften für diesen Nutzer laden
    const { data: rollen, error: re } = await sb
      .from('nutzer_rollen')
      .select('mannschaft_id, rolle, mannschaften(id, name, liga, mf_name, mf_email)')
      .eq('user_id', userId);

    if (re) throw re;

    // Prüfen ob Admin
    istAdmin = rollen.some(r => r.rolle === 'admin');

    // Mannschaften aus Rollen extrahieren – sortiert nach Name
    alleMannschaften = rollen
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
      '<div class="config-hint"><strong style="color:#E24B4A">Fehler:</strong> ' + err.message + '</div>';
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
  el.innerHTML = alleMannschaften.map(m =>
    '<button class="tab" onclick="ladeMannschaft(\'' + m.id + '\')" data-id="' + m.id + '">' +
      m.name + ' <span style="font-size:11px;opacity:.7">· ' + m.liga + '</span>' +
    '</button>'
  ).join('');
}

function setAktivTab(id) {
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.id === id);
  });
}

// ============================================================
// Mannschaft laden
// ============================================================
async function ladeMannschaft(mannschaftId) {
  aktiveMannschaft = alleMannschaften.find(m => m.id === mannschaftId);
  setAktivTab(mannschaftId);

  document.getElementById('table-container').innerHTML =
    '<div class="loading"><span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></div>';

  const [termineRes, spielerRes] = await Promise.all([
    sb.from('spieltermine').select('*').eq('mannschaft_id', mannschaftId).order('datum'),
    sb.from('spieler').select('*').eq('mannschaft_id', mannschaftId).eq('aktiv', true)
  ]);

  alleTermine = termineRes.data || [];
  alleSpieler = spielerRes.data || [];

  if (alleTermine.length > 0) {
    const ids = alleTermine.map(t => t.id);
    const [verfRes, altRes] = await Promise.all([
      sb.from('verfuegbarkeiten').select('*').in('spieltermin_id', ids),
      sb.from('alternativtermine').select('*').in('spieltermin_id', ids).order('datum')
    ]);
    alleVerfueg = verfRes.data || [];
    alleAlternativtermine = altRes.data || [];
  } else {
    alleVerfueg = [];
    alleAlternativtermine = [];
  }

  renderStats();
  renderTabelle();
}

// ============================================================
// Statistiken
// ============================================================
function renderStats() {
  const gesamt = alleTermine.length;
  const min    = aktiveMannschaft?.min_spieler || 6;
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

  // Labels dynamisch anpassen
  document.querySelector('[for-stat="krit"]') &&
    (document.querySelector('[for-stat="krit"]').textContent = `Zu wenig (<${min} Zusagen)`);
  document.querySelector('[for-stat="ok"]') &&
    (document.querySelector('[for-stat="ok"]').textContent = `Spielbereit (≥${min} Ja)`);
}

function zaehleAntworten(terminId, antwort) {
  return alleVerfueg.filter(v =>
    v.spieltermin_id === terminId && v.antwort === antwort
  ).length;
}

function ampelKlasse(terminId) {
  const hatAbfrage = alleVerfueg.some(v => v.spieltermin_id === terminId);
  if (!hatAbfrage) return 'offen';
  const ja  = zaehleAntworten(terminId, 'Ja');
  const min = aktiveMannschaft?.min_spieler || 6;
  if (ja >= min)     return 'ok';
  if (ja >= min - 2) return 'warn';
  return 'crit';
}

function ampelText(terminId) {
  const hat = alleVerfueg.some(v => v.spieltermin_id === terminId && v.alternativtermin_id === null);
  if (!hat) return null;
  const ja         = zaehleAntworten(terminId, 'Ja');
  const nein       = zaehleAntworten(terminId, 'Nein');
  const vielleicht = zaehleAntworten(terminId, 'Vielleicht');
  return { ja, nein, vielleicht };
}

function rueckmeldungText(terminId) {
  const hat = alleVerfueg.some(v => v.spieltermin_id === terminId && v.alternativtermin_id === null);
  if (!hat) return null;
  const ja         = zaehleAntworten(terminId, 'Ja');
  const nein       = zaehleAntworten(terminId, 'Nein');
  const vielleicht = zaehleAntworten(terminId, 'Vielleicht');
  const gesamt     = ja + nein + vielleicht;
  const kader      = alleSpieler.length || (aktiveMannschaft?.min_spieler || 6);
  const fehlen     = Math.max(0, kader - gesamt);
  return { gesamt, kader, fehlen };
}

function rueckmeldungAlt(altTermine) {
  // Gibt pro Alternativtermin ein separates Badge zurück
  if (!altTermine || altTermine.length === 0) return '';
  const kader = alleSpieler.length || (aktiveMannschaft?.min_spieler || 6);
  return altTermine.map(function(at, i) {
    const av      = alleVerfueg.filter(v => v.alternativtermin_id === at.id);
    const gesamt  = av.length;
    const fehlen  = Math.max(0, kader - gesamt);
    const ad      = new Date(at.datum).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });
    const farbe   = gesamt === 0 ? '#8996B4' : fehlen === 0 ? '#4FD4A8' : '#F08080';
    const bg      = gesamt === 0 ? 'rgba(137,150,180,0.1)' : fehlen === 0 ? 'rgba(29,158,117,0.12)' : 'rgba(226,75,74,0.12)';
    const label   = gesamt === 0 ? 'offen' : fehlen === 0 ? 'alle ✓' : fehlen + ' fehlen';
    return '<div style="margin-bottom:5px;cursor:pointer" onclick="zeigeFehlende(\'' + at._spieltermin_id + '\',\'' + at.id + '\')">' +
      '<div style="font-size:11px;color:#8996B4;margin-bottom:2px">Alt.' + (i+1) + ' · ' + ad + '</div>' +
      '<div style="font-size:14px;font-weight:500;color:var(--white)">' + gesamt + ' / ' + kader + '</div>' +
      '<div style="display:inline-block;padding:1px 7px;border-radius:10px;background:' + bg + ';font-size:11px;font-weight:600;color:' + farbe + '">' + label + '</div>' +
    '</div>';
  }).join('');
}

// ============================================================
// Tabelle
// ============================================================
function renderTabelle() {
  if (alleTermine.length === 0) {
    document.getElementById('table-container').innerHTML =
      '<div class="loading" style="padding:40px">Keine Spieltermine vorhanden.</div>';
    return;
  }

  const baseUrl = 'https://spielplanapp.christianaust.eu/';
  const ampelLabels = { ok: 'Spielbereit', warn: 'Zu wenig', crit: 'Nicht spielbereit', offen: 'Offen' };

  const rows = alleTermine.map(function(t) {
    const d   = new Date(t.datum);
    const wt  = d.toLocaleDateString('de-DE', { weekday: 'short' });
    const dt  = d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' });
    const uhr = t.uhrzeit ? t.uhrzeit.slice(0,5) + ' Uhr' : '';
    const kl  = ampelKlasse(t.id);
    const txt = ampelText(t.id);
    const rm  = rueckmeldungText(t.id);
    const abfrageLink = baseUrl + 'spieler.html?token=' + t.abfrage_token;

    const datumLang = d.toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
    const heimAusw  = t.heim ? 'Heimspiel' : 'Auswärtsspiel';
    const mfName    = aktiveMannschaft?.mf_name?.split(' ')[0] || 'Euer MF';
    const waText    = 'Hallo zusammen,\nbitte meldet eure Verfügbarkeit für unser Spiel:\n\n🏓 ' + heimAusw + ' gegen ' + t.gegner + '\n📅 ' + datumLang + (uhr ? ' · ' + uhr : '') + '\n\n👉 ' + abfrageLink + '\n\nBitte bis Mittwoch antworten. Danke!\n– ' + mfName;

    const statusBadge = t.status === 'Verschoben'
      ? '<span style="color:#F0B429;font-size:11px;font-weight:700"> · ALTERNATIVTERMIN</span>'
      : t.status === 'Verschiebung nötig'
      ? '<span style="color:#F07830;font-size:11px;font-weight:700"> · VERSCHIEBUNG NÖTIG</span>'
      : '';

    // Alternativtermine mit _spieltermin_id für zeigeFehlende
    const altTermineInfo = alleAlternativtermine.filter(a => a.spieltermin_id === t.id)
      .map(a => ({ ...a, _spieltermin_id: t.id }));

    const altInfo = altTermineInfo.length > 0
      ? '<div style="margin-top:6px;display:flex;flex-direction:column;gap:4px">' +
          altTermineInfo.map(function(at, i) {
            const ad  = new Date(at.datum).toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit' });
            const auhr = at.uhrzeit ? at.uhrzeit.slice(0,5) : '';
            const altVerfueg = alleVerfueg.filter(v => v.alternativtermin_id === at.id);
            const altJa   = altVerfueg.filter(v => v.antwort === 'Ja').length;
            const altViel = altVerfueg.filter(v => v.antwort === 'Vielleicht').length;
            const altNein = altVerfueg.filter(v => v.antwort === 'Nein').length;
            const min = aktiveMannschaft?.min_spieler || 6;
            const altFarbe = altJa >= min ? '#4FD4A8' : altJa >= 4 ? '#F0C060' : '#8996B4';
            return '<div style="background:rgba(212,98,10,0.08);border-radius:6px;padding:4px 8px;margin-bottom:2px">' +
              '<div style="font-size:11px;color:#F07830;font-weight:700;margin-bottom:2px">Alt.' + (i+1) + ': ' + ad + (auhr?' · '+auhr+' Uhr':'') + '</div>' +
              '<div style="display:flex;gap:4px;flex-wrap:wrap">' +
                '<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:8px;background:#E1F5EE;font-size:11px;font-weight:700;color:#085041">' +
                  '<span style="width:5px;height:5px;border-radius:50%;background:#1D9E75;display:inline-block;"></span>' + altJa + ' Ja' +
                '</span>' +
                '<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:8px;background:#FAEEDA;font-size:11px;font-weight:700;color:#633806">' +
                  '<span style="width:5px;height:5px;border-radius:50%;background:#EF9F27;display:inline-block;"></span>' + altViel + ' Vllt.' +
                '</span>' +
                '<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:8px;background:#FCEBEB;font-size:11px;font-weight:700;color:#791F1F">' +
                  '<span style="width:5px;height:5px;border-radius:50%;background:#E24B4A;display:inline-block;"></span>' + altNein + ' Nein' +
                '</span>' +
              '</div>' +
            '</div>';
          }).join('') +
        '</div>'
      : '';

    // Ist dieser Termin im Alternativtermin-Modus?
    const istAlternativ = t.status === 'Verschoben' || t.status === 'Verschiebung nötig';
    const altTermine    = alleAlternativtermine.filter(a => a.spieltermin_id === t.id);
    const rowStyle      = istAlternativ ? 'opacity:0.45;' : '';

    // Datums-Block: bei Alternativtermin die Alt-Termine anzeigen
    let datumBlock;
    if (istAlternativ && altTermine.length > 0) {
      const altDaten = altTermine.map(function(at, i) {
        const ad  = new Date(at.datum).toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', year:'2-digit' });
        const auhr = at.uhrzeit ? at.uhrzeit.slice(0,5) : '';
        return '<div style="font-size:12px;color:#F07830;font-weight:700">↔ Alt.' + (i+1) + ': ' + ad + (auhr?' '+auhr+' Uhr':'') + '</div>';
      }).join('');
      datumBlock = '<div class="datum-block">' +
        '<div class="datum-main" style="color:#8996B4;text-decoration:line-through">' + wt + ', ' + dt + '</div>' +
        altDaten +
      '</div>';
    } else {
      datumBlock = '<div class="datum-block"><div class="datum-main">' + wt + ', ' + dt + statusBadge + '</div><div class="datum-sub">' + uhr + '</div></div>';
    }

    // Aktions-Buttons: bei Alternativtermin nur Verschiebungs-Button aktiv
    const aktionButtons = istAlternativ
      ? '<button class="btn-verschiebung aktiv" onclick="meldeVerschiebung(\'' + t.id + '\', \'' + t.status + '\')" title="' + (t.status === 'Verschiebung nötig' ? 'Alternativtermin läuft' : 'Alternativtermin') + '">↔</button>'
      : '<a class="btn-icon-link" href="' + abfrageLink + '" target="_blank" title="Link öffnen" aria-label="Link öffnen">🔗</a>' +
        '<button class="btn-icon-wa" onclick="kopierenWA(this, \'' + waText.replace(/'/g, "\\'").replace(/\n/g, '\\n') + '\')" title="WhatsApp-Text kopieren" aria-label="WhatsApp"><svg width="15" height="15" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.914 0C5.34 0 0 5.34 0 11.914c0 2.11.549 4.094 1.508 5.818L0 24l6.459-1.474a11.882 11.882 0 005.455 1.32c6.573 0 11.914-5.34 11.914-11.914C23.828 5.34 18.487 0 11.914 0zm0 21.828a9.914 9.914 0 01-5.032-1.369l-.361-.214-3.734.852.87-3.638-.235-.374A9.865 9.865 0 012 11.914C2 6.443 6.443 2 11.914 2c5.472 0 9.914 4.443 9.914 9.914 0 5.472-4.442 9.914-9.914 9.914z"/></svg></button>' +
        '<button class="btn-icon-alt" onclick="meldeVerschiebung(\'' + t.id + '\', \'' + t.status + '\')" title="Alternativtermin" aria-label="Alternativtermin">↔</button>';

    return '<tr style="' + rowStyle + '">' +
      '<td>' + datumBlock + '</td>' +
      '<td><span class="ha-badge ' + (t.heim ? 'ha-h' : 'ha-a') + '">' + (t.heim ? 'Heim' : 'Auswärts') + '</span></td>' +
      '<td style="font-weight:700">' + t.gegner + '</td>' +
      '<td>' + (txt
        ? '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px">' +
            '<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:10px;background:#E1F5EE;font-size:12px;font-weight:700;color:#085041">' +
              '<span style="width:6px;height:6px;border-radius:50%;background:#1D9E75;display:inline-block;"></span>' + txt.ja + ' Ja' +
            '</span>' +
            '<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:10px;background:#FAEEDA;font-size:12px;font-weight:700;color:#633806">' +
              '<span style="width:6px;height:6px;border-radius:50%;background:#EF9F27;display:inline-block;"></span>' + txt.vielleicht + ' Vllt.' +
            '</span>' +
            '<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:10px;background:#FCEBEB;font-size:12px;font-weight:700;color:#791F1F">' +
              '<span style="width:6px;height:6px;border-radius:50%;background:#E24B4A;display:inline-block;"></span>' + txt.nein + ' Nein' +
            '</span>' +
          '</div>'
        : '<span style="font-size:13px;color:#8996B4;">–</span>') + altInfo + '</td>' +
      '<td>' + (istAlternativ && altTermineInfo.length > 0
        ? rueckmeldungAlt(altTermineInfo)
        : rm
          ? '<button onclick="zeigeFehlende(\'' + t.id + '\',null)" style="background:none;border:none;cursor:pointer;text-align:left;padding:0">' +
              '<div style="line-height:1.5">' +
                '<div style="font-size:15px;font-weight:700;color:' + (rm.fehlen === 0 ? '#4FD4A8' : '#F7F9FF') + '">' + rm.gesamt + ' / ' + rm.kader + '</div>' +
                '<div style="font-size:12px;padding:2px 8px;border-radius:10px;display:inline-block;margin-top:2px;' +
                  (rm.fehlen === 0
                    ? 'background:rgba(29,158,117,0.15);color:#4FD4A8'
                    : 'background:rgba(226,75,74,0.15);color:#F08080') + '">' +
                  (rm.fehlen === 0 ? '✓ alle' : rm.fehlen + ' fehlen') +
                '</div>' +
              '</div>' +
            '</button>'
          : '<span style="font-size:12px;color:var(--muted)">–</span>') + '</td>' +
      '<td style="display:flex;gap:4px;align-items:center;flex-wrap:nowrap">' + aktionButtons + '</td>' +
    '</tr>';
  }).join('');

  document.getElementById('table-container').innerHTML =
    '<table class="spielplan-table">' +
      '<thead><tr>' +
        '<th>Datum</th><th>H/A</th><th>Gegner</th><th>Verfügbarkeit</th><th>Rückmeldung</th><th>Aktion</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';
}

// ============================================================
// Detail-Ansicht: Wer hat wie geantwortet
// ============================================================
function zeigeDetail(terminId) {
  const termin = alleTermine.find(t => t.id === terminId);
  const antworten = alleVerfueg.filter(v => v.spieltermin_id === terminId);

  if (antworten.length === 0) {
    alert('Noch keine Rückmeldungen für dieses Spiel.');
    return;
  }

  // Spielernamen zuordnen
  const rows = antworten.map(function(v) {
    const sp = alleSpieler.find(s => s.id === v.spieler_id);
    const name = sp ? sp.name : 'Unbekannt';
    const farbe = v.antwort === 'Ja' ? '#4FD4A8' : v.antwort === 'Nein' ? '#F08080' : '#F0C060';
    return '<tr><td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.08)">' + name + '</td>' +
      '<td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.08);color:' + farbe + ';font-weight:700">' + v.antwort + '</td>' +
      '<td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.08);color:#8996B4;font-size:13px">' + (v.anmerkung || '–') + '</td></tr>';
  }).join('');

  const d = new Date(termin.datum).toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'2-digit' });

  // Modal anzeigen
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px';
  modal.innerHTML =
    '<div style="background:#152232;border:1px solid rgba(255,255,255,0.1);border-radius:16px;max-width:520px;width:100%;max-height:80vh;overflow-y:auto">' +
      '<div style="padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center">' +
        '<div>' +
          '<div style="font-family:Bahnschrift SemiBold,sans-serif;font-size:16px;color:#F07830">' + (termin.heim ? 'Heimspiel' : 'Auswärtsspiel') + ' gegen ' + termin.gegner + '</div>' +
          '<div style="font-size:13px;color:#8996B4;margin-top:2px">' + d + '</div>' +
        '</div>' +
        '<button onclick="this.closest(\'[style*=fixed]\').remove()" style="background:none;border:none;color:#8996B4;font-size:20px;cursor:pointer">✕</button>' +
      '</div>' +
      '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr style="background:#1e3048">' +
          '<th style="padding:10px 12px;text-align:left;font-size:11px;color:#8996B4;text-transform:uppercase;letter-spacing:0.08em">Spieler</th>' +
          '<th style="padding:10px 12px;text-align:left;font-size:11px;color:#8996B4;text-transform:uppercase;letter-spacing:0.08em">Antwort</th>' +
          '<th style="padding:10px 12px;text-align:left;font-size:11px;color:#8996B4;text-transform:uppercase;letter-spacing:0.08em">Anmerkung</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>';
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

// ============================================================
// Verschiebung melden / Admin: neuen Termin eintragen
// ============================================================
// ============================================================
// Verschiebungslogik
// ============================================================

async function meldeVerschiebung(terminId, aktuellerStatus) {
  const termin = alleTermine.find(t => t.id === terminId);
  if (!termin) return;

  if (istAdmin) {
    // Admin: Alternativtermine verwalten
    await zeigeAdminVerschiebungsModal(termin);
  } else {
    // MF: Alternativtermine vorschlagen ODER Bedarf melden
    await zeigeMFVerschiebungsModal(termin, aktuellerStatus);
  }
}

// ── MF-Modal: Alternativtermine vorschlagen ──────────────────
async function zeigeMFVerschiebungsModal(termin, aktuellerStatus) {
  // Bestehende Alternativtermine laden
  const { data: altTermine } = await sb.from('alternativtermine')
    .select('*').eq('spieltermin_id', termin.id).order('datum');

  const d = new Date(termin.datum).toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
  const baseUrl = 'https://spielplanapp.christianaust.eu/';

  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px;overflow-y:auto';

  function renderAltTermine(liste) {
    if (!liste || liste.length === 0)
      return '<div style="font-size:13px;color:#8996B4;font-style:italic">Noch keine Alternativtermine eingetragen.</div>';
    return liste.map(function(at, i) {
      const ad = new Date(at.datum).toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric' });
      const auhr = at.uhrzeit ? at.uhrzeit.slice(0,5) + ' Uhr' : '';
      const link = baseUrl + 'spieler.html?alt=' + at.abfrage_token;
      const jaZahl = at._ja || 0;
      const ampelFarbe = jaZahl >= (aktiveMannschaft?.min_spieler || 6) ? '#1D9E75' : jaZahl >= 4 ? '#F0B429' : '#8996B4';
      return '<div style="background:#1e3048;border-radius:8px;padding:12px 14px;display:grid;gap:8px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<div>' +
            '<div style="font-weight:700;color:#F7F9FF;font-size:14px">Alternative ' + (i+1) + ': ' + ad + (auhr ? ' · ' + auhr : '') + '</div>' +
            '<div style="font-size:12px;color:' + ampelFarbe + ';margin-top:2px">' + jaZahl + ' Ja-Zusagen</div>' +
          '</div>' +
          '<button onclick="loescheAlternativtermin(\'' + at.id + '\')" style="background:none;border:none;color:#8996B4;cursor:pointer;font-size:16px" title="Löschen">🗑</button>' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button onclick="kopierenWA(this,\'' + ('Hallo zusammen,\\nbitte prüft ob ihr an folgendem Ausweichtermin spielen könnt:\\n\\n🏓 ' + (termin.heim?'Heimspiel':'Auswärtsspiel') + ' gegen ' + termin.gegner + '\\n📅 ' + ad + (auhr?' · '+auhr:'') + '\\n\\n👉 ' + link + '\\n\\nBitte bis Mittwoch antworten. Danke!\\n– ' + (aktiveMannschaft?.mf_name?.split(' ')[0]||'Euer MF')).replace(/'/g,"\\'") + '\')" ' +
            'style="padding:5px 10px;border-radius:6px;background:#25D366;border:none;color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:Calibri,sans-serif">' +
            '💬 WhatsApp-Link kopieren' +
          '</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  modal.innerHTML =
    '<div style="background:#152232;border:1px solid rgba(255,255,255,0.12);border-radius:16px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto" id="mf-modal-inner">' +
      '<div style="padding:18px 22px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#152232;z-index:1">' +
        '<div>' +
          '<div style="font-family:Bahnschrift SemiBold,sans-serif;font-size:16px;color:#F07830">Verschiebung – Alternativtermine</div>' +
          '<div style="font-size:13px;color:#8996B4;margin-top:2px">' + (termin.heim?'Heimspiel':'Auswärtsspiel') + ' gegen ' + termin.gegner + ' · ' + d + '</div>' +
        '</div>' +
        '<button onclick="this.closest(\'[style*=fixed]\').remove()" style="background:none;border:none;color:#8996B4;font-size:20px;cursor:pointer">✕</button>' +
      '</div>' +
      '<div style="padding:20px 22px;display:grid;gap:16px">' +
        // Bestehende Alternativtermine
        '<div>' +
          '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;color:#8996B4;margin-bottom:10px">Alternativtermine</div>' +
          '<div id="alt-liste">' + renderAltTermine(altTermine) + '</div>' +
        '</div>' +
        // Neuen Alternativtermin hinzufügen
        '<div style="background:#1e3048;border-radius:8px;padding:14px">' +
          '<div style="font-size:12px;font-weight:700;color:#1D9E75;margin-bottom:10px">+ Alternativtermin hinzufügen</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
            '<div>' +
              '<label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;color:#8996B4;margin-bottom:6px">Datum</label>' +
              '<input type="date" id="alt-datum" style="width:100%;padding:9px 12px;background:#0D1B2A;border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#F7F9FF;font-family:Calibri,sans-serif;font-size:13px;outline:none">' +
            '</div>' +
            '<div>' +
              '<label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;color:#8996B4;margin-bottom:6px">Uhrzeit</label>' +
              '<input type="time" id="alt-uhrzeit" value="14:30" style="width:100%;padding:9px 12px;background:#0D1B2A;border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#F7F9FF;font-family:Calibri,sans-serif;font-size:13px;outline:none">' +
            '</div>' +
          '</div>' +
          '<button onclick="speichereAlternativtermin(\'' + termin.id + '\')" style="width:100%;margin-top:12px;padding:10px;background:#1D9E75;color:#fff;border:none;border-radius:8px;font-family:Bahnschrift SemiBold,Calibri,sans-serif;font-size:14px;cursor:pointer">Termin hinzufügen</button>' +
        '</div>' +
        // Verschiebungsbedarf melden
        '<div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:14px">' +
          '<button onclick="meldeVerschiebungsBedarf(\'' + termin.id + '\',\'' + aktuellerStatus + '\')" style="width:100%;padding:10px;background:' +
            (aktuellerStatus==='Verschiebung nötig'?'rgba(212,98,10,0.3)':'rgba(212,98,10,0.15)') +
            ';color:#F07830;border:1px solid rgba(212,98,10,0.35);border-radius:8px;font-family:Calibri,sans-serif;font-size:14px;font-weight:700;cursor:pointer">' +
            (aktuellerStatus==='Verschiebung nötig' ? '⚠️ Verschiebungsbedarf zurückziehen' : '↔️ Verschiebungsbedarf beim Admin melden') +
          '</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

async function speichereAlternativtermin(terminId) {
  const datum   = document.getElementById('alt-datum').value;
  const uhrzeit = document.getElementById('alt-uhrzeit').value;
  if (!datum) { alert('Bitte ein Datum eingeben.'); return; }

  const { error } = await sb.from('alternativtermine').insert({
    spieltermin_id: terminId,
    datum:   datum,
    uhrzeit: uhrzeit || null
  });
  if (error) { alert('Fehler: ' + error.message); return; }

  // Liste neu laden
  const { data: neu } = await sb.from('alternativtermine')
    .select('*').eq('spieltermin_id', terminId).order('datum');

  const baseUrl = 'https://spielplanapp.christianaust.eu/';
  const termin  = alleTermine.find(t => t.id === terminId);

  // Alt-Liste im Modal aktualisieren
  const liste = document.getElementById('alt-liste');
  if (liste && termin) {
    const d = new Date(termin.datum).toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
    liste.innerHTML = (neu||[]).map(function(at, i) {
      const ad = new Date(at.datum).toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric' });
      const auhr = at.uhrzeit ? at.uhrzeit.slice(0,5) + ' Uhr' : '';
      const link = baseUrl + 'spieler.html?alt=' + at.abfrage_token;
      return '<div style="background:#1e3048;border-radius:8px;padding:12px 14px;display:grid;gap:8px;margin-bottom:8px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<div style="font-weight:700;color:#F7F9FF;font-size:14px">Alternative ' + (i+1) + ': ' + ad + (auhr?' · '+auhr:'') + '</div>' +
          '<button onclick="loescheAlternativtermin(\'' + at.id + '\')" style="background:none;border:none;color:#8996B4;cursor:pointer;font-size:16px">🗑</button>' +
        '</div>' +
        '<button onclick="kopierenWA(this,\'' + ('Hallo zusammen,\\nbitte prüft ob ihr an folgendem Ausweichtermin spielen könnt:\\n\\n🏓 ' + (termin.heim?'Heimspiel':'Auswärtsspiel') + ' gegen ' + termin.gegner + '\\n📅 ' + ad + (auhr?' · '+auhr:'') + '\\n\\n👉 ' + link + '\\n\\nBitte bis Mittwoch antworten. Danke!\\n– ' + (aktiveMannschaft?.mf_name?.split(' ')[0]||'Euer MF')).replace(/'/g,"\\'") + '\')" ' +
          'style="padding:5px 10px;border-radius:6px;background:#25D366;border:none;color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:Calibri,sans-serif;width:fit-content">💬 WhatsApp-Link kopieren</button>' +
      '</div>';
    }).join('');
  }

  document.getElementById('alt-datum').value = '';
}

async function loescheAlternativtermin(altId) {
  if (!confirm('Alternativtermin und alle Abstimmungen dazu löschen?')) return;
  await sb.from('verfuegbarkeiten').delete().eq('alternativtermin_id', altId);
  await sb.from('alternativtermine').delete().eq('id', altId);
  // Modal neu öffnen
  document.querySelector('[style*="fixed"]')?.remove();
  const termin = alleTermine[0]; // Placeholder – wird durch modal refresh ersetzt
  await ladeMannschaft(aktiveMannschaft.id);
}

async function meldeVerschiebungsBedarf(terminId, aktuellerStatus) {
  const neuerStatus = aktuellerStatus === 'Verschiebung nötig' ? 'Geplant' : 'Verschiebung nötig';
  const { error } = await sb.from('spieltermine').update({ status: neuerStatus }).eq('id', terminId);
  if (error) { alert('Fehler: ' + error.message); return; }
  document.querySelector('[style*="fixed"]')?.remove();
  await ladeMannschaft(aktiveMannschaft.id);
}

// ── Admin-Modal: Neuen Termin bestätigen ─────────────────────
async function zeigeAdminVerschiebungsModal(termin) {
  // Alternativtermine + Verfügbarkeiten laden
  const { data: altTermine } = await sb.from('alternativtermine')
    .select('*').eq('spieltermin_id', termin.id).order('datum');

  // Ja-Zahlen je Alternativtermin
  if (altTermine && altTermine.length > 0) {
    for (const at of altTermine) {
      const { data: vd } = await sb.from('verfuegbarkeiten')
        .select('antwort').eq('alternativtermin_id', at.id);
      at._ja = (vd||[]).filter(v => v.antwort === 'Ja').length;
      at._vielleicht = (vd||[]).filter(v => v.antwort === 'Vielleicht').length;
      at._nein = (vd||[]).filter(v => v.antwort === 'Nein').length;
    }
  }

  const d = new Date(termin.datum).toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px;overflow-y:auto';

  const altHtml = altTermine && altTermine.length > 0
    ? altTermine.map(function(at, i) {
        const ad = new Date(at.datum).toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
        const auhr = at.uhrzeit ? at.uhrzeit.slice(0,5) + ' Uhr' : '';
        const min = aktiveMannschaft?.min_spieler || 6;
        const ampelBg = at._ja >= min ? 'rgba(29,158,117,0.15)' : at._ja >= 4 ? 'rgba(240,180,41,0.15)' : 'rgba(226,75,74,0.15)';
        const ampelFg = at._ja >= min ? '#4FD4A8' : at._ja >= 4 ? '#F0C060' : '#F08080';
        return '<div style="background:#1e3048;border-radius:10px;padding:14px 16px;border:1px solid rgba(255,255,255,0.08)">' +
          '<div style="font-weight:700;color:#F7F9FF;font-size:14px;margin-bottom:6px">Alternative ' + (i+1) + ': ' + ad + (auhr?' · '+auhr:'') + '</div>' +
          '<div style="display:flex;gap:12px;margin-bottom:12px">' +
            '<span style="background:rgba(29,158,117,0.15);color:#4FD4A8;padding:3px 10px;border-radius:12px;font-size:13px;font-weight:700">' + at._ja + ' Ja</span>' +
            '<span style="background:rgba(240,180,41,0.12);color:#F0C060;padding:3px 10px;border-radius:12px;font-size:13px;font-weight:700">' + at._vielleicht + ' Vielleicht</span>' +
            '<span style="background:rgba(226,75,74,0.12);color:#F08080;padding:3px 10px;border-radius:12px;font-size:13px;font-weight:700">' + at._nein + ' Nein</span>' +
          '</div>' +
          '<button onclick="bestaetigeAlternativtermin(\'' + termin.id + '\',\'' + at.datum + '\',\'' + (at.uhrzeit||'') + '\')" ' +
            'style="width:100%;padding:10px;background:#1D9E75;color:#fff;border:none;border-radius:8px;font-family:Bahnschrift SemiBold,Calibri,sans-serif;font-size:14px;cursor:pointer">' +
            '✓ Diesen Termin als neuen Spieltermin bestätigen' +
          '</button>' +
        '</div>';
      }).join('')
    : '<div style="font-size:13px;color:#8996B4;font-style:italic">Noch keine Alternativtermine vom MF eingetragen.</div>';

  modal.innerHTML =
    '<div style="background:#152232;border:1px solid rgba(255,255,255,0.12);border-radius:16px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto">' +
      '<div style="padding:18px 22px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#152232">' +
        '<div>' +
          '<div style="font-family:Bahnschrift SemiBold,sans-serif;font-size:16px;color:#F07830">Admin – Verschiebung bestätigen</div>' +
          '<div style="font-size:13px;color:#8996B4;margin-top:2px">' + (termin.heim?'Heimspiel':'Auswärtsspiel') + ' gegen ' + termin.gegner + ' · ' + d + '</div>' +
        '</div>' +
        '<button onclick="this.closest(\'[style*=fixed]\').remove()" style="background:none;border:none;color:#8996B4;font-size:20px;cursor:pointer">✕</button>' +
      '</div>' +
      '<div style="padding:20px 22px;display:grid;gap:14px">' +
        '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;color:#8996B4">Abstimmungsergebnisse</div>' +
        altHtml +
        '<div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:14px">' +
          '<div style="font-size:12px;color:#8996B4;margin-bottom:10px;font-weight:700">Oder: Eigenen Termin eintragen</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
            '<input type="date" id="admin-datum" style="padding:9px 12px;background:#1e3048;border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#F7F9FF;font-family:Calibri,sans-serif;font-size:13px;outline:none">' +
            '<input type="time" id="admin-uhrzeit" value="14:30" style="padding:9px 12px;background:#1e3048;border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#F7F9FF;font-family:Calibri,sans-serif;font-size:13px;outline:none">' +
          '</div>' +
          '<button onclick="bestaetigeEigenerTermin(\'' + termin.id + '\')" style="width:100%;margin-top:10px;padding:10px;background:#D4620A;color:#fff;border:none;border-radius:8px;font-family:Bahnschrift SemiBold,Calibri,sans-serif;font-size:14px;cursor:pointer">Eigenen Termin bestätigen</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

async function bestaetigeAlternativtermin(terminId, datum, uhrzeit) {
  if (!confirm('Diesen Alternativtermin als neuen Spieltermin bestätigen?\nAlle Alternativtermine und alten Abstimmungen werden gelöscht.')) return;
  await _verschiebungFertigstellen(terminId, datum, uhrzeit);
}

async function bestaetigeEigenerTermin(terminId) {
  const datum   = document.getElementById('admin-datum').value;
  const uhrzeit = document.getElementById('admin-uhrzeit').value;
  if (!datum) { alert('Bitte ein Datum eingeben.'); return; }
  if (!confirm('Neuen Termin bestätigen?\nAlle Alternativtermine und alten Abstimmungen werden gelöscht.')) return;
  await _verschiebungFertigstellen(terminId, datum, uhrzeit);
}

async function _verschiebungFertigstellen(terminId, datum, uhrzeit) {
  const neuerToken = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);

  // 1. Spieltermin aktualisieren
  const { error: te } = await sb.from('spieltermine').update({
    datum: datum, uhrzeit: uhrzeit || null,
    status: 'Verschoben', abfrage_token: neuerToken
  }).eq('id', terminId);
  if (te) { alert('Fehler: ' + te.message); return; }

  // 2. Alte Abstimmungen löschen
  await sb.from('verfuegbarkeiten').delete().eq('spieltermin_id', terminId);

  // 3. Alle Alternativtermine löschen
  const { data: alts } = await sb.from('alternativtermine').select('id').eq('spieltermin_id', terminId);
  if (alts && alts.length > 0) {
    for (const alt of alts) {
      await sb.from('verfuegbarkeiten').delete().eq('alternativtermin_id', alt.id);
    }
    await sb.from('alternativtermine').delete().eq('spieltermin_id', terminId);
  }

  document.querySelector('[style*="fixed"]')?.remove();
  await ladeMannschaft(aktiveMannschaft.id);
  alert('✓ Termin bestätigt. Der MF kann jetzt den neuen WhatsApp-Link schicken.');
}

// ============================================================
// Fehlende Rückmeldungen anzeigen
// ============================================================
function zeigeFehlende(terminId, altTerminId) {
  const termin = alleTermine.find(t => t.id === terminId);
  if (!termin) return;

  // Alternativtermin-Info wenn vorhanden
  const altTermin = altTerminId
    ? alleAlternativtermine.find(a => a.id === altTerminId)
    : null;

  const hatGeantwortet = alleVerfueg
    .filter(v => v.spieltermin_id === terminId &&
      (altTerminId ? v.alternativtermin_id === altTerminId : v.alternativtermin_id === null))
    .map(v => v.spieler_id);

  const nochNicht = alleSpieler.filter(s => !hatGeantwortet.includes(s.id));
  const haben     = alleSpieler.filter(s => hatGeantwortet.includes(s.id));

  function vorname(n) { const p = n.split(','); return p.length===2 ? p[1].trim()+' '+p[0].trim() : n; }

  const d = altTermin
    ? new Date(altTermin.datum).toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'2-digit' }) +
      (altTermin.uhrzeit ? ' · ' + altTermin.uhrzeit.slice(0,5) + ' Uhr' : '')
    : new Date(termin.datum).toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'2-digit' });

  const titel = altTermin
    ? 'Alternativtermin · ' + (termin.heim?'Heim':'Auswärts') + ' gegen ' + termin.gegner
    : 'Rückmeldungen · ' + (termin.heim?'Heim':'Auswärts') + ' gegen ' + termin.gegner;

  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px';

  const fehlenHtml = nochNicht.length === 0
    ? '<div style="font-size:13px;color:#4FD4A8;padding:8px 0">✓ Alle haben geantwortet!</div>'
    : nochNicht.map(s =>
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#1e3048;border-radius:6px;margin-bottom:6px">' +
          '<span style="font-size:13px;color:#F7F9FF">' + vorname(s.name) + '</span>' +
          '<span style="font-size:11px;color:#F08080;font-weight:700">Keine Antwort</span>' +
        '</div>'
      ).join('');

  const habenHtml = haben.map(s => {
    const v = alleVerfueg.find(v =>
      v.spieltermin_id === terminId &&
      v.spieler_id === s.id &&
      (altTerminId ? v.alternativtermin_id === altTerminId : v.alternativtermin_id === null)
    );
    const farbe = v?.antwort === 'Ja' ? '#4FD4A8' : v?.antwort === 'Nein' ? '#F08080' : '#F0C060';
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#1e3048;border-radius:6px;margin-bottom:6px">' +
      '<span style="font-size:13px;color:#F7F9FF">' + vorname(s.name) + '</span>' +
      '<span style="font-size:11px;font-weight:700;color:' + farbe + '">' + (v?.antwort || '–') + '</span>' +
    '</div>';
  }).join('');

  modal.innerHTML =
    '<div style="background:#152232;border:1px solid rgba(255,255,255,0.12);border-radius:16px;max-width:460px;width:100%;max-height:85vh;overflow-y:auto">' +
      '<div style="padding:18px 20px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#152232">' +
        '<div>' +
          '<div style="font-family:Bahnschrift SemiBold,sans-serif;font-size:15px;color:' + (altTermin ? '#F07830' : '#F07830') + '">' + titel + '</div>' +
          '<div style="font-size:12px;color:#8996B4;margin-top:2px">' + d + '</div>' +
        '</div>' +
        '<button onclick="this.closest(\'[style*=fixed]\').remove()" style="background:none;border:none;color:#8996B4;font-size:20px;cursor:pointer">✕</button>' +
      '</div>' +
      '<div style="padding:16px 20px">' +
        (nochNicht.length > 0
          ? '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;color:#F08080;margin-bottom:8px">Noch keine Antwort (' + nochNicht.length + ')</div>' +
            fehlenHtml +
            '<div style="height:1px;background:rgba(255,255,255,0.08);margin:14px 0"></div>'
          : '') +
        '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;color:#8996B4;margin-bottom:8px">Haben geantwortet (' + haben.length + ')</div>' +
        habenHtml +
      '</div>' +
    '</div>';

  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

// ============================================================
// WhatsApp kopieren
// ============================================================
function kopierenWA(btn, text) {
  const decoded = text.replace(/\\n/g, '\n');
  navigator.clipboard.writeText(decoded).then(function() {
    btn.classList.add('kopiert');
    setTimeout(function() { btn.classList.remove('kopiert'); }, 2500);
  }).catch(function() {
    const ta = document.createElement('textarea');
    ta.value = decoded;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btn.classList.add('kopiert');
    setTimeout(function() { btn.classList.remove('kopiert'); }, 2500);
  });
}

// ============================================================
// Start
// ============================================================
init();
