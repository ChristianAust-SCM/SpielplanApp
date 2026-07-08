// ============================================================
// Export · export.js
// Excel via ExcelJS · PDF via jsPDF Card-Layout
// ============================================================

// ── Hilfsfunktion: Spielername kürzen ──────────────────────
function _vorname(dbName) {
  const p = dbName.split(',');
  if (p.length !== 2) return dbName;
  return p[1].trim().split(' ')[0].charAt(0) + '. ' + p[0].trim();
}

function _vornameVoll(dbName) {
  const p = dbName.split(',');
  return p.length === 2 ? p[1].trim() + ' ' + p[0].trim() : dbName;
}

// ============================================================
// EXCEL-EXPORT · ExcelJS
// ============================================================

async function exportExcel() {
  const btn = document.getElementById('btn-export');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Wird erstellt...'; }

  try {
    await ladeExcelJS();
    const ExcelJS = window.ExcelJS;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SpielplanApp FC Strass';
    wb.created = new Date();

    // Farben
    const NAVY   = '0D1B2A', NAVY2  = '152232', NAVY3 = '1E3048';
    const ORANGE = 'D4620A', WHITE  = 'F7F9FF', MUTED = '8996B4';
    const TEAL   = '1D9E75', PURPLE = '534AB7';
    const JA_BG  = 'D4F0E4', JA_FG  = '0F6E56';
    const NEIN_BG= 'FAD7D7', NEIN_FG= 'A32D2D';
    const VIEL_BG= 'FFF0C0', VIEL_FG= '854F0B';
    const OFF_BG = 'E8E8E8', OFF_FG = '888888';

    function fill(hex)       { return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } }; }
    function font(hex, bold, sz) { return { color: { argb: 'FF' + hex }, bold: !!bold, size: sz || 10, name: 'Calibri' }; }
    function align(h, v)     { return { horizontal: h || 'left', vertical: v || 'middle', wrapText: false }; }
    function border()        { return { bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } } }; }
    function borderFull(hex) {
      const s = { style: 'thin', color: { argb: 'FF' + (hex || 'DDDDDD') } };
      return { top: s, bottom: s, left: s, right: s };
    }

    const _mf = aktiveMannschaft || alleMannschaften[0];
    if (!_mf) throw new Error('Keine Mannschaft aktiv');
    for (const mf of [_mf]) {
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

      const minSp = mf.min_spieler || 6;

      function getAntwort(tid, sid) {
        const v = verfueg.find(v => v.spieltermin_id === tid && v.spieler_id === sid && (v.alternativtermin_id === null || v.alternativtermin_id === undefined));
        return v ? v.antwort : '';
      }
      function jaSum(tid) {
        return spieler.filter(sp => getAntwort(tid, sp.id) === 'Ja').length;
      }

      const ws = wb.addWorksheet(mf.name.replace(/\./g,'').trim(), {
        views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }]
      });

      const nSp = spieler.length;
      // Spaltenbreiten: Datum | H/A | Gegner | Status | Σ Ja | Spieler...
      ws.columns = [
        { width: 14 }, { width: 10 }, { width: 30 }, { width: 13 }, { width: 7 },
        ...spieler.map(() => ({ width: 14 }))
      ];

      // ── Zeile 1: Titelbalken ────────────────────────────
      ws.mergeCells(1, 1, 1, 5 + nSp);
      const t1 = ws.getCell('A1');
      t1.value = `FC Strass e.V.  ·  Verfügbarkeit Vorrunde 2026/27  ·  ${mf.name}  ·  ${mf.liga}`;
      t1.font  = font(WHITE, true, 13);
      t1.fill  = fill(NAVY);
      t1.alignment = { horizontal: 'left', vertical: 'middle' };
      ws.getRow(1).height = 30;

      // ── Zeile 2: MF + Legende ───────────────────────────
      ws.mergeCells(2, 1, 2, 3);
      const t2a = ws.getCell('A2');
      t2a.value = `Mannschaftsführer: ${mf.mf_name || '–'}`;
      t2a.font  = font(MUTED, false, 9);
      t2a.fill  = fill(NAVY2);
      t2a.alignment = align('left');

      ws.mergeCells(2, 4, 2, 5 + nSp);
      const t2b = ws.getCell('D2');
      t2b.value = `Mindestens ${minSp} Ja-Zusagen erforderlich  ·  Ja = grün  ·  Vielleicht = gelb  ·  Nein = rot  ·  – = keine Antwort`;
      t2b.font  = font(ORANGE, true, 9);
      t2b.fill  = fill(NAVY2);
      t2b.alignment = align('left');
      ws.getRow(2).height = 16;

      // ── Zeile 3: Trenner ────────────────────────────────
      for (let c = 1; c <= 5 + nSp; c++) {
        const cell = ws.getCell(3, c);
        cell.fill = fill(NAVY3);
        cell.value = '';
      }
      ws.getRow(3).height = 4;

      // ── Zeile 4: Spaltenheader ──────────────────────────
      const headers = ['Datum', 'H/A', 'Gegner', 'Status', 'Σ Ja'];
      headers.forEach((h, i) => {
        const cell = ws.getCell(4, i + 1);
        cell.value = h;
        cell.font  = font(WHITE, true, 10);
        cell.fill  = fill(NAVY);
        cell.alignment = align('center', 'middle');
        cell.border = borderFull(MUTED);
      });
      spieler.forEach((sp, i) => {
        const cell = ws.getCell(4, 6 + i);
        cell.value = _vornameVoll(sp.name);
        cell.font  = font(WHITE, true, 9);
        cell.fill  = fill(NAVY2);
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = borderFull(MUTED);
      });
      ws.getRow(4).height = 32;

      // ── Datenzeilen ─────────────────────────────────────
      termine.forEach((t, ri) => {
        const row = ws.getRow(5 + ri);
        row.height = 20;
        const rowBg = ri % 2 === 0 ? 'F0F4F8' : WHITE;
        const d  = new Date(t.datum);
        const dt = d.toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', year:'2-digit' });
        const ja = jaSum(t.id);
        const hatAnt = verfueg.some(v => v.spieltermin_id === t.id);

        // Datum
        const cDat = row.getCell(1);
        cDat.value = dt; cDat.font = font(NAVY, true, 10);
        cDat.fill = fill(rowBg); cDat.alignment = align('left'); cDat.border = border();

        // H/A
        const cHA = row.getCell(2);
        cHA.value = t.heim ? 'Heim' : 'Auswärts';
        cHA.font  = font(t.heim ? PURPLE : ORANGE, true, 9);
        cHA.fill  = fill(t.heim ? 'EEEDFE' : 'FAECE7');
        cHA.alignment = align('center'); cHA.border = border();

        // Gegner
        const cGeg = row.getCell(3);
        cGeg.value = t.gegner; cGeg.font = font(NAVY, true, 10);
        cGeg.fill = fill(rowBg); cGeg.alignment = align('left'); cGeg.border = border();

        // Status
        const stFg = (t.status === 'Verschoben' || t.status === 'Verschiebung nötig') ? ORANGE
                   : t.status === 'Bestätigt' ? TEAL : MUTED;
        const cSt = row.getCell(4);
        cSt.value = t.status || 'Geplant'; cSt.font = font(stFg, true, 9);
        cSt.fill = fill(rowBg); cSt.alignment = align('center'); cSt.border = border();

        // Σ Ja
        const sumBg = !hatAnt ? OFF_BG : ja >= minSp ? JA_BG : ja >= minSp - 2 ? VIEL_BG : NEIN_BG;
        const sumFg = !hatAnt ? OFF_FG : ja >= minSp ? JA_FG : ja >= minSp - 2 ? VIEL_FG : NEIN_FG;
        const cJa = row.getCell(5);
        cJa.value = hatAnt ? ja : '–'; cJa.font = font(sumFg, true, 12);
        cJa.fill = fill(sumBg); cJa.alignment = align('center'); cJa.border = border();

        // Spieler
        spieler.forEach((sp, si) => {
          const ant  = getAntwort(t.id, sp.id);
          const cell = row.getCell(6 + si);
          if (ant === 'Ja')         { cell.value = 'Ja';         cell.font = font(JA_FG,   true, 10); cell.fill = fill(JA_BG);   }
          else if (ant === 'Nein')  { cell.value = 'Nein';       cell.font = font(NEIN_FG, true, 10); cell.fill = fill(NEIN_BG); }
          else if (ant === 'Vielleicht') { cell.value = 'Vllt.'; cell.font = font(VIEL_FG, true, 10); cell.fill = fill(VIEL_BG); }
          else                      { cell.value = '–';          cell.font = font(OFF_FG,  false,10); cell.fill = fill(OFF_BG);  }
          cell.alignment = align('center'); cell.border = border();
        });
      });

      // ── Summenzeile ──────────────────────────────────────
      const sumRowNr = 5 + termine.length;
      ws.mergeCells(sumRowNr, 1, sumRowNr, 4);
      const cSum = ws.getCell(sumRowNr, 1);
      cSum.value = `Spielbereit (≥ ${minSp} Ja):`;
      cSum.font  = font(WHITE, true, 10); cSum.fill = fill(NAVY);
      cSum.alignment = align('right');

      const spielbereit = termine.filter(t => jaSum(t.id) >= minSp).length;
      const cSumVal = ws.getCell(sumRowNr, 5);
      cSumVal.value = spielbereit; cSumVal.font = font(JA_FG, true, 13);
      cSumVal.fill = fill(JA_BG); cSumVal.alignment = align('center');

      for (let c = 6; c <= 5 + nSp; c++) {
        const cell = ws.getCell(sumRowNr, c);
        cell.fill = fill(NAVY2); cell.value = '';
      }
      ws.getRow(sumRowNr).height = 22;
    }

    // Download
    const buffer = await wb.xlsx.writeBuffer();
    const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url    = URL.createObjectURL(blob);
    const a      = document.createElement('a');
    const heute  = new Date().toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }).replace(/\./g,'-');
    a.href = url; a.download = `FCStrass_Verfuegbarkeit_${heute}.xlsx`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);

  } catch (err) {
    alert('Fehler beim Excel-Export: ' + err.message);
    console.error(err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📊 Excel exportieren'; }
  }
}

function ladeExcelJS() {
  return new Promise((resolve, reject) => {
    if (window.ExcelJS) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/exceljs@4.4.0/dist/exceljs.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('ExcelJS konnte nicht geladen werden'));
    document.head.appendChild(s);
  });
}

// ============================================================
// PDF-EXPORT · jsPDF Card-Layout
// ============================================================

async function exportPDF() {
  const btn = document.getElementById('btn-export-pdf');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Wird erstellt...'; }

  try {
    await ladePDFLibs();
    const { jsPDF } = window.jspdf;

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

    // Nur aktive Mannschaft
    const mf = aktiveMannschaft || alleMannschaften[0];
    if (!mf) throw new Error('Keine Mannschaft aktiv');

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

    function getAntwort(tid, sid) {
      const v = verfueg.find(v => v.spieltermin_id === tid && v.spieler_id === sid && (v.alternativtermin_id === null || v.alternativtermin_id === undefined));
      return v ? v.antwort : '';
    }
    function jaSum(tid) {
      return spieler.filter(sp => getAntwort(tid, sp.id) === 'Ja').length;
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 12, MR = 12, CW = PW - ML - MR;

    function drawPageBase() {
      doc.setFillColor(...NAVY);
      doc.rect(0, 0, PW, PH, 'F');
    }

    function drawHeader() {
      doc.setFillColor(...NAVY2);
      doc.roundedRect(ML, 8, CW, 24, 3, 3, 'F');
      doc.setFillColor(...ORANGE);
      doc.rect(ML, 8, 3, 24, 'F');

      doc.setTextColor(...WHITE);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('FC Strass e.V.', ML + 7, 17);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text('Verfuegbarkeit Vorrunde 2026/27', ML + 7, 24);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...ORANGE);
      doc.text(mf.name, PW - MR, 17, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(mf.liga + '  |  MF: ' + (mf.mf_name || '-'), PW - MR, 24, { align: 'right' });
    }

    function drawFooter() {
      const now = new Date().toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.setDrawColor(...NAVY3);
      doc.setLineWidth(0.3);
      doc.line(ML, PH - 9, PW - MR, PH - 9);
      doc.text('FC Strass e.V.  |  ' + mf.name + '  |  Erstellt: ' + now, ML, PH - 5);
      doc.text('Seite ' + doc.internal.getCurrentPageInfo().pageNumber, PW - MR, PH - 5, { align: 'right' });
    }

    drawPageBase();
    drawHeader();

    // Statistik-Kacheln
    const spielbereit = termine.filter(t => jaSum(t.id) >= minSpieler).length;
    const zuWenig     = termine.filter(t => verfueg.some(v => v.spieltermin_id === t.id) && jaSum(t.id) < minSpieler).length;
    const stats = [
      { label: 'SPIELTAGE',       value: String(termine.length), bg: NAVY3,   fg: WHITE   },
      { label: 'SPIELBEREIT',     value: String(spielbereit),    bg: JA_BG,   fg: JA_FG   },
      { label: 'ZU WENIG',        value: String(zuWenig),        bg: NEIN_BG, fg: NEIN_FG },
      { label: 'MIND. ZUSAGEN',   value: String(minSpieler),     bg: NAVY3,   fg: ORANGE  },
    ];
    const statW = CW / 4;
    stats.forEach((s, i) => {
      const sx = ML + i * statW;
      doc.setFillColor(...s.bg);
      doc.roundedRect(sx, 36, statW - 2, 14, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(...s.fg);
      doc.text(s.value, sx + statW / 2 - 1, 45, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(...MUTED);
      doc.text(s.label, sx + statW / 2 - 1, 49, { align: 'center' });
    });

    // Legende
    const leg = [
      { label: 'Ja',         bg: JA_BG,    fg: JA_FG   },
      { label: 'Vielleicht', bg: VIEL_BG,  fg: VIEL_FG },
      { label: 'Nein',       bg: NEIN_BG,  fg: NEIN_FG },
      { label: 'Keine Antwort', bg: OFFEN_BG, fg: OFFEN_FG },
    ];
    let lx = ML;
    leg.forEach(l => {
      doc.setFillColor(...l.bg);
      doc.roundedRect(lx, 53, 26, 5, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...l.fg);
      doc.text(l.label, lx + 13, 56.5, { align: 'center' });
      lx += 28;
    });

    // Cards – kompakt, eine Seite
    // Dynamisch: verfügbare Höhe aufteilen
    const availableH = PH - 62 - 10; // von y=62 bis Footer
    const pillW      = 19;
    const pillsRow   = Math.floor(CW / (pillW + 1));
    const pillRows   = Math.ceil(spieler.length / pillsRow);
    const PILL_H     = 5;
    const cardH      = 8 + pillRows * (PILL_H + 1) + 2;
    const gap        = Math.min(2, Math.floor((availableH - termine.length * cardH) / Math.max(termine.length, 1)));
    let y = 62;

    termine.forEach(t => {
      const ja     = jaSum(t.id);
      const hatAnt = verfueg.some(v => v.spieltermin_id === t.id);
      const d      = new Date(t.datum);
      const wt     = d.toLocaleDateString('de-DE', { weekday: 'short' });
      const dt     = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
      const uhr    = t.uhrzeit ? t.uhrzeit.slice(0, 5) : '';
      const accent = !hatAnt ? MUTED : ja >= minSpieler ? TEAL : ja >= minSpieler - 2 ? [212, 160, 10] : [200, 60, 60];

      // Card Hintergrund
      doc.setFillColor(...NAVY2);
      doc.roundedRect(ML, y, CW, cardH, 1.5, 1.5, 'F');

      // Akzentbalken links (Ampelfarbe)
      doc.setFillColor(...accent);
      doc.rect(ML, y, 2.5, cardH, 'F');

      // Datum
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...WHITE);
      doc.text(wt + ' ' + dt, ML + 5, y + 5.5);

      // Uhrzeit
      if (uhr) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(...MUTED);
        doc.text(uhr, ML + 5, y + 9);
      }

      // H/A Badge
      const haColor = t.heim ? PURPLE : ORANGE;
      const haText  = t.heim ? 'H' : 'A';
      doc.setFillColor(...haColor.map(c => Math.min(255, c + 140)));
      doc.roundedRect(ML + 28, y + 1.5, 6, 5, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(...haColor);
      doc.text(haText, ML + 31, y + 5.2, { align: 'center' });

      // Gegner
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...WHITE);
      doc.text(t.gegner, ML + 37, y + 5.5, { maxWidth: CW - 55 });

      // Ja-Zahl rechts
      const jaFgC = !hatAnt ? OFFEN_FG : ja >= minSpieler ? JA_FG : ja >= minSpieler - 2 ? VIEL_FG : NEIN_FG;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...jaFgC);
      doc.text(hatAnt ? String(ja) : '-', PW - MR, y + 6, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(...MUTED);
      doc.text('/' + minSpieler, PW - MR, y + 9.5, { align: 'right' });

      // Spieler-Pills
      let px = ML + 3;
      let py = y + 9;
      spieler.forEach((sp, si) => {
        if (si > 0 && si % pillsRow === 0) { px = ML + 3; py += PILL_H + 1; }
        const ant    = getAntwort(t.id, sp.id);
        const pillBg = ant === 'Ja' ? JA_BG : ant === 'Nein' ? NEIN_BG : ant === 'Vielleicht' ? VIEL_BG : OFFEN_BG;
        const pillFg = ant === 'Ja' ? JA_FG : ant === 'Nein' ? NEIN_FG : ant === 'Vielleicht' ? VIEL_FG : OFFEN_FG;
        doc.setFillColor(...pillBg);
        doc.roundedRect(px, py, pillW, PILL_H, 0.8, 0.8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.5);
        doc.setTextColor(...pillFg);
        doc.text(_vorname(sp.name), px + pillW / 2, py + 3.5, { align: 'center', maxWidth: pillW - 1 });
        px += pillW + 1;
      });

      y += cardH + gap;
    });

    drawFooter();

    const heute = new Date().toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }).replace(/\./g,'-');
    const name  = mf.name.replace(/\./g,'').trim().replace(/\s+/g,'_');
    doc.save('FCStrass_' + name + '_Verfuegbarkeit_' + heute + '.pdf');

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

// ============================================================
// AUFSTELLUNGS-EXPORT · PDF (Card-Layout)
// ============================================================

async function exportAufstellungPDF() {
  try {
    await ladePDFLibs();
    const { jsPDF } = window.jspdf;

    const NAVY   = [13,27,42],  NAVY2 = [21,34,50], NAVY3 = [30,48,72];
    const ORANGE = [212,98,10], TEAL  = [29,158,117], PURPLE = [83,74,183];
    const WHITE  = [247,249,255], MUTED = [137,150,180];
    const OFFEN_BG = [235,235,235], OFFEN_FG = [136,136,136];
    const SET_BG = [212,240,228], SET_FG = [15,110,86];

    const mf = aktiveMannschaft || alleMannschaften[0];
    if (!mf) throw new Error('Keine Mannschaft aktiv');

    const [termRes, spRes] = await Promise.all([
      sb.from('spieltermine').select('*').eq('mannschaft_id', mf.id).order('datum'),
      sb.from('spieler').select('*').eq('mannschaft_id', mf.id).eq('aktiv', true).order('position')
    ]);
    const termine = termRes.data || [];
    const spieler = spRes.data || [];
    let aufstellungen = [];
    if (termine.length > 0) {
      const { data: ad } = await sb.from('aufstellungen').select('*').in('spieltermin_id', termine.map(t => t.id));
      aufstellungen = ad || [];
    }

    const minSp = mf.min_spieler || 6;
    const spielerById = Object.fromEntries(spieler.map(s => [s.id, s]));

    function aufstellungFuer(tid) {
      return aufstellungen
        .filter(a => a.spieltermin_id === tid)
        .map(a => spielerById[a.spieler_id])
        .filter(Boolean)
        .sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 12, MR = 12, CW = PW - ML - MR;

    doc.setFillColor(...NAVY);
    doc.rect(0, 0, PW, PH, 'F');

    // Header
    doc.setFillColor(...NAVY2);
    doc.roundedRect(ML, 8, CW, 24, 3, 3, 'F');
    doc.setFillColor(...ORANGE);
    doc.rect(ML, 8, 3, 24, 'F');
    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('FC Strass e.V.', ML + 7, 17);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text('Einsatzplan / Aufstellung Vorrunde 2026/27', ML + 7, 24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...ORANGE);
    doc.text(mf.name, PW - MR, 17, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(mf.liga + '  |  MF: ' + (mf.mf_name || '-'), PW - MR, 24, { align: 'right' });

    let y = 40;

    termine.forEach(t => {
      const auf = aufstellungFuer(t.id);
      const gesetzt = auf.length > 0;
      const d   = new Date(t.datum);
      const wt  = d.toLocaleDateString('de-DE', { weekday: 'short' });
      const dt  = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
      const uhr = t.uhrzeit ? t.uhrzeit.slice(0, 5) : '';

      const rows = Math.max(1, Math.ceil(auf.length / 2));
      const cardH = 13 + (gesetzt ? rows * 7 + 2 : 8);

      if (y + cardH > PH - 14) {
        doc.setFontSize(7); doc.setTextColor(...MUTED);
        doc.text('FC Strass e.V.  |  ' + mf.name, ML, PH - 6);
        doc.addPage();
        doc.setFillColor(...NAVY); doc.rect(0, 0, PW, PH, 'F');
        y = 12;
      }

      const accent = gesetzt ? TEAL : MUTED;
      doc.setFillColor(...NAVY2);
      doc.roundedRect(ML, y, CW, cardH, 2, 2, 'F');
      doc.setFillColor(...accent);
      doc.rect(ML, y, 3, cardH, 'F');

      // Datum + Uhrzeit
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...WHITE);
      doc.text(wt + ' ' + dt, ML + 6, y + 6);
      if (uhr) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...MUTED);
        doc.text(uhr, ML + 6, y + 10);
      }

      // H/A
      const haColor = t.heim ? PURPLE : ORANGE;
      doc.setFillColor(...haColor.map(c => Math.min(255, c + 150)));
      doc.roundedRect(ML + 28, y + 2, 6, 5, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(...haColor);
      doc.text(t.heim ? 'H' : 'A', ML + 31, y + 5.7, { align: 'center' });

      // Gegner
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...WHITE);
      doc.text(t.gegner, ML + 37, y + 6, { maxWidth: CW - 60 });

      // Status rechts
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      if (gesetzt) {
        doc.setTextColor(...SET_FG);
        doc.text(auf.length + '/' + minSp + ' gesetzt', PW - MR, y + 6, { align: 'right' });
      } else {
        doc.setTextColor(...OFFEN_FG);
        doc.text('offen', PW - MR, y + 6, { align: 'right' });
      }

      // Spieler-Reihen (2 Spalten, Positionsnummer + Name)
      if (gesetzt) {
        const colW = (CW - 8) / 2;
        auf.forEach((sp, i) => {
          const col = i % 2;
          const rowIdx = Math.floor(i / 2);
          const px = ML + 4 + col * colW;
          const py = y + 12 + rowIdx * 7;

          doc.setFillColor(...SET_BG);
          doc.roundedRect(px, py, colW - 2, 6, 1, 1, 'F');
          // Positionsnummer
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(...ORANGE);
          doc.text((sp.position ?? '-') + '.', px + 3, py + 4);
          // Name
          doc.setTextColor(...SET_FG);
          doc.setFontSize(7.5);
          const nm = _vornameVoll(sp.name);
          doc.text(nm, px + 9, py + 4, { maxWidth: colW - 26 });
          // TTR
          if (sp.ttr != null) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(...MUTED);
            doc.text(String(sp.ttr), px + colW - 4, py + 4, { align: 'right' });
          }
        });
      } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(...MUTED);
        doc.text('Noch keine Aufstellung festgelegt', ML + 6, y + 15);
      }

      y += cardH + 3;
    });

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    const now = new Date().toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    doc.text('FC Strass e.V.  |  ' + mf.name + '  |  Einsatzplan  |  ' + now, ML, PH - 6);

    const heute = new Date().toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }).replace(/\./g,'-');
    const name  = mf.name.replace(/\./g,'').trim().replace(/\s+/g,'_');
    doc.save('FCStrass_' + name + '_Einsatzplan_' + heute + '.pdf');

  } catch (err) {
    alert('Fehler beim Aufstellungs-PDF: ' + err.message);
    console.error(err);
  }
}

// ============================================================
// AUFSTELLUNGS-EXPORT · Excel
// ============================================================

async function exportAufstellungExcel() {
  try {
    await ladeExcelJS();
    const ExcelJS = window.ExcelJS;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'SpielplanApp FC Strass';

    const NAVY = '0D1B2A', NAVY2 = '152232', ORANGE = 'D4620A', WHITE = 'F7F9FF', MUTED = '8996B4';
    const TEAL = '1D9E75', PURPLE = '534AB7';
    const SET_BG = 'D4F0E4', SET_FG = '0F6E56', OFF_BG = 'E8E8E8', OFF_FG = '888888';

    function fill(hex){ return { type:'pattern', pattern:'solid', fgColor:{argb:'FF'+hex} }; }
    function font(hex,bold,sz){ return { color:{argb:'FF'+hex}, bold:!!bold, size:sz||10, name:'Calibri' }; }
    function align(h,v){ return { horizontal:h||'left', vertical:v||'middle' }; }
    function border(){ return { bottom:{style:'thin',color:{argb:'FFDDDDDD'}} }; }

    const mf = aktiveMannschaft || alleMannschaften[0];
    if (!mf) throw new Error('Keine Mannschaft aktiv');

    const [termRes, spRes] = await Promise.all([
      sb.from('spieltermine').select('*').eq('mannschaft_id', mf.id).order('datum'),
      sb.from('spieler').select('*').eq('mannschaft_id', mf.id).eq('aktiv', true).order('position')
    ]);
    const termine = termRes.data || [];
    const spieler = spRes.data || [];
    let aufstellungen = [];
    if (termine.length > 0) {
      const { data: ad } = await sb.from('aufstellungen').select('*').in('spieltermin_id', termine.map(t => t.id));
      aufstellungen = ad || [];
    }

    const minSp = mf.min_spieler || 6;
    const spielerById = Object.fromEntries(spieler.map(s => [s.id, s]));
    function aufstellungFuer(tid) {
      return aufstellungen.filter(a => a.spieltermin_id === tid)
        .map(a => spielerById[a.spieler_id]).filter(Boolean)
        .sort((a,b) => (a.position ?? 99) - (b.position ?? 99));
    }

    const ws = wb.addWorksheet('Einsatzplan', { views:[{state:'frozen', ySplit:4}] });
    // Spalten: Datum | H/A | Gegner | Status | Pos1..PosN
    ws.columns = [
      { width: 14 }, { width: 10 }, { width: 30 }, { width: 13 },
      ...Array.from({length: minSp}, () => ({ width: 20 }))
    ];

    // Titel
    ws.mergeCells(1,1,1,4+minSp);
    const t1 = ws.getCell('A1');
    t1.value = `FC Strass e.V.  ·  Einsatzplan Vorrunde 2026/27  ·  ${mf.name}  ·  ${mf.liga}`;
    t1.font = font(WHITE,true,13); t1.fill = fill(NAVY); t1.alignment = align('left');
    ws.getRow(1).height = 30;

    // MF-Zeile
    ws.mergeCells(2,1,2,4+minSp);
    const t2 = ws.getCell('A2');
    t2.value = `Mannschaftsführer: ${mf.mf_name || '–'}  ·  Aufstellung in Meldereihenfolge (Position)`;
    t2.font = font(ORANGE,true,9); t2.fill = fill(NAVY2); t2.alignment = align('left');
    ws.getRow(2).height = 16;

    // Trenner
    for (let c=1;c<=4+minSp;c++){ const cell=ws.getCell(3,c); cell.fill=fill(NAVY2); }
    ws.getRow(3).height = 4;

    // Header
    const headers = ['Datum','H/A','Gegner','Status'];
    for (let i=0;i<minSp;i++) headers.push('Pos ' + (i+1));
    headers.forEach((h,i)=>{
      const cell = ws.getCell(4,i+1);
      cell.value = h; cell.font = font(WHITE,true,10); cell.fill = fill(NAVY);
      cell.alignment = align('center'); cell.border = border();
    });
    ws.getRow(4).height = 24;

    // Datenzeilen
    termine.forEach((t,ri)=>{
      const row = ws.getRow(5+ri);
      row.height = 20;
      const auf = aufstellungFuer(t.id);
      const gesetzt = auf.length > 0;
      const d = new Date(t.datum);
      const dt = d.toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'2-digit',year:'2-digit'});
      const rowBg = ri%2===0 ? 'F0F4F8':'FFFFFF';

      const cDat = row.getCell(1);
      cDat.value = dt; cDat.font = font(NAVY,true,10); cDat.fill = fill(rowBg); cDat.alignment = align('left'); cDat.border = border();

      const cHA = row.getCell(2);
      cHA.value = t.heim?'Heim':'Auswärts'; cHA.font = font(t.heim?PURPLE:ORANGE,true,9);
      cHA.fill = fill(t.heim?'EEEDFE':'FAECE7'); cHA.alignment = align('center'); cHA.border = border();

      const cGeg = row.getCell(3);
      cGeg.value = t.gegner; cGeg.font = font(NAVY,true,10); cGeg.fill = fill(rowBg); cGeg.alignment = align('left'); cGeg.border = border();

      const cSt = row.getCell(4);
      cSt.value = gesetzt ? (auf.length+'/'+minSp) : 'offen';
      cSt.font = font(gesetzt?SET_FG:OFF_FG,true,9); cSt.fill = fill(gesetzt?SET_BG:OFF_BG);
      cSt.alignment = align('center'); cSt.border = border();

      for (let i=0;i<minSp;i++){
        const sp = auf[i];
        const cell = row.getCell(5+i);
        if (sp) {
          cell.value = (sp.position!=null?sp.position+'. ':'') + _vornameVoll(sp.name) + (sp.ttr!=null?' ('+sp.ttr+')':'');
          cell.font = font(SET_FG,false,9); cell.fill = fill(SET_BG);
        } else {
          cell.value = '–'; cell.font = font(OFF_FG,false,9); cell.fill = fill(rowBg);
        }
        cell.alignment = align('left'); cell.border = border();
      }
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const heute = new Date().toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}).replace(/\./g,'-');
    const name = mf.name.replace(/\./g,'').trim().replace(/\s+/g,'_');
    a.href = url; a.download = 'FCStrass_' + name + '_Einsatzplan_' + heute + '.xlsx';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);

  } catch (err) {
    alert('Fehler beim Aufstellungs-Excel: ' + err.message);
    console.error(err);
  }
}

// ============================================================
// EXPORT-MENÜ · Auswahl was + Format
// ============================================================

function zeigeExportMenu() {
  // vorhandenes Menü entfernen (Toggle)
  const bestehend = document.getElementById('export-menu-overlay');
  if (bestehend) { bestehend.remove(); return; }

  const mfName = (aktiveMannschaft && aktiveMannschaft.name) || 'Mannschaft';

  const overlay = document.createElement('div');
  overlay.id = 'export-menu-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px';

  function opt(label, sub, farbe, fn) {
    return '<button data-fn="' + fn + '" style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;padding:14px 16px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:#1e3550;cursor:pointer;text-align:left;transition:all 140ms" ' +
      'onmouseover="this.style.background=\'#2a445f\';this.style.borderColor=\'' + farbe + '\'" onmouseout="this.style.background=\'#1e3550\';this.style.borderColor=\'rgba(255,255,255,0.12)\'">' +
      '<span style="font-size:14px;font-weight:700;color:#F7F9FF">' + label + '</span>' +
      '<span style="font-size:11px;color:#8996B4">' + sub + '</span>' +
    '</button>';
  }

  overlay.innerHTML =
    '<div style="background:#152232;border:1px solid rgba(255,255,255,0.14);border-radius:16px;max-width:420px;width:100%;overflow:hidden">' +
      '<div style="padding:18px 20px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center">' +
        '<div>' +
          '<div style="font-family:Bahnschrift SemiBold,sans-serif;font-size:15px;color:#F07830">Export</div>' +
          '<div style="font-size:12px;color:#8996B4;margin-top:2px">' + mfName + ' · aktueller Tab</div>' +
        '</div>' +
        '<button onclick="document.getElementById(\'export-menu-overlay\').remove()" style="background:none;border:none;color:#8996B4;font-size:20px;cursor:pointer">✕</button>' +
      '</div>' +
      '<div style="padding:16px 20px">' +
        '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;color:#8996B4;margin-bottom:8px">Abstimmung (Verfügbarkeit)</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">' +
          opt('PDF', 'Karten-Layout', '#D4620A', 'exportPDF') +
          opt('Excel', 'Tabelle farbig', '#1D9E75', 'exportExcel') +
        '</div>' +
        '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;color:#8996B4;margin-bottom:8px">Einsatzplan (Aufstellung)</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
          opt('PDF', 'Karten-Layout', '#D4620A', 'exportAufstellungPDF') +
          opt('Excel', 'Tabelle farbig', '#1D9E75', 'exportAufstellungExcel') +
        '</div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  overlay.querySelectorAll('button[data-fn]').forEach(b => {
    b.addEventListener('click', () => {
      const fn = b.getAttribute('data-fn');
      overlay.remove();
      if (typeof window[fn] === 'function') window[fn]();
    });
  });

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}
