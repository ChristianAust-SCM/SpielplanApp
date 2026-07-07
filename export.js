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

      const minSpieler = mf.min_spieler || 6;

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
        `Mindestens ${minSpieler} Ja-Zusagen erforderlich  ·  ✓ Ja  ·  ? Vielleicht  ·  ✗ Nein  ·  – Keine Antwort`,
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
        const sumBg = !hatAntworten ? OFFEN_BG : ja >= minSpieler ? JA_BG : ja >= minSpieler - 2 ? VIEL_BG : NEIN_BG;
        const sumFg = !hatAntworten ? OFFEN_FG : ja >= minSpieler ? JA_FG : ja >= minSpieler - 2 ? VIEL_FG : NEIN_FG;
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
      ws[encC(sumRow,0)] = cs(`Spielbereit (≥${minSpieler} Ja):`, { font: hFont(WHITE, true, 10), fill: hFill(NAVY), alignment: hAlign("right","center") });
      const spielbereit = termine.filter(t => jaSum(t.id) >= minSpieler).length;
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
    XLSX.writeFile(wb, dateiname, { cellStyles: true });

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
    s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('SheetJS konnte nicht geladen werden'));
    document.head.appendChild(s);
  });
}

// ============================================================
// PDF-Export · jsPDF + autoTable
// ============================================================

async function exportPDF() {
  const btn = document.getElementById('btn-export-pdf');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Wird erstellt...'; }

  try {
    await ladePDFLibs();
    const { jsPDF } = window.jspdf;

    // Farben
    const NAVY    = [13,  27,  42];
    const NAVY2   = [21,  34,  50];
    const NAVY3   = [30,  48,  72];
    const ORANGE  = [212, 98,  10];
    const TEAL    = [29,  158, 117];
    const PURPLE  = [83,  74,  183];
    const WHITE   = [247, 249, 255];
    const MUTED   = [137, 150, 180];
    const JA_BG   = [212, 240, 228]; const JA_FG   = [15,  110, 86];
    const NEIN_BG = [250, 215, 215]; const NEIN_FG = [163, 45,  45];
    const VIEL_BG = [255, 240, 192]; const VIEL_FG = [133, 79,  11];
    const OFFEN_BG= [235, 235, 235]; const OFFEN_FG= [136, 136, 136];

    const mf = alleMannschaften.find(m => m.id === aktiveMannschaftId) || alleMannschaften[0];
    if (!mf) throw new Error('Keine Mannschaft gefunden');

    {
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

      const minSpieler = mf.min_spieler || 6;

      function vorname(dbName) {
        const p = dbName.split(',');
        if (p.length !== 2) return dbName;
        const vn = p[1].trim().split(' ')[0];
        const nn = p[0].trim();
        return vn.charAt(0) + '. ' + nn;
      }

      function getAntwort(terminId, spielerId) {
        const v = verfueg.find(v => v.spieltermin_id === terminId && v.spieler_id === spielerId);
        return v ? v.antwort : '';
      }

      function jaSum(terminId) {
        return spieler.filter(sp => getAntwort(terminId, sp.id) === 'Ja').length;
      }

      // ── Hochformat A4, eine Seite pro Mannschaft ──────
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const PW = doc.internal.pageSize.getWidth();   // 210
      const PH = doc.internal.pageSize.getHeight();  // 297
      const ML = 12; // margin left
      const MR = 12; // margin right
      const CW = PW - ML - MR; // content width = 186

      // ── Seitenhintergrund ─────────────────────────────
      doc.setFillColor(...NAVY);
      doc.rect(0, 0, PW, PH, 'F');

      // ── Header-Block ──────────────────────────────────
      doc.setFillColor(...NAVY2);
      doc.roundedRect(ML, 8, CW, 24, 3, 3, 'F');

      // Oranger Akzentbalken links
      doc.setFillColor(...ORANGE);
      doc.roundedRect(ML, 8, 3, 24, 1, 1, 'F');

      // FC Strass
      doc.setTextColor(...WHITE);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('FC Strass e.V.', ML + 7, 17);

      // Liga + Mannschaft
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text('Verfuegbarkeit Vorrunde 2026/27', ML + 7, 24);

      // Mannschaft rechts oben
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...ORANGE);
      doc.text(mf.name, PW - MR, 17, { align: 'right' });

      // Liga + MF rechts unten
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(mf.liga + '  |  MF: ' + (mf.mf_name || '-'), PW - MR, 24, { align: 'right' });

      // ── Statistik-Zeile ───────────────────────────────
      const spielbereit = termine.filter(t => jaSum(t.id) >= minSpieler).length;
      const zuWenig     = termine.filter(t => {
        const ja = jaSum(t.id);
        return verfueg.some(v => v.spieltermin_id === t.id) && ja < minSpieler;
      }).length;

      const stats = [
        { label: 'Spieltage',          value: String(termine.length),  bg: NAVY3,   fg: WHITE  },
        { label: 'Spielbereit',         value: String(spielbereit),     bg: JA_BG,   fg: JA_FG  },
        { label: 'Zu wenig Zusagen',    value: String(zuWenig),         bg: NEIN_BG, fg: NEIN_FG},
        { label: 'Mind. Zusagen',       value: String(minSpieler),      bg: NAVY3,   fg: ORANGE },
      ];

      const statW = CW / stats.length;
      stats.forEach((s, i) => {
        const sx = ML + i * statW;
        doc.setFillColor(...s.bg);
        doc.roundedRect(sx, 36, statW - 2, 14, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(...s.fg);
        doc.text(s.value, sx + statW / 2 - 1, 45, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...MUTED);
        doc.text(s.label.toUpperCase(), sx + statW / 2 - 1, 48.5, { align: 'center' });
      });

      // ── Legende ───────────────────────────────────────
      const legendItems = [
        { label: 'Ja',         bg: JA_BG,    fg: JA_FG   },
        { label: 'Vielleicht', bg: VIEL_BG,  fg: VIEL_FG },
        { label: 'Nein',       bg: NEIN_BG,  fg: NEIN_FG },
        { label: 'Offen',      bg: OFFEN_BG, fg: OFFEN_FG},
      ];
      let lx = ML;
      legendItems.forEach(l => {
        doc.setFillColor(...l.bg);
        doc.roundedRect(lx, 53, 22, 5, 1, 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...l.fg);
        doc.text(l.label, lx + 11, 56.5, { align: 'center' });
        lx += 24;
      });

      // ── Spieltag-Cards ────────────────────────────────
      let y = 62;
      const CARD_PAD  = 3;
      const PILL_H    = 6;
      const PILL_PAD  = 2;

      termine.forEach((t, ti) => {
        const ja  = jaSum(t.id);
        const hatAntworten = verfueg.some(v => v.spieltermin_id === t.id);
        const d   = new Date(t.datum);
        const wt  = d.toLocaleDateString('de-DE', { weekday: 'short' });
        const dt  = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
        const uhr = t.uhrzeit ? t.uhrzeit.slice(0,5) : '';

        // Ampelfarbe für die Card
        let cardAccent;
        if (!hatAntworten)         cardAccent = MUTED;
        else if (ja >= minSpieler) cardAccent = TEAL;
        else if (ja >= minSpieler - 2) cardAccent = [212, 160, 10];
        else                       cardAccent = [200, 60, 60];

        // Card-Höhe dynamisch: Header-Zeile + Spieler-Pills
        const pillsPerRow = Math.floor((CW - 2 * CARD_PAD - 55) / 30);
        const pillRows    = Math.ceil(spieler.length / Math.max(pillsPerRow, 1));
        const cardH       = 10 + pillRows * (PILL_H + 2) + CARD_PAD;

        // Seitenumbruch prüfen
        if (y + cardH > PH - 14) {
          doc.addPage();
          doc.setFillColor(...NAVY);
          doc.rect(0, 0, PW, PH, 'F');
          y = 12;
        }

        // Card-Hintergrund
        doc.setFillColor(...NAVY2);
        doc.roundedRect(ML, y, CW, cardH, 2, 2, 'F');

        // Linker Akzentbalken (Ampelfarbe)
        doc.setFillColor(...cardAccent);
        doc.roundedRect(ML, y, 3, cardH, 1, 1, 'F');

        // Datum + Uhrzeit
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...WHITE);
        doc.text(wt + ' ' + dt, ML + 6, y + 6);

        if (uhr) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(...MUTED);
          doc.text(uhr + ' Uhr', ML + 6, y + 10.5);
        }

        // H/A Badge
        const haX = ML + 32;
        const haColor = t.heim ? PURPLE : ORANGE;
        const haText  = t.heim ? 'HEIM' : 'AUSW';
        doc.setFillColor(...haColor.map(c => Math.min(255, c + 160)));
        doc.roundedRect(haX, y + 2.5, 13, 5, 1, 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.setTextColor(...haColor);
        doc.text(haText, haX + 6.5, y + 6.2, { align: 'center' });

        // Gegner
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(...WHITE);
        const gegnerX = haX + 16;
        doc.text(t.gegner, gegnerX, y + 6, { maxWidth: CW - gegnerX + ML - 20 });

        // Anzahl Ja – rechts
        const jaColor = !hatAntworten ? OFFEN_FG : ja >= minSpieler ? JA_FG : ja < minSpieler - 2 ? NEIN_FG[0] ? NEIN_FG : NEIN_FG : VIEL_FG;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(...(ja >= minSpieler ? JA_FG : ja >= minSpieler - 2 ? VIEL_FG : hatAntworten ? NEIN_FG : OFFEN_FG));
        doc.text(hatAntworten ? String(ja) : '-', PW - MR, y + 7, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(...MUTED);
        doc.text('Ja', PW - MR, y + 10.5, { align: 'right' });

        // ── Spieler-Pills ─────────────────────────────
        const pillStartX = ML + CARD_PAD;
        const pillW      = 29;
        const pillsInRow = Math.floor((CW - 2 * CARD_PAD) / (pillW + 1));
        let px = pillStartX;
        let py = y + 12;

        spieler.forEach((sp, si) => {
          if (si > 0 && si % pillsInRow === 0) {
            px  = pillStartX;
            py += PILL_H + 2;
          }

          const ant = getAntwort(t.id, sp.id);
          let pillBg, pillFg;
          if (ant === 'Ja')         { pillBg = JA_BG;    pillFg = JA_FG;   }
          else if (ant === 'Nein')  { pillBg = NEIN_BG;  pillFg = NEIN_FG; }
          else if (ant === 'Vielleicht') { pillBg = VIEL_BG; pillFg = VIEL_FG; }
          else                      { pillBg = NAVY3;    pillFg = MUTED;   }

          doc.setFillColor(...pillBg);
          doc.roundedRect(px, py, pillW, PILL_H, 1, 1, 'F');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.5);
          doc.setTextColor(...pillFg);
          doc.text(vorname(sp.name), px + pillW / 2, py + 4, { align: 'center', maxWidth: pillW - 2 });

          px += pillW + 1;
        });

        y += cardH + 3;
      });

      // ── Footer ────────────────────────────────────────
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      const now = new Date().toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
      doc.text('FC Strass e.V.  |  ' + mf.name + '  |  Erstellt: ' + now, ML, PH - 6);
      doc.text('Seite 1', PW - MR, PH - 6, { align: 'right' });
      doc.setDrawColor(...NAVY3);
      doc.setLineWidth(0.3);
      doc.line(ML, PH - 9, PW - MR, PH - 9);

      const heute = new Date().toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }).replace(/\./g,'-');
      const name  = mf.name.replace(/\./g,'').trim().replace(/\s+/g,'_');
      doc.save('FCStrass_' + name + '_Verfuegbarkeit_' + heute + '.pdf');
    }

  } catch (err) {
    alert('Fehler beim PDF-Export: ' + err.message);
    console.error(err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📄 PDF exportieren'; }
  }
}

function ladePDFLibs() {
  return new Promise((resolve, reject) => {
    if (window.jspdf && window.jspdf.jsPDF) { resolve(); return; }
    const s1 = document.createElement('script');
    s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s1.onload = () => {
      const s2 = document.createElement('script');
      s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
      s2.onload = resolve;
      s2.onerror = () => reject(new Error('autoTable konnte nicht geladen werden'));
      document.head.appendChild(s2);
    };
    s1.onerror = () => reject(new Error('jsPDF konnte nicht geladen werden'));
    document.head.appendChild(s1);
  });
}
