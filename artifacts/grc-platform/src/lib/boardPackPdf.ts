// @ts-nocheck
import jsPDF from "jspdf";

// ── Palette ─────────────────────────────────────────────────────────────────
const C = {
  navy:    [15,  23,  42],
  navyMid: [30,  41,  59],
  navyLt:  [51,  65,  85],
  white:   [255, 255, 255],
  muted:   [148, 163, 184],
  blue:    [96,  165, 250],
  green:   [52,  211, 153],
  amber:   [251, 191,  36],
  red:     [248, 113, 113],
  purple:  [167, 139, 250],
  orange:  [251, 146,  60],
};

const TYPE_COLOR: Record<string, number[]> = {
  Macroeconomic:      C.blue,
  "Financial System": C.purple,
  "Policy/Regulatory":C.amber,
  Geopolitical:       C.red,
  "Climate/ESG":      C.green,
};

const STATUS_COLOR: Record<string, number[]> = {
  withinAppetite:    C.green,
  withinTolerance:   C.amber,
  outsideTolerance:  C.red,
};
const STATUS_LABEL: Record<string, string> = {
  withinAppetite:   "Within Appetite",
  withinTolerance:  "Within Tolerance",
  outsideTolerance: "Outside Tolerance",
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function rgb(doc: jsPDF, col: number[]) {
  doc.setDrawColor(col[0], col[1], col[2]);
  doc.setFillColor(col[0], col[1], col[2]);
}
function setFill(doc: jsPDF, col: number[]) {
  doc.setFillColor(col[0], col[1], col[2]);
}
function setDraw(doc: jsPDF, col: number[]) {
  doc.setDrawColor(col[0], col[1], col[2]);
}
function setTxt(doc: jsPDF, col: number[]) {
  doc.setTextColor(col[0], col[1], col[2]);
}

// ── Page 1: Cover ─────────────────────────────────────────────────────────
function drawCover(doc: jsPDF, date: string) {
  const W = 210; const H = 297;

  // Full dark background
  setFill(doc, C.navy);
  doc.rect(0, 0, W, H, "F");

  // Accent bar top
  setFill(doc, C.blue);
  doc.rect(0, 0, W, 3, "F");

  // Decorative grid pattern (subtle)
  doc.setLineWidth(0.1);
  setDraw(doc, C.navyMid);
  for (let x = 0; x <= W; x += 20) doc.line(x, 0, x, H);
  for (let y = 0; y <= H; y += 20) doc.line(0, y, W, y);

  // AIGO-X wordmark area
  setFill(doc, C.navyMid);
  doc.roundedRect(20, 32, 60, 18, 3, 3, "F");
  setTxt(doc, C.blue);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("AIGO-X GRC", 50, 44, { align: "center" });

  // Divider
  setFill(doc, C.blue);
  doc.rect(20, 56, 170, 0.5, "F");

  // Main title
  setTxt(doc, C.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text("Strategic Risk", 105, 90, { align: "center" });
  doc.text("Board Pack", 105, 108, { align: "center" });

  // Subtitle
  setTxt(doc, C.blue);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text("Risk Committee Briefing Document", 105, 122, { align: "center" });

  // Date badge
  setFill(doc, C.navyMid);
  doc.roundedRect(75, 134, 60, 14, 3, 3, "F");
  setTxt(doc, C.muted);
  doc.setFontSize(10);
  doc.text(`Prepared: ${date}`, 105, 143, { align: "center" });

  // Contents list
  setFill(doc, C.navyMid);
  doc.roundedRect(20, 168, 170, 70, 4, 4, "F");
  setDraw(doc, C.navyLt);
  doc.setLineWidth(0.3);
  doc.roundedRect(20, 168, 170, 70, 4, 4, "S");

  setTxt(doc, C.muted);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("CONTENTS", 30, 180);

  const items = [
    ["01", "Heat Map", "Risk exposure plotted on 5×5 grid with appetite zone overlays"],
    ["02", "Risk Register", "Full strategic risk register with scoring and status"],
    ["03", "Appetite Status", "Per-category tolerance breakdown and trend projection"],
  ];
  doc.setFont("helvetica", "normal");
  items.forEach(([num, title, desc], i) => {
    const y = 193 + i * 14;
    setTxt(doc, C.blue);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(num, 32, y);
    setTxt(doc, C.white);
    doc.text(title, 44, y);
    setTxt(doc, C.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(desc, 44, y + 5);
  });

  // Confidentiality notice
  setTxt(doc, C.navyLt);
  doc.setFontSize(7);
  doc.text("CONFIDENTIAL — FOR BOARD RISK COMMITTEE USE ONLY", 105, 278, { align: "center" });

  // Accent bar bottom
  setFill(doc, C.blue);
  doc.rect(0, H - 3, W, 3, "F");
}

// ── Page 2: Heat Map ──────────────────────────────────────────────────────
function drawHeatMapPage(doc: jsPDF, risks: any[], appetiteCfg: any[]) {
  const W = 210; const H = 297;

  setFill(doc, C.navy);
  doc.rect(0, 0, W, H, "F");
  setFill(doc, C.blue);
  doc.rect(0, 0, W, 3, "F");
  doc.rect(0, H - 3, W, 3, "F");

  // Page header
  setTxt(doc, C.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Heat Map", 20, 22);
  setTxt(doc, C.blue);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("01", 190, 22, { align: "right" });
  setFill(doc, C.navyLt);
  doc.rect(20, 26, 170, 0.3, "F");

  // Compute thresholds
  const avgAt = appetiteCfg.length > 0
    ? appetiteCfg.reduce((s, c) => s + Number(c.appetite_threshold ?? 6), 0) / appetiteCfg.length
    : 6;
  const avgTt = appetiteCfg.length > 0
    ? appetiteCfg.reduce((s, c) => s + Number(c.tolerance_threshold ?? 9), 0) / appetiteCfg.length
    : 9;

  function getCellColor(l: number, i: number): number[] {
    const score = l * i;
    if (score <= avgAt)  return [34,  197, 94];
    if (score <= avgTt)  return [251, 191, 36];
    return [220, 38, 38];
  }

  // Grid layout
  const CELL = 23;
  const LPAD = 28;
  const THEAD = 14;
  const GX = 28;  // grid origin X
  const GY = 40;  // grid origin Y

  // Impact header
  setTxt(doc, C.muted);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  const impactLabels = ["Neg", "Low", "Med", "High", "Ext"];
  impactLabels.forEach((lbl, i) => {
    doc.text(lbl, GX + LPAD + i * CELL + CELL / 2, GY + 8, { align: "center" });
  });
  doc.text("Impact →", GX + LPAD + 2.5 * CELL, GY + 2, { align: "center" });

  // Likelihood header
  const likeLabels = ["Prob", "Likely", "Poss", "Unlik", "Rem"];
  likeLabels.forEach((lbl, rowIdx) => {
    doc.text(lbl, GX + LPAD - 3, GY + THEAD + rowIdx * CELL + CELL / 2 + 2, { align: "right" });
  });

  // Vertical axis label
  doc.setFontSize(6);
  setTxt(doc, C.muted);
  const lkX = GX + 6;
  const lkY = GY + THEAD + 2.5 * CELL;
  doc.text("Likelihood →", lkX, lkY, { angle: 90, align: "center" });

  // Draw grid cells
  doc.setLineWidth(0.2);
  for (let rowIdx = 0; rowIdx < 5; rowIdx++) {
    const l = 5 - rowIdx;
    for (let i = 1; i <= 5; i++) {
      const cx = GX + LPAD + (i - 1) * CELL;
      const cy = GY + THEAD + rowIdx * CELL;
      const col = getCellColor(l, i);
      // Fill with low opacity
      doc.setFillColor(col[0], col[1], col[2]);
      doc.setGState(new (doc as any).GState({ opacity: 0.18 }));
      doc.rect(cx, cy, CELL, CELL, "F");
      doc.setGState(new (doc as any).GState({ opacity: 1 }));

      // Border
      setDraw(doc, col);
      doc.setLineWidth(0.15);
      doc.rect(cx, cy, CELL, CELL, "S");

      // Score
      setTxt(doc, col);
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.text(String(l * i), cx + CELL - 1, cy + 5, { align: "right" });

      // Risk dots
      const cellRisks = risks.filter(r => r.likelihood === l && r.impact === i);
      cellRisks.slice(0, 6).forEach((r, dotIdx) => {
        const dotCol = TYPE_COLOR[r.risk_type] ?? C.blue;
        setFill(doc, dotCol);
        setDraw(doc, dotCol);
        const dx = cx + 3 + (dotIdx % 3) * 6;
        const dy = cy + CELL - 8 + Math.floor(dotIdx / 3) * 6;
        doc.circle(dx, dy, 2, "F");
      });
      if (cellRisks.length > 6) {
        setTxt(doc, col);
        doc.setFontSize(5);
        doc.text(`+${cellRisks.length - 6}`, cx + CELL / 2, cy + CELL - 1, { align: "center" });
      }
    }
  }

  // Zone legend
  const legY = GY + THEAD + 5 * CELL + 10;
  const zones = [
    { label: "Within Appetite",   col: [34, 197, 94]  },
    { label: "Within Tolerance",  col: [251, 191, 36] },
    { label: "Outside Tolerance", col: [220, 38, 38]  },
  ];
  zones.forEach((z, i) => {
    const lx = GX + LPAD + i * 56;
    setFill(doc, z.col);
    doc.rect(lx, legY - 3, 6, 4, "F");
    setTxt(doc, C.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(z.label, lx + 8, legY);
  });

  // Risk type legend
  const rtY = legY + 10;
  const riskTypes = Object.entries(TYPE_COLOR);
  riskTypes.forEach(([type, col], i) => {
    const lx = GX + LPAD + (i % 3) * 55;
    const ly = rtY + Math.floor(i / 3) * 9;
    setFill(doc, col);
    setDraw(doc, col);
    doc.circle(lx + 2, ly - 1.5, 2, "F");
    setTxt(doc, C.muted);
    doc.setFontSize(7);
    doc.text(type, lx + 6, ly);
  });

  // Risk KPI strip at bottom of map
  const kpiY = rtY + 20;
  const totalRisks = risks.length;
  const outside = risks.filter(r => r.appetite_status === "outsideTolerance").length;
  const tolerance = risks.filter(r => r.appetite_status === "withinTolerance").length;
  const appetite = risks.filter(r => r.appetite_status === "withinAppetite").length;

  const kpis = [
    { label: "Total Risks",       value: String(totalRisks), col: C.blue  },
    { label: "Within Appetite",   value: String(appetite),   col: C.green },
    { label: "Within Tolerance",  value: String(tolerance),  col: C.amber },
    { label: "Outside Tolerance", value: String(outside),    col: C.red   },
  ];
  kpis.forEach((k, i) => {
    const kx = GX + LPAD + i * 42;
    setFill(doc, C.navyMid);
    doc.roundedRect(kx, kpiY, 38, 20, 2, 2, "F");
    setTxt(doc, k.col);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(k.value, kx + 19, kpiY + 11, { align: "center" });
    setTxt(doc, C.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.text(k.label, kx + 19, kpiY + 17, { align: "center" });
  });

  // Page number
  setTxt(doc, C.navyLt);
  doc.setFontSize(7);
  doc.text("Strategic Risk Board Pack  |  Page 2", 105, H - 8, { align: "center" });
}

// ── Page 3: Risk Register ────────────────────────────────────────────────
function drawRiskRegisterPage(doc: jsPDF, risks: any[]) {
  const W = 210; const H = 297;

  setFill(doc, C.navy);
  doc.rect(0, 0, W, H, "F");
  setFill(doc, C.blue);
  doc.rect(0, 0, W, 3, "F");
  doc.rect(0, H - 3, W, 3, "F");

  setTxt(doc, C.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Risk Register", 20, 22);
  setTxt(doc, C.blue);
  doc.setFontSize(8);
  doc.text("02", 190, 22, { align: "right" });
  setFill(doc, C.navyLt);
  doc.rect(20, 26, 170, 0.3, "F");

  // Column defs: x, width, label
  const cols = [
    { x: 20,  w: 22,  label: "Risk ID",    align: "left"  },
    { x: 44,  w: 60,  label: "Title",      align: "left"  },
    { x: 106, w: 30,  label: "Category",   align: "left"  },
    { x: 138, w: 15,  label: "Inherent",   align: "center"},
    { x: 155, w: 15,  label: "Residual",   align: "center"},
    { x: 172, w: 18,  label: "Status",     align: "center"},
  ];

  const ROW_H = 8;
  const TABLE_TOP = 34;

  // Header row
  setFill(doc, C.navyMid);
  doc.rect(20, TABLE_TOP, 170, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  cols.forEach(col => {
    setTxt(doc, C.blue);
    doc.text(col.label, col.x + (col.align === "center" ? col.w / 2 : 2), TABLE_TOP + 6,
      { align: col.align as any });
  });

  // Data rows
  let rowY = TABLE_TOP + 9;
  const maxRows = Math.floor((H - rowY - 20) / ROW_H);
  const visibleRisks = risks.slice(0, maxRows);

  visibleRisks.forEach((r, idx) => {
    // Alternating row backgrounds
    if (idx % 2 === 0) {
      setFill(doc, C.navyMid);
      doc.setGState(new (doc as any).GState({ opacity: 0.4 }));
      doc.rect(20, rowY, 170, ROW_H, "F");
      doc.setGState(new (doc as any).GState({ opacity: 1 }));
    }

    const inherent = Number(r.inherent_score ?? (r.likelihood * r.impact));
    const residual = Number(r.residual_score ?? inherent);
    const status = r.appetite_status ?? "withinAppetite";
    const statusCol = STATUS_COLOR[status] ?? C.green;
    const typeCol   = TYPE_COLOR[r.risk_type] ?? C.blue;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);

    // Risk ID
    setTxt(doc, C.blue);
    doc.setFont("helvetica", "bold");
    doc.text(r.risk_id ?? "—", cols[0].x + 2, rowY + 5.5);

    // Title (truncate)
    setTxt(doc, C.white);
    doc.setFont("helvetica", "normal");
    const title = (r.title ?? "").length > 34 ? r.title.slice(0, 33) + "…" : r.title ?? "—";
    doc.text(title, cols[1].x + 2, rowY + 5.5);

    // Category dot + text
    setFill(doc, typeCol);
    setDraw(doc, typeCol);
    doc.circle(cols[2].x + 3, rowY + 4, 1.8, "F");
    setTxt(doc, C.muted);
    const cat = (r.risk_type ?? "").length > 15 ? r.risk_type.slice(0, 14) + "…" : r.risk_type ?? "—";
    doc.text(cat, cols[2].x + 7, rowY + 5.5);

    // Inherent score
    setTxt(doc, C.amber);
    doc.setFont("helvetica", "bold");
    doc.text(String(inherent), cols[3].x + cols[3].w / 2, rowY + 5.5, { align: "center" });

    // Residual score
    setTxt(doc, C.green);
    doc.text(residual.toFixed(1), cols[4].x + cols[4].w / 2, rowY + 5.5, { align: "center" });

    // Status badge
    setFill(doc, statusCol);
    doc.setGState(new (doc as any).GState({ opacity: 0.2 }));
    doc.roundedRect(cols[5].x + 1, rowY + 1.5, cols[5].w - 2, 5.5, 1, 1, "F");
    doc.setGState(new (doc as any).GState({ opacity: 1 }));
    setTxt(doc, statusCol);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    const shortStatus = status === "withinAppetite" ? "APPETITE" : status === "withinTolerance" ? "TOLERANCE" : "OUTSIDE";
    doc.text(shortStatus, cols[5].x + cols[5].w / 2, rowY + 5.5, { align: "center" });

    // Row separator
    setDraw(doc, C.navyLt);
    doc.setLineWidth(0.1);
    doc.line(20, rowY + ROW_H, 190, rowY + ROW_H);

    rowY += ROW_H;
  });

  // Overflow note
  if (risks.length > maxRows) {
    setTxt(doc, C.muted);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.text(`+ ${risks.length - maxRows} more risks not shown`, 105, rowY + 6, { align: "center" });
  }

  setTxt(doc, C.navyLt);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Strategic Risk Board Pack  |  Page 3", 105, H - 8, { align: "center" });
}

// ── Page 4: Appetite Status ──────────────────────────────────────────────
function drawAppetiteStatusPage(doc: jsPDF, risks: any[], appetiteCfg: any[]) {
  const W = 210; const H = 297;

  setFill(doc, C.navy);
  doc.rect(0, 0, W, H, "F");
  setFill(doc, C.blue);
  doc.rect(0, 0, W, 3, "F");
  doc.rect(0, H - 3, W, 3, "F");

  setTxt(doc, C.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Appetite Status", 20, 22);
  setTxt(doc, C.blue);
  doc.setFontSize(8);
  doc.text("03", 190, 22, { align: "right" });
  setFill(doc, C.navyLt);
  doc.rect(20, 26, 170, 0.3, "F");

  const RISK_TYPES = ["Macroeconomic", "Financial System", "Policy/Regulatory", "Geopolitical", "Climate/ESG"];

  let cardY = 34;
  RISK_TYPES.forEach(type => {
    const catRisks = risks.filter(r => r.risk_type === type);
    if (catRisks.length === 0) return;

    const cfg = appetiteCfg.find(c => c.category === type);
    const appetiteThresh  = Number(cfg?.appetite_threshold ?? 6);
    const toleranceThresh = Number(cfg?.tolerance_threshold ?? 9);

    const scores = catRisks.map(r => Number(r.residual_score ?? r.inherent_score ?? r.likelihood * r.impact));
    const avgResidual = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const outsideCount = catRisks.filter(r => r.appetite_status === "outsideTolerance").length;
    const tolerCount   = catRisks.filter(r => r.appetite_status === "withinTolerance").length;
    const appetiteCount= catRisks.filter(r => r.appetite_status === "withinAppetite").length;

    const zoneStatus = avgResidual > toleranceThresh ? "outsideTolerance"
                     : avgResidual > appetiteThresh  ? "withinTolerance"
                     : "withinAppetite";
    const zoneCol = STATUS_COLOR[zoneStatus] ?? C.green;
    const typeCol = TYPE_COLOR[type] ?? C.blue;

    const CARD_H = 38;

    // Card background
    setFill(doc, C.navyMid);
    doc.roundedRect(20, cardY, 170, CARD_H, 3, 3, "F");
    setDraw(doc, zoneCol);
    doc.setLineWidth(0.3);
    doc.roundedRect(20, cardY, 170, CARD_H, 3, 3, "S");

    // Category dot + name
    setFill(doc, typeCol);
    setDraw(doc, typeCol);
    doc.circle(28, cardY + 8, 3, "F");
    setTxt(doc, C.white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(type, 34, cardY + 9.5);

    // Zone badge
    setFill(doc, zoneCol);
    doc.setGState(new (doc as any).GState({ opacity: 0.2 }));
    doc.roundedRect(120, cardY + 4, 40, 7, 2, 2, "F");
    doc.setGState(new (doc as any).GState({ opacity: 1 }));
    setTxt(doc, zoneCol);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text(STATUS_LABEL[zoneStatus] ?? zoneStatus, 140, cardY + 9, { align: "center" });

    // Avg residual score
    setTxt(doc, zoneCol);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(avgResidual.toFixed(1), 175, cardY + 11, { align: "center" });
    setTxt(doc, C.muted);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.text("avg residual", 175, cardY + 16, { align: "center" });

    // Exposure gauge
    const gaugeX = 28;
    const gaugeY = cardY + 20;
    const gaugeW = 130;
    const gaugeH = 5;
    const atPct  = Math.min(1, appetiteThresh / 25);
    const ttPct  = Math.min(1, toleranceThresh / 25);
    const avPct  = Math.min(1, avgResidual / 25);

    // Track
    setFill(doc, C.navyLt);
    doc.roundedRect(gaugeX, gaugeY, gaugeW, gaugeH, 1, 1, "F");

    // Green zone
    setFill(doc, [34, 197, 94]);
    doc.setGState(new (doc as any).GState({ opacity: 0.3 }));
    doc.rect(gaugeX, gaugeY, gaugeW * atPct, gaugeH, "F");
    doc.setGState(new (doc as any).GState({ opacity: 1 }));

    // Amber zone
    setFill(doc, [251, 191, 36]);
    doc.setGState(new (doc as any).GState({ opacity: 0.3 }));
    doc.rect(gaugeX + gaugeW * atPct, gaugeY, gaugeW * (ttPct - atPct), gaugeH, "F");
    doc.setGState(new (doc as any).GState({ opacity: 1 }));

    // Red zone
    setFill(doc, [220, 38, 38]);
    doc.setGState(new (doc as any).GState({ opacity: 0.3 }));
    doc.rect(gaugeX + gaugeW * ttPct, gaugeY, gaugeW * (1 - ttPct), gaugeH, "F");
    doc.setGState(new (doc as any).GState({ opacity: 1 }));

    // Current marker
    setFill(doc, zoneCol);
    doc.rect(gaugeX + gaugeW * avPct - 1, gaugeY - 1, 2, gaugeH + 2, "F");

    // Gauge labels
    doc.setFontSize(6);
    setTxt(doc, [34, 197, 94]);
    doc.text(`Appetite: ${appetiteThresh}`, gaugeX, gaugeY + 10);
    setTxt(doc, [251, 191, 36]);
    doc.text(`Tolerance: ${toleranceThresh}`, gaugeX + gaugeW * 0.35, gaugeY + 10);
    setTxt(doc, zoneCol);
    doc.text(`Current: ${avgResidual.toFixed(1)}`, gaugeX + gaugeW * 0.7, gaugeY + 10);

    // Risk count breakdown
    setTxt(doc, C.muted);
    doc.setFontSize(6.5);
    doc.text(`${catRisks.length} risks total`, 28, cardY + CARD_H - 5);
    setTxt(doc, C.green);
    doc.text(`${appetiteCount} appetite`, 72, cardY + CARD_H - 5);
    setTxt(doc, C.amber);
    doc.text(`${tolerCount} tolerance`, 104, cardY + CARD_H - 5);
    setTxt(doc, C.red);
    doc.text(`${outsideCount} outside`, 138, cardY + CARD_H - 5);

    // Appetite statement
    if (cfg?.appetite_statement) {
      setTxt(doc, C.navyLt);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6.5);
      const stmt = cfg.appetite_statement.length > 80
        ? cfg.appetite_statement.slice(0, 79) + "…"
        : cfg.appetite_statement;
      doc.text(`"${stmt}"`, 28, cardY + CARD_H - 11);
    }

    cardY += CARD_H + 6;
  });

  setTxt(doc, C.navyLt);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Strategic Risk Board Pack  |  Page 4", 105, H - 8, { align: "center" });
}

// ── Main export function ─────────────────────────────────────────────────
export function exportBoardPackPdf(risks: any[], appetiteCfg: any[]) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const date = new Date().toISOString().slice(0, 10);

  drawCover(doc, date);

  doc.addPage();
  drawHeatMapPage(doc, risks, appetiteCfg);

  doc.addPage();
  drawRiskRegisterPage(doc, risks);

  doc.addPage();
  drawAppetiteStatusPage(doc, risks, appetiteCfg);

  doc.save(`Strategic-Risk-Board-Pack-${date}.pdf`);
}
