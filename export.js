// ============================================================
// Excel-Export · export.js
// Layout identisch zur Vorschau-Datei
// ============================================================

async function exportExcel() {
  const btn = document.getElementById('btn-export');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Wird erstellt...'; }

  try {
    await ladeSheetJS();
    const XLSX = window.XLSX;
    const wb   = XLSX.utils.book_new();

    // Farben
    const NAVY    = "0D1B2A", NAVY2 = "152232", NAVY3 = "1E3048";
    const ORANGE  = "D4620A", WHITE = "F7F9FF", MUTED = "8996B4";
    const TEAL    = "1D9E75", PURPLE = "534AB7";
    const JA_BG   = "D4F0E4", JA_FG = "0F6E56";
    const NEIN_BG = "FAD7D7", NEIN_FG = "A32D2D";
    const VIEL_BG = "FFF0C0", VIEL_FG = "854F0B";
    const OFFEN_BG= "EBEBEB", OFFEN_FG = "888888";

    function cs(v, s) { return { v, s }; }

    function hFill(hex) { return { fgColor: { rgb: hex }, patternType: "solid" }; }

    function hFont(hex, bold, sz, name) {
      return { color: { rgb: hex }, bold: !!bold, sz: sz || 10, name: name || "Calibri" };
    }

    function hAlign(h, v, wrap) {
      return { horizontal: h || "left", vertical: v || "center", wrapText: !!wrap };
    }

    function hBorder(hex) {
      const s = { style: "thin", color: { rgb: hex || "DDDDDD" } };
      return { bottom: s };
    }

    function antwortCell(antwort) {
      if (antwort === "Ja")         return cs("✓", { font: hFont(JA_FG,   true, 11), fill: hFill(JA_BG),   alignment: hAlign("center"), border: hBorder() });
      if (antwort === "Nein")       return cs("✗", { font: hFont(NEIN_FG, true, 11), fill: hFill(NEIN_BG), alignment: hAlign("center"), border: hBorder() });
      if (antwort === "Vielleicht") return cs("?", { font: hFont(VIEL_FG, true, 11), fill: hFill(VIEL_BG), alignment: hAlign("center"), border: hBorder() });
      return cs("–", { font: hFont(OFFEN_FG, false, 11), fill: hFill(OFFEN_BG), alignment: hAlign("center"), border: hBorder() });
    }

    // Für jede Mannschaft ein Blatt
    for (const mf of alleMannschaften) {
      const [termRes, spRes] = await Promise.all([
        sb.from('spieltermine').select('*').eq('mannschaft_id', mf.id).order('datum'),
        sb.from('spieler').select('*').eq('mannschaft_id', mf.id).eq('aktiv', true).order('name')
      ]);

      const termine = termRes.data || [];
      const spieler = spRes.data  || [];
      let verfueg = [];

      if (termine.length > 0) {
        const { data: vd } = await sb.from('verfuegbarkeiten')
          .select('*').in('spieltermin_id', termine.map(t => t.id));
        verfueg = vd || [];
      }

      function vorname(dbName) {
        const p = dbName.split(',');
        return p.length === 2 ? p[1].trim() + ' ' + p[0].trim() : dbName;
      }

      function getAntwort(terminId, spielerId) {
        const v = verfueg.find(v => v.spieltermin_id === terminId && v.spieler_id === spielerId);
        return v ? v.antwort : '';
      }

      function jaSum(terminId) {
        return spieler.filter(sp => getAntwort(terminId, sp.id) === 'Ja').length;
      }

      const nSp     = spieler.length;
      const lastCol = 5 + nSp;
      const ws      = {};
      const merges  = [];
      const rows    = ws['!rows'] = [];
      const encC    = (r, c) => XLSX.utils.encode_cell({ r, c });

      // ── Zeile 1: Titel ──────────────────────────────────
      rows.push({ hpt: 32 });
      merges.push({ s: { r:0, c:0 }, e: { r:0, c:lastCol } });
      ws[encC(0,0)] = cs(
        `FC Strass e.V.  ·  Verfügbarkeit Vorrunde 2026/27  ·  ${mf.name}  ·  ${mf.liga}`,
        { font: hFont(WHITE, true, 13), fill: hFill(NAVY), alignment: hAlign("left","center") }
      );

      // ── Zeile 2: MF + Legende ───────────────────────────
      rows.push({ hpt: 18 });
      merges.push({ s: { r:1, c:0 }, e: { r:1, c:2 } });
      ws[encC(1,0)] = cs(
        `Mannschaftsführer: ${mf.mf_name || '–'}`,
        { font: hFont(MUTED, false, 9), fill: hFill(NAVY2), alignment: hAlign("left","center") }
      );
      merges.push({ s: { r:1, c:3 }, e: { r:1, c:lastCol } });
      ws[encC(1,3)] = cs(
        "Mindestens 6 Ja-Zusagen erforderlich  ·  ✓ Ja  ·  ? Vielleicht  ·  ✗ Nein  ·  – Keine Antwort",
        { font: hFont(ORANGE, true, 9), fill: hFill(NAVY2), alignment: hAlign("left","center") }
      );

      // ── Zeile 3: Trenner ────────────────────────────────
      rows.push({ hpt: 6 });
      for (let c = 0; c <= lastCol; c++) ws[encC(2,c)] = cs('', { fill: hFill(NAVY3) });

      // ── Zeile 4: Spaltenheader ──────────────────────────
      rows.push({ hpt: 28 });
      ['Datum','H/A','Gegner','Status','Σ Ja'].forEach((h, i) => {
        ws[encC(3,i)] = cs(h, {
          font: hFont(WHITE, true, 10), fill: hFill(NAVY),
          alignment: hAlign("center","center"), border: hBorder(MUTED)
        });
      });
      spieler.forEach((sp, i) => {
        ws[encC(3, 5+i)] = cs(vorname(sp.name), {
          font: hFont(WHITE, true, 9), fill: hFill(NAVY2),
          alignment: hAlign("center","center", true), border: hBorder(MUTED)
        });
      });

      // ── Datenzeilen ─────────────────────────────────────
      termine.forEach((t, ri) => {
        const row   = 4 + ri;
        rows.push({ hpt: 20 });
        const rowBg = ri % 2 === 0 ? "F8FAFB" : WHITE;
        const d     = new Date(t.datum);
        const dt    = d.toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', year:'2-digit' });
        const ja    = jaSum(t.id);
        const hatAntworten = verfueg.some(v => v.spieltermin_id === t.id);

        // Datum
        ws[encC(row,0)] = cs(dt, { font: hFont(NAVY, true, 10), fill: hFill(rowBg), alignment: hAlign("left","center"), border: hBorder() });

        // H/A
        const haBg = t.heim ? "EEEDFE" : "FAECE7";
        const haFg = t.heim ? PURPLE : ORANGE;
        ws[encC(row,1)] = cs(t.heim ? 'Heim' : 'Auswärts', { font: hFont(haFg, true, 9), fill: hFill(haBg), alignment: hAlign("center","center"), border: hBorder() });

        // Gegner
        ws[encC(row,2)] = cs(t.gegner, { font: hFont(NAVY, true, 10), fill: hFill(rowBg), alignment: hAlign("left","center"), border: hBorder() });

        // Status
        const stFg = t.status === 'Verschoben' ? ORANGE : t.status === 'Bestätigt' ? TEAL : MUTED;
        ws[encC(row,3)] = cs(t.status || 'Geplant', { font: hFont(stFg, true, 9), fill: hFill(rowBg), alignment: hAlign("center","center"), border: hBorder() });

        // Σ Ja
        const sumBg = !hatAntworten ? OFFEN_BG : ja >= 6 ? JA_BG : ja >= 4 ? VIEL_BG : NEIN_BG;
        const sumFg = !hatAntworten ? OFFEN_FG : ja >= 6 ? JA_FG : ja >= 4 ? VIEL_FG : NEIN_FG;
        ws[encC(row,4)] = cs(hatAntworten ? ja : '–', { font: hFont(sumFg, true, 11), fill: hFill(sumBg), alignment: hAlign("center","center"), border: hBorder() });

        // Spieler
        spieler.forEach((sp, si) => {
          ws[encC(row, 5+si)] = antwortCell(getAntwort(t.id, sp.id));
        });
      });

      // ── Summenzeile ──────────────────────────────────────
      const sumRow = 4 + termine.length;
      rows.push({ hpt: 22 });
      merges.push({ s: { r:sumRow, c:0 }, e: { r:sumRow, c:3 } });
      ws[encC(sumRow,0)] = cs('Spielbereit (≥6 Ja):', { font: hFont(WHITE, true, 10), fill: hFill(NAVY), alignment: hAlign("right","center") });
      const spielbereit = termine.filter(t => jaSum(t.id) >= 6).length;
      ws[encC(sumRow,4)] = cs(spielbereit, { font: hFont(JA_FG, true, 11), fill: hFill(JA_BG), alignment: hAlign("center","center") });
      for (let c = 5; c <= lastCol; c++) ws[encC(sumRow,c)] = cs('', { fill: hFill(NAVY2) });

      // ── Metadaten ────────────────────────────────────────
      const lastRow = sumRow;
      ws['!ref']    = XLSX.utils.encode_range({ s:{r:0,c:0}, e:{r:lastRow,c:lastCol} });
      ws['!merges'] = merges;
      ws['!cols']   = [
        { wch: 13 }, { wch: 10 }, { wch: 28 }, { wch: 11 }, { wch: 7 },
        ...spieler.map(() => ({ wch: 13 }))
      ];

      const sheetName = mf.name.replace('.','').trim();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }

    const heute    = new Date().toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }).replace(/\./g,'-');
    const dateiname = `FCStrass_Verfuegbarkeit_Vorrunde_${heute}.xlsx`;
    XLSX.writeFile(wb, dateiname);

  } catch (err) {
    alert('Fehler beim Export: ' + err.message);
    console.error(err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📊 Excel exportieren'; }
  }
}

function ladeSheetJS() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('SheetJS konnte nicht geladen werden'));
    document.head.appendChild(s);
  });
}
