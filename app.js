// ============================================================
// Spielplan-App · app.js
// ============================================================
const SUPABASE_URL  = 'https://nwutgxjnverlvmkrpiep.supabase.co';
const SUPABASE_ANON = 'sb_publishable_09tn0DY3wswcIVQ-mN1S8A_znKWQXaF';
const VEREIN_KUERZEL = 'fcstrass';
const MIN_SPIELER = 6;

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

let alleMannschaften = [];
let aktiveMannschaft = null;
let alleTermine      = [];
let alleVerfueg      = [];
let alleSpieler      = [];
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
      .map(r => r.mannschaften)
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
    const { data: vd } = await sb.from('verfuegbarkeiten')
      .select('*').in('spieltermin_id', ids);
    alleVerfueg = vd || [];
  } else {
    alleVerfueg = [];
  }

  renderStats();
  renderTabelle();
}

// ============================================================
// Statistiken
// ============================================================
function renderStats() {
  const gesamt = alleTermine.length;
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
}

function zaehleAntworten(terminId, antwort) {
  return alleVerfueg.filter(v =>
    v.spieltermin_id === terminId && v.antwort === antwort
  ).length;
}

function ampelKlasse(terminId) {
  const hatAbfrage = alleVerfueg.some(v => v.spieltermin_id === terminId);
  if (!hatAbfrage) return 'offen';
  const ja = zaehleAntworten(terminId, 'Ja');
  if (ja >= MIN_SPIELER) return 'ok';
  if (ja >= 4) return 'warn';
  return 'crit';
}

function ampelText(terminId) {
  const hat = alleVerfueg.some(v => v.spieltermin_id === terminId);
  if (!hat) return 'Keine Abfrage';
  const ja         = zaehleAntworten(terminId, 'Ja');
  const nein       = zaehleAntworten(terminId, 'Nein');
  const vielleicht = zaehleAntworten(terminId, 'Vielleicht');
  return ja + ' Ja · ' + vielleicht + ' Vielleicht · ' + nein + ' Nein';
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

  const baseUrl = window.location.origin + window.location.pathname.replace('index.html','');
  const ampelLabels = { ok: 'Spielbereit', warn: 'Zu wenig', crit: 'Nicht spielbereit', offen: 'Offen' };

  const rows = alleTermine.map(function(t) {
    const d   = new Date(t.datum);
    const wt  = d.toLocaleDateString('de-DE', { weekday: 'short' });
    const dt  = d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' });
    const uhr = t.uhrzeit ? t.uhrzeit.slice(0,5) + ' Uhr' : '';
    const kl  = ampelKlasse(t.id);
    const txt = ampelText(t.id);
    const abfrageLink = baseUrl + 'spieler.html?token=' + t.abfrage_token;

    const datumLang = d.toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
    const heimAusw  = t.heim ? 'Heimspiel' : 'Auswärtsspiel';
    const mfName    = aktiveMannschaft?.mf_name?.split(' ')[0] || 'Euer MF';
    const waText    = 'Hallo zusammen,\nbitte meldet eure Verfügbarkeit für unser Spiel:\n\n🏓 ' + heimAusw + ' gegen ' + t.gegner + '\n📅 ' + datumLang + (uhr ? ' · ' + uhr : '') + '\n\n👉 ' + abfrageLink + '\n\nBitte bis Mittwoch antworten. Danke!\n– ' + mfName;

    const statusBadge = t.status === 'Verschoben'
      ? '<span style="color:#F0B429;font-size:11px;font-weight:700"> · VERSCHOBEN</span>' : '';

    return '<tr>' +
      '<td><div class="datum-block"><div class="datum-main">' + wt + ', ' + dt + statusBadge + '</div><div class="datum-sub">' + uhr + '</div></div></td>' +
      '<td><span class="ha-badge ' + (t.heim ? 'ha-h' : 'ha-a') + '">' + (t.heim ? 'Heim' : 'Auswärts') + '</span></td>' +
      '<td style="font-weight:700">' + t.gegner + '</td>' +
      '<td><span class="ampel ' + kl + '"><span class="ampel-dot"></span>' + ampelLabels[kl] + ' · ' + txt + '</span></td>' +
      '<td style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        '<a class="btn-abfrage" href="' + abfrageLink + '" target="_blank">Link öffnen</a>' +
        '<button class="btn-wa" onclick="kopierenWA(this, \'' + waText.replace(/'/g, "\\'").replace(/\n/g, '\\n') + '\')">📋 Kopieren</button>' +
        '<button class="btn-detail" onclick="zeigeDetail(\'' + t.id + '\')">👥 Wer?</button>' +
      '</td>' +
    '</tr>';
  }).join('');

  document.getElementById('table-container').innerHTML =
    '<table class="spielplan-table">' +
      '<thead><tr>' +
        '<th>Datum</th><th>H/A</th><th>Gegner</th><th>Verfügbarkeit</th><th>Aktion</th>' +
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
// WhatsApp kopieren
// ============================================================
function kopierenWA(btn, text) {
  const decoded = text.replace(/\\n/g, '\n');
  navigator.clipboard.writeText(decoded).then(function() {
    btn.textContent = '✓ Kopiert!';
    btn.classList.add('kopiert');
    setTimeout(function() { btn.textContent = '📋 Kopieren'; btn.classList.remove('kopiert'); }, 2500);
  }).catch(function() {
    const ta = document.createElement('textarea');
    ta.value = decoded;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btn.textContent = '✓ Kopiert!';
    btn.classList.add('kopiert');
    setTimeout(function() { btn.textContent = '📋 Kopieren'; btn.classList.remove('kopiert'); }, 2500);
  });
}

// ============================================================
// Start
// ============================================================
init();
