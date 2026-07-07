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

      const minSp = mf.min_spieler || 6;

      function getAntwort(tid, sid) {
        const v = verfueg.find(v => v.spieltermin_id === tid && v.spieler_id === sid);
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
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
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
      const v = verfueg.find(v => v.spieltermin_id === tid && v.spieler_id === sid);
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

    // Cards
    const PILL_H  = 6.5;
    const pillW   = 30;
    const pillsRow = Math.floor(CW / (pillW + 1));
    let y = 62;

    termine.forEach(t => {
      const ja         = jaSum(t.id);
      const hatAnt     = verfueg.some(v => v.spieltermin_id === t.id);
      const d          = new Date(t.datum);
      const wt         = d.toLocaleDateString('de-DE', { weekday: 'short' });
      const dt         = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
      const uhr        = t.uhrzeit ? t.uhrzeit.slice(0, 5) : '';
      const pillRows   = Math.ceil(spieler.length / pillsRow);
      const cardH      = 13 + pillRows * (PILL_H + 2) + 3;
      const accent     = !hatAnt ? MUTED : ja >= minSpieler ? TEAL : ja >= minSpieler - 2 ? [212, 160, 10] : [200, 60, 60];

      if (y + cardH > PH - 14) {
        drawFooter();
        doc.addPage();
        drawPageBase();
        y = 10;
      }

      // Card
      doc.setFillColor(...NAVY2);
      doc.roundedRect(ML, y, CW, cardH, 2, 2, 'F');
      doc.setFillColor(...accent);
      doc.rect(ML, y, 3, cardH, 'F');

      // Datum
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...WHITE);
      doc.text(wt + ' ' + dt, ML + 6, y + 6);
      if (uhr) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...MUTED);
        doc.text(uhr + ' Uhr', ML + 6, y + 10.5);
      }

      // H/A
      const haColor = t.heim ? PURPLE : ORANGE;
      const haText  = t.heim ? 'HEIM' : 'AUSW';
      doc.setFillColor(...haColor.map(c => Math.min(255, c + 150)));
      doc.roundedRect(ML + 33, y + 2.5, 14, 5.5, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(...haColor);
      doc.text(haText, ML + 40, y + 6.3, { align: 'center' });

      // Gegner
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...WHITE);
      doc.text(t.gegner, ML + 51, y + 6, { maxWidth: CW - 65 });

      // Ja-Zahl rechts
      const jaFgC = !hatAnt ? OFFEN_FG : ja >= minSpieler ? JA_FG : ja >= minSpieler - 2 ? VIEL_FG : NEIN_FG;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(...jaFgC);
      doc.text(hatAnt ? String(ja) : '-', PW - MR, y + 7, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(...MUTED);
      doc.text('von ' + minSpieler, PW - MR, y + 11, { align: 'right' });

      // Spieler-Pills
      let px = ML + 3;
      let py = y + 13;
      spieler.forEach((sp, si) => {
        if (si > 0 && si % pillsRow === 0) { px = ML + 3; py += PILL_H + 2; }
        const ant = getAntwort(t.id, sp.id);
        const pillBg = ant === 'Ja' ? JA_BG : ant === 'Nein' ? NEIN_BG : ant === 'Vielleicht' ? VIEL_BG : OFFEN_BG;
        const pillFg = ant === 'Ja' ? JA_FG : ant === 'Nein' ? NEIN_FG : ant === 'Vielleicht' ? VIEL_FG : OFFEN_FG;
        doc.setFillColor(...pillBg);
        doc.roundedRect(px, py, pillW, PILL_H, 1, 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...pillFg);
        doc.text(_vorname(sp.name), px + pillW / 2, py + 4.3, { align: 'center', maxWidth: pillW - 2 });
        px += pillW + 1;
      });

      y += cardH + 3;
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
