// ============================================================
// Spielplan-App · app.js
// !! HIER deine Supabase-Daten eintragen !!
// ============================================================
const SUPABASE_URL  = 'https://nwutgxjnverlvmkrpiep.supabase.co';       // z.B. https://xyzxyz.supabase.co
const SUPABASE_ANON = 'sb_publishable_09tn0DY3wswcIVQ-mN1S8A_znKWQXaF';             // Settings → API → anon public
const VEREIN_KUERZEL = 'fcstrass';
const MIN_SPIELER = 4;                             // Mindestanzahl für "ausreichend"

// ============================================================
// Init
// ============================================================
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

let alleMannschaften = [];
let aktiveMannschaft = null;
let alleTermine      = [];
let alleVerfueg      = [];
let alleSpieler      = [];

async function init() {
  if (SUPABASE_URL === 'DEINE_SUPABASE_URL') {
    document.getElementById('header-status').textContent = 'Noch nicht verbunden';
    return;
  }
  document.getElementById('config-hint').style.display = 'none';

  try {
    // Verein laden
    const { data: verein, error: ve } = await sb
      .from('vereine').select('id').eq('kuerzel', VEREIN_KUERZEL).single();
    if (ve) throw ve;

    // Mannschaften laden
    const { data: mfs } = await sb
      .from('mannschaften').select('*').eq('verein_id', verein.id).order('name');
    alleMannschaften = mfs || [];

    // Tabs rendern
    renderTabs();

    // Erste Mannschaft aktivieren
    if (alleMannschaften.length > 0) {
      await ladeMannschaft(alleMannschaften[0].id);
    }

    document.getElementById('header-status').textContent =
      `Verbunden · ${new Date().toLocaleTimeString('de-DE', {hour:'2-digit',minute:'2-digit'})}`;

  } catch (err) {
    document.getElementById('header-status').textContent = 'Verbindungsfehler';
    document.getElementById('table-container').innerHTML =
      `<div class="config-hint"><strong style="color:#E24B4A">Fehler:</strong> ${err.message}</div>`;
  }
}

// ============================================================
// Tabs
// ============================================================
function renderTabs() {
  const el = document.getElementById('tabs');
  el.innerHTML = alleMannschaften.map(m => `
    <button class="tab" onclick="ladeMannschaft('${m.id}')" data-id="${m.id}">
      ${m.name} <span style="font-size:11px;opacity:.7">· ${m.liga}</span>
    </button>
  `).join('');
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
    `<div class="loading"><span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></div>`;

  // Parallel laden
  const [termineRes, spielerRes] = await Promise.all([
    sb.from('spieltermine').select('*').eq('mannschaft_id', mannschaftId).order('datum'),
    sb.from('spieler').select('*').eq('mannschaft_id', mannschaftId).eq('aktiv', true)
  ]);

  alleTermine = termineRes.data || [];
  alleSpieler = spielerRes.data || [];

  // Verfügbarkeiten für alle Termine laden
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
    const zusagen = zaehleAntworten(t.id, 'Ja');
    const hatAbfrage = alleVerfueg.some(v => v.spieltermin_id === t.id);
    if (!hatAbfrage) { offen++; return; }
    if (zusagen >= MIN_SPIELER) ok++; else krit++;
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
  if (ja >= MIN_SPIELER - 1) return 'warn';
  return 'crit';
}

function ampelText(terminId) {
  const hat = alleVerfueg.some(v => v.spieltermin_id === terminId);
  if (!hat) return 'Keine Abfrage';
  const ja = zaehleAntworten(terminId, 'Ja');
  const nein = zaehleAntworten(terminId, 'Nein');
  const bed  = zaehleAntworten(terminId, 'Bedingt');
  return `${ja} Ja · ${bed} Bedingt · ${nein} Nein`;
}

// ============================================================
// Tabelle rendern
// ============================================================
function renderTabelle() {
  if (alleTermine.length === 0) {
    document.getElementById('table-container').innerHTML =
      `<div class="loading" style="padding:40px">Keine Spieltermine vorhanden.</div>`;
    return;
  }

  const baseUrl = window.location.origin + window.location.pathname.replace('index.html','');

  const rows = alleTermine.map(t => {
    const d = new Date(t.datum);
    const wt = d.toLocaleDateString('de-DE', { weekday: 'short' });
    const dt = d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' });
    const uhr = t.uhrzeit ? t.uhrzeit.slice(0,5) + ' Uhr' : '';
    const kl  = ampelKlasse(t.id);
    const txt = ampelText(t.id);
    const abfrageLink = `${baseUrl}spieler.html?token=${t.abfrage_token}`;

    const ampelLabels = { ok: 'Ausreichend', warn: 'Knapp', crit: 'Kritisch', offen: 'Offen' };

    // WhatsApp-Text
    const datumLang = new Date(t.datum).toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
    const heimAusw  = t.heim ? 'Heimspiel' : 'Auswärtsspiel';
    const mfName    = aktiveMannschaft?.mf_name?.split(' ')[0] || 'Euer MF';
    const waText = `Hallo zusammen,\nbitte meldet eure Verfügbarkeit für unser Spiel:\n\n🏓 ${heimAusw} gegen ${t.gegner}\n📅 ${datumLang}${uhr ? ' · ' + uhr : ''}\n\n👉 ${abfrageLink}\n\nBitte bis Mittwoch antworten. Danke!\n– ${mfName}`;

    return `<tr>
      <td>
        <div class="datum-block">
          <div class="datum-main">${wt}, ${dt}</div>
          <div class="datum-sub">${uhr}</div>
        </div>
      </td>
      <td><span class="ha-badge ${t.heim ? 'ha-h' : 'ha-a'}">${t.heim ? 'Heim' : 'Auswärts'}</span></td>
      <td style="font-weight:700">${t.gegner}</td>
      <td>
        <span class="ampel ${kl}">
          <span class="ampel-dot"></span>
          ${ampelLabels[kl]} · ${txt}
        </span>
      </td>
      <td style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <a class="btn-abfrage" href="${abfrageLink}" target="_blank">Link öffnen</a>
        <button class="btn-wa" onclick="kopierenWA(this, \`${waText.replace(/`/g,"'")}\`)" title="WhatsApp-Text kopieren">📋 Kopieren</button>
      </td>
    </tr>`;
  }).join('');

  document.getElementById('table-container').innerHTML = `
    <table class="spielplan-table">
      <thead>
        <tr>
          <th>Datum</th>
          <th>H/A</th>
          <th>Gegner</th>
          <th>Verfügbarkeit</th>
          <th>Aktion</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ============================================================
// WhatsApp-Text kopieren
// ============================================================
function kopierenWA(btn, text) {
  navigator.clipboard.writeText(text).then(function() {
    btn.textContent = '✓ Kopiert!';
    btn.classList.add('kopiert');
    setTimeout(function() {
      btn.textContent = '📋 Kopieren';
      btn.classList.remove('kopiert');
    }, 2500);
  }).catch(function() {
    // Fallback für ältere Browser
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btn.textContent = '✓ Kopiert!';
    btn.classList.add('kopiert');
    setTimeout(function() {
      btn.textContent = '📋 Kopieren';
      btn.classList.remove('kopiert');
    }, 2500);
  });
}

// ============================================================
// Start
// ============================================================
init();
