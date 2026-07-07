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

    // Farben als RGB-Arrays
    const NAVY    = [13,  27,  42];
    const NAVY2   = [21,  34,  50];
    const ORANGE  = [212, 98,  10];
    const TEAL    = [29,  158, 117];
    const PURPLE  = [83,  74,  183];
    const WHITE   = [247, 249, 255];
    const MUTED   = [137, 150, 180];
    const JA_BG   = [212, 240, 228]; const JA_FG   = [15,  110, 86];
    const NEIN_BG = [250, 215, 215]; const NEIN_FG = [163, 45,  45];
    const VIEL_BG = [255, 240, 192]; const VIEL_FG = [133, 79,  11];
    const OFFEN_BG= [235, 235, 235]; const OFFEN_FG= [136, 136, 136];

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

      const minSpieler = mf.min_spieler || 6;

      function vorname(dbName) {
        const p = dbName.split(',');
        return p.length === 2 ? p[1].trim().split(' ')[0] + ' ' + p[0].trim() : dbName;
      }

      function getAntwort(terminId, spielerId) {
        const v = verfueg.find(v => v.spieltermin_id === terminId && v.spieler_id === spielerId);
        return v ? v.antwort : '';
      }

      function jaSum(terminId) {
        return spieler.filter(sp => getAntwort(terminId, sp.id) === 'Ja').length;
      }

      // Querformat für viele Spieler
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const PW = doc.internal.pageSize.getWidth();   // 297
      const PH = doc.internal.pageSize.getHeight();  // 210

      // ── Header-Block ────────────────────────────────────
      // Navy-Balken oben
      doc.setFillColor(...NAVY);
      doc.rect(0, 0, PW, 22, 'F');

      // Titel
      doc.setTextColor(...WHITE);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('FC Strass e.V.', 10, 9);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(...MUTED);
      doc.text(`Verfügbarkeit Vorrunde 2026/27  ·  ${mf.name}  ·  ${mf.liga}`, 10, 15);

      // MF rechts
      doc.setFontSize(9);
      doc.setTextColor(...ORANGE);
      doc.text(`Mannschaftsführer: ${mf.mf_name || '–'}`, PW - 10, 9,  { align: 'right' });

      // Legende rechts
      doc.setTextColor(...MUTED);
      doc.text(`Mindest-Zusagen: ${minSpieler}  ·  ✓ Ja  ·  ? Vielleicht  ·  ✗ Nein  ·  – Offen`, PW - 10, 15, { align: 'right' });

      // Trennlinie
      doc.setDrawColor(...ORANGE);
      doc.setLineWidth(0.6);
      doc.line(0, 22, PW, 22);

      // ── Tabelle ─────────────────────────────────────────
      const spielerNamen = spieler.map(sp => vorname(sp.name));

      const head = [['Datum', 'H/A', 'Gegner', 'Status', 'Σ Ja', ...spielerNamen]];

      const body = termine.map((t, ri) => {
        const d   = new Date(t.datum);
        const dt  = d.toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', year:'2-digit' });
        const ja  = jaSum(t.id);
        const hatAntworten = verfueg.some(v => v.spieltermin_id === t.id);
        const antworten = spieler.map(sp => {
          const a = getAntwort(t.id, sp.id);
          return a === 'Ja' ? '✓' : a === 'Nein' ? '✗' : a === 'Vielleicht' ? '?' : '–';
        });
        return [
          dt,
          t.heim ? 'Heim' : 'Auswärts',
          t.gegner,
          t.status || 'Geplant',
          hatAntworten ? String(ja) : '–',
          ...antworten
        ];
      });

      // Summenzeile
      const spielbereit = termine.filter(t => jaSum(t.id) >= minSpieler).length;
      body.push([
        { content: `Spielbereit (≥${minSpieler} Ja):`, colSpan: 4, styles: { halign: 'right', fontStyle: 'bold', fillColor: NAVY, textColor: WHITE } },
        { content: String(spielbereit), styles: { halign: 'center', fontStyle: 'bold', fillColor: JA_BG, textColor: JA_FG } },
        ...spieler.map(() => ({ content: '', styles: { fillColor: NAVY2 } }))
      ]);

      // Spaltenbreiten dynamisch
      const fixedW = 26 + 16 + 42 + 18 + 12; // Datum+H/A+Gegner+Status+ΣJa
      const spW = Math.max(10, Math.floor((PW - 20 - fixedW) / spieler.length));

      doc.autoTable({
        head,
        body,
        startY: 25,
        margin: { left: 10, right: 10 },
        tableWidth: PW - 20,
        styles: {
          font: 'helvetica',
          fontSize: 8,
          cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
          valign: 'middle',
          overflow: 'linebreak'
        },
        headStyles: {
          fillColor: NAVY,
          textColor: WHITE,
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 8,
          cellPadding: { top: 3, bottom: 3, left: 2, right: 2 }
        },
        columnStyles: {
          0: { cellWidth: 26, halign: 'left',   fontStyle: 'bold', textColor: NAVY },
          1: { cellWidth: 16, halign: 'center' },
          2: { cellWidth: 42, halign: 'left',   fontStyle: 'bold', textColor: NAVY },
          3: { cellWidth: 18, halign: 'center', fontSize: 7 },
          4: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
          ...Object.fromEntries(spieler.map((_, i) => [5 + i, { cellWidth: spW, halign: 'center', fontStyle: 'bold', fontSize: 9 }]))
        },
        alternateRowStyles: { fillColor: [245, 247, 252] },
        didParseCell(data) {
          const { row, column, cell } = data;
          if (data.section === 'head') return;
          if (row.index >= termine.length) return; // Summenzeile separat

          const ri = row.index;
          const t  = termine[ri];
          if (!t) return;

          // H/A Spalte färben
          if (column.index === 1) {
            cell.styles.fillColor = t.heim ? [238, 237, 254] : [250, 236, 231];
            cell.styles.textColor = t.heim ? PURPLE : ORANGE;
          }

          // Status-Farbe
          if (column.index === 3) {
            if (t.status === 'Verschoben') cell.styles.textColor = ORANGE;
            else if (t.status === 'Bestätigt') cell.styles.textColor = TEAL;
            else cell.styles.textColor = MUTED;
          }

          // Σ Ja färben
          if (column.index === 4) {
            const hatAntworten = verfueg.some(v => v.spieltermin_id === t.id);
            const ja = jaSum(t.id);
            if (!hatAntworten) { cell.styles.fillColor = OFFEN_BG; cell.styles.textColor = OFFEN_FG; }
            else if (ja >= minSpieler) { cell.styles.fillColor = JA_BG; cell.styles.textColor = JA_FG; }
            else if (ja >= minSpieler - 2) { cell.styles.fillColor = VIEL_BG; cell.styles.textColor = VIEL_FG; }
            else { cell.styles.fillColor = NEIN_BG; cell.styles.textColor = NEIN_FG; }
          }

          // Spieler-Antworten färben
          if (column.index >= 5) {
            const sp  = spieler[column.index - 5];
            if (!sp) return;
            const ant = getAntwort(t.id, sp.id);
            if (ant === 'Ja')         { cell.styles.fillColor = JA_BG;   cell.styles.textColor = JA_FG; }
            else if (ant === 'Nein')  { cell.styles.fillColor = NEIN_BG; cell.styles.textColor = NEIN_FG; }
            else if (ant === 'Vielleicht') { cell.styles.fillColor = VIEL_BG; cell.styles.textColor = VIEL_FG; }
            else                      { cell.styles.fillColor = OFFEN_BG; cell.styles.textColor = OFFEN_FG; }
          }
        },
        didDrawPage(data) {
          // Footer jede Seite
          doc.setFontSize(7);
          doc.setTextColor(...MUTED);
          const now = new Date().toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
          doc.text(`FC Strass e.V.  ·  ${mf.name}  ·  Erstellt: ${now}`, 10, PH - 5);
          doc.text(`Seite ${doc.internal.getCurrentPageInfo().pageNumber}`, PW - 10, PH - 5, { align: 'right' });
          // Trennlinie Footer
          doc.setDrawColor(...NAVY2);
          doc.setLineWidth(0.3);
          doc.line(10, PH - 8, PW - 10, PH - 8);
        }
      });

      // Pro Mannschaft eigene PDF-Datei
      const heute = new Date().toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }).replace(/\./g,'-');
      const name  = mf.name.replace(/\./g,'').trim().replace(/\s+/g,'_');
      doc.save(`FCStrass_${name}_Verfuegbarkeit_${heute}.pdf`);
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

    const jspdfScript = document.createElement('script');
    jspdfScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    jspdfScript.onload = () => {
      const atScript = document.createElement('script');
      atScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
      atScript.onload = resolve;
      atScript.onerror = () => reject(new Error('autoTable konnte nicht geladen werden'));
      document.head.appendChild(atScript);
    };
    jspdfScript.onerror = () => reject(new Error('jsPDF konnte nicht geladen werden'));
    document.head.appendChild(jspdfScript);
  });
}
