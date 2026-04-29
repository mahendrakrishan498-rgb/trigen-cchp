const express = require('express');
const PDFDocument = require('pdfkit');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');

const router = express.Router();
router.use(authRequired);

function parseJson(value, fallback = {}) {
  try {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function n(v, d = 2) {
  const x = Number(v);
  return Number.isFinite(x)
    ? x.toLocaleString('en-LK', { maximumFractionDigits: d })
    : 'N/A';
}

function money(v) {
  return Number(v || 0).toLocaleString('en-LK', { maximumFractionDigits: 0 });
}

function moneyShort(value) {
  const x = Number(value || 0);
  const a = Math.abs(x);

  if (a >= 1e9) return `${(x / 1e9).toFixed(2)}B LKR`;
  if (a >= 1e6) return `${(x / 1e6).toFixed(2)}M LKR`;
  if (a >= 1e3) return `${(x / 1e3).toFixed(1)}k LKR`;

  return `${x.toFixed(0)} LKR`;
}

function titleCase(s) {
  return String(s || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function valueAt(obj, p, fallback = 'N/A') {
  const val = String(p).split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
  return val ?? fallback;
}
const MAX_REPORT_PAGES = 10;

function pageCount(doc) {
  return doc.bufferedPageRange().count;
}

function safeAddPage(doc) {
  if (pageCount(doc) >= MAX_REPORT_PAGES) {
    doc._pageLimitReached = true;
    return false;
  }

  doc.addPage();
  return true;
}

function canContinue(doc) {
  return !doc._pageLimitReached && pageCount(doc) <= MAX_REPORT_PAGES;
}

function limitNotice(doc) {
  if (!doc._limitNoticeAdded) {
    doc.moveDown(0.8);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#b42318')
      .text(
        'Report page limit reached. Some detailed tables/graphs were omitted to keep the report within 10 pages.',
        42,
        doc.y,
        {
          width: 510,
          align: 'left'
        }
      );

    doc._limitNoticeAdded = true;
  }
}
function ensureSpace(doc, requiredHeight, topY = 55) {
  const bottomLimit = doc.page.height - 70;

  if (doc.y + requiredHeight > bottomLimit) {
    doc.addPage();
    doc.y = topY;
  }
}
function cover(doc, project, inputs) {
  const hotel = project.hotel_name || inputs.hotel_name || 'Selected Hotel';
  const img = path.join(__dirname, '..', '..', 'assets', 'cover-trigeneration.png');

  if (fs.existsSync(img)) {
    doc.image(img, 38, 42, { width: 520, height: 245 });
  } else {
    doc.roundedRect(45, 50, 505, 230, 18).fill('#e8f5e9');
    doc
      .font('Helvetica-Bold')
      .fontSize(28)
      .fillColor('#0f5132')
      .text('Biomass CCHP System', 65, 130, {
        width: 465,
        align: 'center'
      });
  }

  doc
    .font('Helvetica-Bold')
    .fontSize(21)
    .fillColor('#0f5132')
    .text(`Biomass-Based Trigeneration CCHP Feasibility Report of ${hotel}`, 58, 320, {
      width: 480,
      align: 'center',
      lineGap: 6
    });

  doc.moveDown(2);

  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor('#101828')
    .text('Prepared by a Final Year Project Team (21 batch)', {
      align: 'center'
    });

  doc
    .font('Helvetica')
    .fontSize(12)
    .text('Department of Mechanical Engineering, University of Moratuwa', {
      align: 'center'
    });

  doc.moveDown(1);

  doc
    .fontSize(10)
    .fillColor('#667085')
    .text(`Generated on ${new Date().toLocaleDateString()}`, {
      align: 'center'
    });

  doc
    .fontSize(10)
    .fillColor('#475467')
    .text(
      'This report is generated using the biomass-based trigeneration web application.',
      78,
      525,
      {
        width: 440,
        align: 'center',
        lineGap: 3
      }
    );
}

function toc(doc) {
  safeAddPage(doc);

  

  // Return TOC page index.
  // This page will be filled later after all section page numbers are known.
  return doc.bufferedPageRange().count - 1;
}

function drawTOC(doc) {
  const tocPageIndex = doc._tocPageIndex;
  const items = doc._tocItems || [];

  if (tocPageIndex === undefined || items.length === 0) return;

  doc.switchToPage(tocPageIndex);

  doc
    .font('Helvetica-Bold')
    .fontSize(22)
    .fillColor('#0f5132')
    .text('Table of Contents', 60, 72);

  let y = 125;

  items.forEach((item, i) => {
    const numberX = 85;
    const titleX = 115;
    const pageX = 505;
    const rowHeight = 20;

    doc
      .font('Helvetica')
      .fontSize(12)
      .fillColor('#101828')
      .text(`${i + 1}.`, numberX, y, {
        width: 25
      });

    doc
      .font('Helvetica')
      .fontSize(12)
      .fillColor('#0b74b8')
      .text(item.title, titleX, y, {
        width: 340
      });

    doc
      .strokeColor('#d0d5dd')
      .lineWidth(0.5)
      .dash(2, { space: 2 })
      .moveTo(390, y + 8)
      .lineTo(pageX - 12, y + 8)
      .stroke()
      .undash();

    doc
      .font('Helvetica')
      .fontSize(12)
      .fillColor('#101828')
      .text(String(item.page), pageX, y, {
        width: 35,
        align: 'right'
      });

    // Clickable TOC row
    doc.goTo(titleX, y - 2, 425, rowHeight, item.destination);

    y += 24;
  });

  doc
    .fillColor('#16212c')
    .strokeColor('#000000')
    .lineWidth(1);
}

function footer(doc) {
  const range = doc.bufferedPageRange();

  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(i);

    // Outer page border
    doc
      .lineWidth(1.2)
      .strokeColor('#90EE90')
      .rect(24, 24, doc.page.width - 48, doc.page.height - 48)
      .stroke();

    // Page number
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#8a9aa8')
      .text(`Page ${i + 1} of ${range.count}`, 42, doc.page.height - 34, {
        align: 'center',
        width: doc.page.width - 84
      });

    // Reset normal drawing style
    doc
      .lineWidth(1)
      .strokeColor('#000000')
      .fillColor('#16212c');
  }
}

function section(doc, title) {
  ensureSpace(doc, 55);

  doc.moveDown(0.55);

  // Register this section for clickable Table of Contents
  if (doc._tocItems) {
    const cleanTitle = String(title).replace(/^\d+\.\s*/, '');
    const destination = `section_${doc._tocItems.length + 1}`;

    // Add destination at current section position
    doc.addNamedDestination(destination);

    doc._tocItems.push({
      title: cleanTitle,
      page: doc.bufferedPageRange().count,
      destination
    });
  }

  // Save y position before writing title
  const titleY = doc.y;

  // Section heading forced to left side
  doc
    .font('Helvetica-Bold')
    .fontSize(15)
    .fillColor('#0f5132')
    .text(title, 42, titleY, {
      width: 510,
      align: 'left'
    });

  const y = doc.y + 4;

  doc
    .moveTo(42, y)
    .lineTo(552, y)
    .strokeColor('#8bc34a')
    .lineWidth(1.1)
    .stroke();

  doc.moveDown(0.75);

  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor('#16212c');
}

function kpi(doc, x, y, w, label, value, unit, color) {
  doc.roundedRect(x, y, w, 68, 9).fillAndStroke('#f8fbfd', '#dbe7ef');

  doc
    .fillColor(color)
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(value, x + 10, y + 14, {
      width: w - 20
    });

  doc
    .fillColor('#607080')
    .font('Helvetica')
    .fontSize(8)
    .text(label, x + 10, y + 38, {
      width: w - 20
    });

  doc
    .fillColor('#8595a3')
    .fontSize(8)
    .text(unit || '', x + 10, y + 51, {
      width: w - 20
    });
}
function table(doc, rows, columns, opts = {}) {
  if (!rows || rows.length === 0) {
    doc.fontSize(9).fillColor('#667085').text('No data available.');
    doc.moveDown(0.5);
    return;
  }

  const startX = opts.x || 42;
  let y = opts.y || doc.y;
  const widths = opts.widths || columns.map(() => (doc.page.width - 84) / columns.length);
  const headerH = opts.headerH || 22;
  const rowH = opts.rowH || 20;
  const bottomLimit = doc.page.height - 70;

  function drawHeader() {
    let x = startX;

    doc.fontSize(8).font('Helvetica-Bold');

    columns.forEach((c, i) => {
      doc.rect(x, y, widths[i], headerH).fillAndStroke('#e8f5f0', '#cfe4dc');

      doc
        .fillColor('#0d2130')
        .text(c.label, x + 4, y + 7, {
          width: widths[i] - 8
        });

      x += widths[i];
    });

    y += headerH;

    doc.font('Helvetica').fontSize(8);
  }

  // Page break before table starts, not after
  if (y + headerH + rowH > bottomLimit) {
    doc.addPage();
    y = 55;
  }

  drawHeader();

  const displayRows = rows.slice(0, opts.maxRows || 40);

  displayRows.forEach((r, ri) => {
    // IMPORTANT:
    // Check space BEFORE drawing the next row.
    // This avoids creating blank pages after the last row.
    if (y + rowH > bottomLimit) {
      doc.addPage();
      y = 55;
      drawHeader();
    }

    let x = startX;
    const bg = ri % 2 ? '#ffffff' : '#f9fbfd';

    columns.forEach((c, i) => {
      doc.rect(x, y, widths[i], rowH).fillAndStroke(bg, '#edf2f7');

      doc
        .fillColor('#1c2a35')
        .text(String(c.get(r) ?? ''), x + 4, y + 6, {
          width: widths[i] - 8,
          ellipsis: true
        });

      x += widths[i];
    });

    y += rowH;
  });

  if (rows.length > displayRows.length) {
    if (y + 18 > bottomLimit) {
      doc.addPage();
      y = 55;
    }

    doc
      .fontSize(8)
      .fillColor('#667085')
      .text(`Only first ${displayRows.length} rows shown.`, startX, y + 5);

    y += 17;
  }

  doc.y = y + 10;
}

function barChart(doc, x, y, w, h, rows, labelKey, valueKey, title, color) {
  if (!rows || rows.length === 0) return y;

  if (y > doc.page.height - h - 80) {
    doc.addPage();
    y = 72;
  }

  doc
    .fillColor('#16212c')
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(title, x, y - 18);

  doc
    .rect(x, y, w, h)
    .stroke('#dce7ef');

  const values = rows.map((r) => Number(r[valueKey] || 0));
  const max = Math.max(...values, 1);
  const bw = w / rows.length;

  rows.forEach((r, i) => {
    const value = Number(r[valueKey] || 0);
    const bh = (value / max) * (h - 28);
    const bx = x + i * bw + 4;
    const by = y + h - bh - 18;

    doc
      .rect(bx, by, Math.max(2, bw - 8), bh)
      .fill(color || '#14a879');

    doc
      .font('Helvetica')
      .fontSize(6)
      .fillColor('#657686')
      .text(String(r[labelKey] || i + 1), x + i * bw + 2, y + h - 13, {
        width: bw - 4,
        align: 'center'
      });
  });

  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor('#657686')
    .text(`max ${n(max, 0)}`, x + 4, y + 4);

  doc
    .strokeColor('#000000')
    .fillColor('#16212c')
    .lineWidth(1);

  return y + h + 25;
}

function lineChart(doc, x, y, w, h, rows, labelKey, valueKey, title, color) {
  if (!rows || rows.length === 0) return y;

  if (y > doc.page.height - h - 80) {
    doc.addPage();
    y = 72;
  }

  doc
    .fillColor('#16212c')
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(title, x, y - 18);

  doc
    .rect(x, y, w, h)
    .stroke('#dce7ef');

  const values = rows.map((r) => Number(r[valueKey] || 0));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;

  // Light horizontal grid lines
  for (let i = 0; i <= 4; i += 1) {
    const gy = y + h - (i / 4) * h;

    doc
      .strokeColor('#edf2f7')
      .lineWidth(0.5)
      .moveTo(x, gy)
      .lineTo(x + w, gy)
      .stroke();
  }

  // Line graph
  let last = null;

  rows.forEach((r, i) => {
    const px = x + (i / Math.max(rows.length - 1, 1)) * w;
    const py = y + h - ((Number(r[valueKey] || 0) - min) / range) * h;

    if (last) {
      doc
        .moveTo(last.x, last.y)
        .lineTo(px, py)
        .strokeColor(color || '#0b74b8')
        .lineWidth(1.6)
        .stroke();
    }

    doc
      .circle(px, py, 2)
      .fill(color || '#0b74b8');

    last = { x: px, y: py };
  });

  // X-axis labels
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor('#657686');

  rows.forEach((r, i) => {
    const px = x + (i / Math.max(rows.length - 1, 1)) * w;

    doc.text(String(r[labelKey] || i + 1), px - 10, y + h + 5, {
      width: 20,
      align: 'center'
    });
  });

  // Min / max label
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor('#657686')
    .text(`min ${n(min, 0)} / max ${n(max, 0)}`, x + 4, y + 4);

  // Reset drawing style
  doc
    .strokeColor('#000000')
    .fillColor('#16212c')
    .lineWidth(1);

  return y + h + 25;
}
function multiLineChart(doc, x, y, w, h, rows, title) {
  if (!rows || rows.length === 0) return y;

  if (y > doc.page.height - h - 90) {
    doc.addPage();
    y = 72;
  }

  const series = [
    {
      key: 'hotel_electricity_kwh',
      label: 'Electricity kWh',
      color: '#0b74b8'
    },
    {
      key: 'cooling_thermal_kwh',
      label: 'Cooling thermal kWh',
      color: '#14a879'
    },
    {
      key: 'heating_thermal_kwh',
      label: 'Heating kWh',
      color: '#f79009'
    }
  ];

  // get max value from all 3 series
  const allValues = [];
  rows.forEach((row) => {
    series.forEach((s) => {
      allValues.push(Number(row[s.key] || 0));
    });
  });

  const max = Math.max(...allValues, 1);

  // title
  doc
    .fillColor('#16212c')
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(title, x, y - 18);

  // chart border
  doc
    .rect(x, y, w, h)
    .stroke('#dce7ef');

  // chart inner area
  const leftPad = 36;
  const rightPad = 8;
  const topPad = 12;
  const bottomPad = 24;

  const chartX = x + leftPad;
  const chartY = y + topPad;
  const chartW = w - leftPad - rightPad;
  const chartH = h - topPad - bottomPad;

  // horizontal grid + y labels
  for (let i = 0; i <= 4; i += 1) {
    const gy = chartY + chartH - (i / 4) * chartH;
    const gv = (max / 4) * i;

    doc
      .strokeColor('#edf2f7')
      .lineWidth(0.5)
      .moveTo(chartX, gy)
      .lineTo(chartX + chartW, gy)
      .stroke();

    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#657686')
      .text(n(gv, 0), x + 2, gy - 4, {
        width: leftPad - 6,
        align: 'right'
      });
  }

  // vertical grid + month labels
  const count = rows.length;
  const stepX = count > 1 ? chartW / (count - 1) : chartW;

  rows.forEach((row, i) => {
    const px = chartX + i * stepX;

    doc
      .strokeColor('#f1f5f9')
      .lineWidth(0.4)
      .moveTo(px, chartY)
      .lineTo(px, chartY + chartH)
      .stroke();

    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#657686')
      .text(String(row.month || i + 1), px - 10, chartY + chartH + 6, {
        width: 20,
        align: 'center'
      });
  });

  // draw each series
  series.forEach((s) => {
    let last = null;

    rows.forEach((row, i) => {
      const value = Number(row[s.key] || 0);
      const px = chartX + i * stepX;
      const py = chartY + chartH - (value / max) * chartH;

      if (last) {
        doc
          .strokeColor(s.color)
          .lineWidth(1.6)
          .moveTo(last.x, last.y)
          .lineTo(px, py)
          .stroke();
      }

      doc
        .circle(px, py, 2)
        .fill(s.color);

      last = { x: px, y: py };
    });
  });

  // legend
  let lx = x + 60;
  const ly = y + h + 10;

  series.forEach((s) => {
    doc
      .strokeColor(s.color)
      .lineWidth(2)
      .moveTo(lx, ly + 5)
      .lineTo(lx + 12, ly + 5)
      .stroke();

    doc
      .circle(lx + 6, ly + 5, 2)
      .fill(s.color);

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#16212c')
      .text(s.label, lx + 18, ly, { width: 105 });

    lx += 145;
  });

  // reset style
  doc
    .strokeColor('#000000')
    .fillColor('#16212c')
    .lineWidth(1);

  return y + h + 28;
}
router.get('/:projectId/pdf', async (req, res, next) => {
  try {
    const [projects] = await pool.query(
      'SELECT * FROM projects WHERE id=? AND user_id=?',
      [req.params.projectId, req.user.id]
    );

    const project = projects[0];

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const inputs = parseJson(project.inputs_json, {});
    const result = parseJson(project.result_json, {});

    const [bms] = await pool.query(
      'SELECT * FROM bms_uploads WHERE project_id=? AND user_id=? ORDER BY uploaded_at DESC LIMIT 1',
      [req.params.projectId, req.user.id]
    );

    const [comp] = await pool.query(
      'SELECT * FROM retscreen_comparisons WHERE project_id=? AND user_id=? ORDER BY id',
      [req.params.projectId, req.user.id]
    );

    const [pscad] = await pool.query(
      'SELECT time_s, voltage_v, frequency_hz, power_kw, exported_kw FROM pscad_results WHERE project_id=? AND user_id=? ORDER BY time_s LIMIT 400',
      [req.params.projectId, req.user.id]
    );

    const doc = new PDFDocument({
      margin: 42,
      size: 'A4',
      bufferPages: true
    });

    const hotelName = project.hotel_name || inputs.hotel_name || 'Hotel';

    const fileName = `Biomass_CCHP_Feasibility_Report_${String(hotelName).replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    doc.pipe(res);

    cover(doc, project, inputs);

    // Create blank TOC page first
    doc._tocPageIndex = toc(doc);

    // Store TOC data while sections are created
    doc._tocItems = [];

    doc.addPage();

    const summary = result.summary || {};
    const sizing = result.system_sizing || {};
    const financial = result.financial || {};
    const emissions = result.emissions || {};
    const monthly = result.monthly_dispatch || [];
    const cashFlow = result.cash_flow || [];

    section(doc, '1. Project Summary');

const y0 = doc.y;

// Calculate dual chiller size
const mainChillerRt = Number(sizing.main_chiller_rt || 0);
const backupChillerRt = Number(sizing.backup_chiller_rt || 0);

const dualChillerRt =
  Number(sizing.dual_chiller_rt || 0) ||
  mainChillerRt + backupChillerRt ||
  Number(sizing.absorption_chiller_rt || 0) ||
  Number(summary.dual_chiller_rt || 0) ||
  0;

// Row 1
kpi(
  doc,
  42,
  y0,
  150,
  'NPV',
  money(financial.npv_lkr || summary.npv || 0),
  'LKR',
  '#0b74b8'
);

kpi(
  doc,
  210,
  y0,
  150,
  'IRR',
  `${n(financial.irr_percent || summary.irr_percent, 2)}%`,
  'project cash flow',
  '#14a879'
);

kpi(
  doc,
  378,
  y0,
  150,
  'Simple payback',
  n(financial.simple_payback_years || summary.simple_payback_years, 2),
  'years',
  '#f79009'
);

// Row 2
kpi(
  doc,
  42,
  y0 + 82,
  150,
  'GHG reduction',
  n(emissions.co2_reduction_tonnes_year || summary.co2_reduction_ton || 0, 0),
  'tCO2/y',
  '#7c3aed'
);

kpi(
  doc,
  210,
  y0 + 82,
  150,
  'Turbine',
  n(sizing.turbine_kw || summary.turbine_kw || 0, 0),
  'kW',
  '#b42318'
);

kpi(
  doc,
  378,
  y0 + 82,
  150,
  'Dual chiller',
  n(dualChillerRt, 0),
  'RT',
  '#0c6b52'
);

// Move cursor below KPI cards
doc.y = y0 + 170;
    table(doc, [
      { k: 'Project title', v: project.title || inputs.title || '-' },
      { k: 'Hotel name', v: hotelName },
      { k: 'Location / cluster', v: project.location || inputs.location || '-' },
      { k: 'Financial year', v: inputs.financial_year || '-' },
      { k: 'Number of rooms', v: inputs.rooms || '-' }
    ], [
      { label: 'Item', get: (r) => r.k },
      { label: 'Value', get: (r) => r.v }
    ], {
      widths: [230, 280],
      maxRows: 8
    });

    section(doc, '2. Input Assumptions');

    table(doc, [
      ['Electricity intensity', inputs.electricity_intensity_kwh_room_day, 'kWh/room/day'],
      ['Cooling share', inputs.cooling_share, 'fraction'],
      ['Electric chiller COP', inputs.electric_chiller_cop, '-'],
      ['Absorption chiller COP', inputs.absorption_chiller_cop, '-'],
      ['DHW demand', inputs.dhw_l_orn, 'L/ORN'],
      ['Grid import tariff', inputs.grid_import_tariff_lkr_kwh, 'LKR/kWh'],
      ['Selected biomass fuel', inputs.selected_biomass_fuel, '-']
    ].map(([a, b, c]) => ({ a, b, c })), [
      { label: 'Input', get: (r) => r.a },
      { label: 'Value', get: (r) => typeof r.b === 'number' ? n(r.b, 4) : (r.b ?? '-') },
      { label: 'Unit', get: (r) => r.c }
    ], {
      widths: [250, 160, 100],
      maxRows: 18
    });

    section(doc, '3. Load Profile Analysis');

    const load = result.step01_load_profile || {};
    
    // Annual values
    const annualElectricityKwh = Number(load.annual_electricity_kwh || 0);
    const annualCoolingKwh = Number(load.annual_cooling_thermal_kwh || 0);
    const annualHeatingKwh = Number(load.annual_heating_demand_kwh_th || 0);
    
    // Daily values
    const dailyElectricityKwh =
      Number(load.daily_electricity_kwh || 0) ||
      annualElectricityKwh / 365;
    
    const dailyCoolingKwh =
      Number(load.daily_cooling_thermal_kwh || 0) ||
      annualCoolingKwh / 365;
    
    const dailyHeatingKwh =
      Number(load.daily_heating_demand_kwh_th || 0) ||
      annualHeatingKwh / 365;
    
    // Summary table
    table(doc, [
      ['Annual electricity demand', annualElectricityKwh, 'kWh/year'],
      ['Annual cooling thermal demand', annualCoolingKwh, 'kWh/year'],
      ['Annual heating demand', annualHeatingKwh, 'kWhth/year'],
      ['Average daily electricity', dailyElectricityKwh, 'kWh/day'],
      ['Average daily cooling', dailyCoolingKwh, 'kWh/day'],
      ['Average daily heating', dailyHeatingKwh, 'kWh/day']
    ].map(([a, b, c]) => ({ a, b, c })), [
      { label: 'Metric', get: (r) => r.a },
      { label: 'Value', get: (r) => n(r.b, 2) },
      { label: 'Unit', get: (r) => r.c }
    ], {
      widths: [250, 160, 100],
      maxRows: 8
    });
    
    // Monthly electricity graph
    if (monthly.length) {
      doc.y = multiLineChart(
        doc,
        42,
        doc.y + 18,
        510,
        170,
        monthly,
        'Monthly electricity, cooling and heating'
      );
     
    
      table(doc, monthly, [
        { label: 'Month', get: (r) => r.month },
        { label: 'Electricity kWh', get: (r) => money(r.hotel_electricity_kwh) },
        { label: 'Cooling kWh', get: (r) => money(r.cooling_thermal_kwh) },
        { label: 'Heating kWh', get: (r) => money(r.heating_thermal_kwh) }
      ], {
        widths: [65, 145, 150, 150],
        maxRows: 13
      });
    }
    section(doc, '4. Technical Design');
    const design = result.step02_technical_design || {};
    table(doc, [
      ['Boiler / steam generator', sizing.steam_generator_kg_h || design.selected_turbine_inlet_steam_flow_kg_h, 'kg/h steam'],
      ['Steam turbine capacity', sizing.turbine_kw, 'kW'],
      ['Absorption chiller capacity', sizing.absorption_chiller_rt || design.design_cooling_rt, 'RT'],
      ['Main chiller', sizing.main_chiller_rt, 'RT'],
      ['Backup chiller', sizing.backup_chiller_rt, 'RT'],
      ['Heat exchanger', sizing.heat_exchanger_kw, 'kW'],
      ['Selected inlet steam flow', design.selected_turbine_inlet_steam_flow_kg_h, 'kg/h'],
      ['Exhaust steam ratio', valueAt(result, 'energy_balance.exhaust_steam_ratio'), 'fraction']
    ].map(([a, b, c]) => ({ a, b, c })), [
      { label: 'Equipment / metric', get: (r) => r.a },
      { label: 'Value', get: (r) => typeof r.b === 'number' ? n(r.b, 2) : r.b },
      { label: 'Unit', get: (r) => r.c }
    ], { widths: [250, 160, 100], maxRows: 12 });
    section(doc, '5. Monthly Economic Analysis');

    if (monthly.length) {
      const yMonthly = doc.y + 18;

      barChart(doc, 42, yMonthly, 245, 145, monthly, 'month', 'export_revenue_lkr', 'Export Revenue (LKR)', '#14a879');
      barChart(doc, 310, yMonthly, 245, 145, monthly, 'month', 'import_cost_lkr', 'Grid Import Cost (LKR)', '#f04438');

      doc.y = yMonthly + 180;

      table(doc, monthly, [
        { label: 'Month', get: (r) => r.month },
        { label: 'Hotel Elec kWh', get: (r) => money(r.hotel_electricity_kwh) },
        { label: 'Cooling kWh', get: (r) => money(r.cooling_thermal_kwh) },
        { label: 'Heating kWh', get: (r) => money(r.heating_thermal_kwh) },
        { label: 'Export kWh', get: (r) => money(r.grid_export_kwh) },
        { label: 'Export Revenue', get: (r) => moneyShort(r.export_revenue_lkr) }
      ], {
        widths: [45, 95, 90, 90, 85, 105],
        maxRows: 13
      });
    }

    section(doc, '6. Financial Feasibility');

    table(doc, Object.entries(financial).map(([k, v]) => ({ k: titleCase(k), v })), [
      { label: 'Financial metric', get: (r) => r.k },
      { label: 'Value', get: (r) => String(r.k).toLowerCase().includes('lkr') ? moneyShort(r.v) : n(r.v, 3) }
    ], {
      widths: [310, 200],
      maxRows: 26
    });

    section(doc, '7. Cash Flow Table');

    if (cashFlow.length) {
      const filtered = cashFlow.filter((r) => Number(r.year_index) <= 25);

      doc.y = lineChart(
        doc,
        42,
        doc.y + 18,
        510,
        150,
        filtered,
        'year_index',
        'cumulative_discounted_cash_flow_lkr',
        'Cumulative Discounted Cash Flow (LKR)',
        '#b42318'
      );

      table(doc, filtered, [
        { label: 'Year', get: (r) => r.year_index },
        { label: 'Export tariff', get: (r) => n(r.export_tariff_lkr_kwh, 2) },
        { label: 'Benefits', get: (r) => moneyShort(r.total_project_benefits_lkr) },
        { label: 'Net CF', get: (r) => moneyShort(r.net_cash_flow_lkr) },
        { label: 'Cum. DCF', get: (r) => moneyShort(r.cumulative_discounted_cash_flow_lkr) }
      ], {
        widths: [50, 90, 125, 120, 125],
        maxRows: 26
      });
    }

    section(doc, '8. Emission Reduction');

    // Get emission values safely
    const baselineEmission =
      Number(emissions.baseline_tonnes_year || 0) ||
      Number(emissions.baseline_emission_tonnes_year || 0) ||
      Number(emissions.current_emission_tonnes_year || 0) ||
      0;
    
    const projectEmission =
      Number(emissions.project_tonnes_year || 0) ||
      Number(emissions.project_emission_tonnes_year || 0) ||
      Number(emissions.new_system_emission_tonnes_year || 0) ||
      0;
    
    const co2Reduction =
      Number(emissions.co2_reduction_tonnes_year || 0) ||
      Number(emissions.co2_reduction_ton || 0) ||
      Math.max(baselineEmission - projectEmission, 0);
    
    // Emission graph data
    const emissionGraphRows = [
      {
        item: 'Baseline',
        value: baselineEmission
      },
      {
        item: 'Project',
        value: projectEmission
      },
      {
        item: 'Reduction',
        value: co2Reduction
      }
    ];
    
    // Add graph
    doc.y = barChart(
      doc,
      42,
      doc.y + 18,
      510,
      150,
      emissionGraphRows,
      'item',
      'value',
      'Emission Comparison (tCO2/year)',
      '#14a879'
    );
    
    // Add emission table
    table(doc, Object.entries(emissions).map(([k, v]) => ({ k: titleCase(k), v })), [
      { label: 'Emission item', get: (r) => r.k },
      { label: 'Value', get: (r) => n(r.v, 2) }
    ], {
      widths: [310, 200],
      maxRows: 12
    });

    section(doc, '9. Sensitivity Analysis');

    const sensitivity = result.sensitivity || [];

    if (sensitivity.length) {
      doc.y = barChart(
        doc,
        42,
        doc.y + 18,
        510,
        145,
        sensitivity,
        'scenario',
        'adjusted_simple_payback_years',
        'Sensitivity: Adjusted Simple Payback (years)',
        '#f79009'
      );

      table(doc, sensitivity, [
        { label: 'Scenario', get: (r) => r.scenario },
        { label: 'Savings LKR/y', get: (r) => moneyShort(r.adjusted_year1_net_project_savings_lkr) },
        { label: 'NPV', get: (r) => moneyShort(r.adjusted_npv_lkr) },
        { label: 'Payback y', get: (r) => n(r.adjusted_simple_payback_years, 2) }
      ], {
        widths: [150, 130, 130, 100],
        maxRows: 12
      });
    }

    section(doc, '10. Design Analysis & Validation');

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#16212c')
      .text('Latest BMS Summary');

    doc.moveDown(0.35);

    if (bms[0]) {
      table(doc, Object.entries(parseJson(bms[0].summary_json, {})).map(([k, v]) => ({
        k: titleCase(k),
        v
      })), [
        { label: 'BMS item', get: (r) => r.k },
        { label: 'Value', get: (r) => typeof r.v === 'number' ? n(r.v, 3) : r.v }
      ], {
        widths: [260, 250],
        maxRows: 12
      });
    } else {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#667085')
        .text('No BMS upload attached.');

      doc.moveDown(0.8);
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#16212c')
      .text('Design Analysis / PSCAD Data');

    doc.moveDown(0.35);

    if (pscad.length) {
      doc.y = lineChart(
        doc,
        42,
        doc.y + 18,
        510,
        145,
        pscad,
        'time_s',
        'power_kw',
        'Generator Power (kW)',
        '#0b74b8'
      );

      table(doc, pscad.slice(0, 20), [
        { label: 'Time s', get: (r) => n(r.time_s, 2) },
        { label: 'Voltage V', get: (r) => n(r.voltage_v, 2) },
        { label: 'Freq Hz', get: (r) => n(r.frequency_hz, 3) },
        { label: 'Power kW', get: (r) => n(r.power_kw, 2) },
        { label: 'Export kW', get: (r) => n(r.exported_kw, 2) }
      ], {
        widths: [70, 100, 95, 120, 125],
        maxRows: 20
      });
    } else {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#667085')
        .text('No PSCAD/design analysis upload attached.');

      doc.moveDown(0.8);
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#16212c')
      .text('Excel / RETScreen Comparison');

    doc.moveDown(0.35);

    if (comp.length) {
      table(doc, comp, [
        { label: 'Metric', get: (r) => r.metric },
        { label: 'Website', get: (r) => n(r.website_value, 2) },
        { label: 'Excel/RETScreen', get: (r) => n(r.retscreen_value, 2) },
        { label: 'Error %', get: (r) => n(r.error_percent, 2) }
      ], {
        widths: [180, 110, 130, 90],
        maxRows: 18
      });
    } else {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#667085')
        .text('No Excel / RETScreen comparison rows attached.');

      doc.moveDown(0.8);
    }

    section(doc, '11. Methodology Notes');

    const notes = [
      'Step01 follows the Excel energy segregation logic: annual electricity is benchmark-based or BMS/measured; cooling electricity is multiplied by existing chiller COP; heating is DHW plus laundry/process heat.',
    
      'Step02 follows the Excel dual-chiller and extraction steam turbine selection logic: peak cooling is converted to RT, main/backup chillers are selected from candidate sizes, and the first suitable turbine is selected from candidate kW values.',
    
      'Step03 follows the uploaded workbook savings-based model: avoided hotel energy cost plus export revenue are benefits; biomass fuel, O&M, insurance, overhaul and CAPEX are project costs.',
    
      'Export revenue is year-linked using the export tariff schedule. Year 1 uses the selected financial year tariff, while later cash-flow years use their corresponding tariff rows.',
    
      'CO2 reduction compares baseline grid/heating emissions with project import emissions, biomass emissions and exported-grid displacement credit.'
    ];
    
    notes.forEach((m, i) => {
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor('#16212c')
        .text(`${i + 1}. ${m}`, {
          width: 510,
          align: 'justify',
          paragraphGap: 6
        });
    });
    
    
    // =========================
    // 12. Final Conclusion
    // =========================
    
    section(doc, '12. Final Conclusion');
    
    // Safe values for conclusion
    const conclusionHotelName =
      hotelName ||
      project.hotel_name ||
      inputs.hotel_name ||
      'the selected hotel';
    
    const conclusionLocation =
      project.location ||
      inputs.location ||
      'the selected hotel cluster';
    
    const conclusionNpv =
      Number(financial.npv_lkr || summary.npv || 0);
    
    const conclusionIrr =
      Number(financial.irr_percent || summary.irr_percent || 0);
    
    const conclusionPayback =
      Number(financial.simple_payback_years || summary.simple_payback_years || 0);
    
    const conclusionCo2Reduction =
      Number(emissions.co2_reduction_tonnes_year || emissions.co2_reduction_ton || summary.co2_reduction_ton || 0);
    
    const conclusionTurbine =
      Number(sizing.turbine_kw || summary.turbine_kw || 0);
    
    const conclusionMainChiller =
      Number(sizing.main_chiller_rt || 0);
    
    const conclusionBackupChiller =
      Number(sizing.backup_chiller_rt || 0);
    
    const conclusionDualChiller =
      Number(sizing.dual_chiller_rt || 0) ||
      conclusionMainChiller + conclusionBackupChiller ||
      Number(sizing.absorption_chiller_rt || 0) ||
      0;
    
    const annualElectricityConclusion =
      Number(load.annual_electricity_kwh || 0);
    
    const annualCoolingConclusion =
      Number(load.annual_cooling_thermal_kwh || 0);
    
    const annualHeatingConclusion =
      Number(load.annual_heating_demand_kwh_th || 0);
    
    // Feasibility statement
    let feasibilityText = 'The project shows moderate feasibility and is recommended for further detailed engineering review.';
    
    if (conclusionNpv > 0 && conclusionIrr > 0 && conclusionPayback > 0 && conclusionPayback <= 10) {
      feasibilityText = 'The project shows strong techno-economic feasibility for further implementation-level study.';
    } else if (conclusionNpv > 0 && conclusionPayback > 10) {
      feasibilityText = 'The project shows positive long-term economic potential, although the payback period should be reviewed carefully during detailed feasibility assessment.';
    } else if (conclusionNpv <= 0) {
      feasibilityText = 'The project requires further optimisation because the current financial result does not strongly support immediate implementation.';
    }
    
    // Conclusion paragraphs
    const conclusionParagraphs = [
      `Based on the saved simulation results, the proposed biomass-based trigeneration CCHP system for ${conclusionHotelName} in the ${conclusionLocation} cluster was evaluated using the web-based feasibility model. The model considered hotel electricity demand, cooling thermal demand, hot water/process heat demand, biomass fuel cost, grid tariff, export tariff, capital cost, operating cost and emission reduction potential.`,
    
      `The estimated annual electricity demand is ${n(annualElectricityConclusion, 0)} kWh/year, while the annual cooling thermal demand is ${n(annualCoolingConclusion, 0)} kWh/year and the annual heating demand is ${n(annualHeatingConclusion, 0)} kWhth/year. According to the technical design output, the selected turbine capacity is approximately ${n(conclusionTurbine, 0)} kW and the dual absorption chiller capacity is approximately ${n(conclusionDualChiller, 0)} RT.`,
    
      `From the financial analysis, the calculated Net Present Value is ${moneyShort(conclusionNpv)}, the Internal Rate of Return is ${n(conclusionIrr, 2)}%, and the simple payback period is approximately ${n(conclusionPayback, 2)} years. These values indicate the expected financial performance of the proposed system under the current assumptions and tariff structure.`,
    
      `From the environmental assessment, the system provides an estimated CO2 emission reduction of approximately ${n(conclusionCo2Reduction, 0)} tCO2/year. This reduction is achieved by replacing part of the conventional grid electricity and fossil-fuel-based heating demand with biomass-based combined cooling, heating and power generation.`,
    
      `${feasibilityText} Before actual implementation, supplier quotations, site-specific biomass availability, boiler and turbine selection, grid export approval, detailed PSCAD/MATLAB validation, and operational constraints should be verified.`
    ];
    
    conclusionParagraphs.forEach((p) => {
      doc
        .font('Helvetica')
        .fontSize(9.8)
        .fillColor('#16212c')
        .text(p, {
          width: 510,
          align: 'justify',
          lineGap: 3,
          paragraphGap: 8
        });
    });


    // Fill clickable TOC page after all sections are created
    drawTOC(doc);

    // Add border and page numbers to every page
    footer(doc);

    doc.end();
  } catch (err) {
    console.error('PDF generation error:', err);

    // If PDF response already started, do not send JSON error
    if (res.headersSent) {
      try {
        res.end();
      } catch (_) {}
      return;
    }

    next(err);
  }
});
module.exports = router;