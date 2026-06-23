const express = require('express');
const PDFDocument = require('pdfkit');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { getClusterDispatch15Min } = require('../services/clusterDispatch15MinService');
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

function compactNumber(value, d = 1) {
  const x = Number(value || 0);
  const a = Math.abs(x);
  if (a >= 1e9) return `${(x / 1e9).toFixed(d)}B`;
  if (a >= 1e6) return `${(x / 1e6).toFixed(d)}M`;
  if (a >= 1e3) return `${(x / 1e3).toFixed(d)}k`;
  return n(x, d);
}

function numberValue(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
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
const MAX_REPORT_PAGES = 14;

const metricLabelMap = {
  npv_lkr: 'Net Present Value (NPV)',
  irr_percent: 'Internal Rate of Return (IRR)',
  simple_payback_years: 'Simple Payback Period',
  discounted_payback_years: 'Discounted Payback Period',
  annual_ghg_reduction_kgco2_y: 'Annual GHG Reduction',
  co2_reduction_tonnes_year: 'CO2 Reduction',
  co2_reduction_ton: 'CO2 Reduction',
  baseline_tonnes_year: 'Baseline Emissions',
  baseline_emission_tonnes_year: 'Baseline Emissions',
  project_tonnes_year: 'Project Net Emissions',
  project_emission_tonnes_year: 'Project Net Emissions',
  export_displacement_credit_tonnes_year: 'Grid Export Displacement Credit',
  proposed_fixed_om_lkr_y: 'Fixed O&M Cost',
  proposed_variable_om_lkr_y: 'Variable O&M Cost',
  proposed_insurance_admin_lkr_y: 'Insurance and Administration Cost',
  annual_life_cycle_savings_lkr_y: 'Annual Life-Cycle Savings',
  grid_export_revenue_year1_lkr_y: 'Year 1 Grid Export Revenue',
  year1_net_project_savings_lkr_y: 'Year 1 Net Project Savings',
  avoided_hotel_heating_cost_lkr_y: 'Avoided Heating Cost',
  avoided_hotel_electricity_cost_lkr_y: 'Avoided Grid Electricity Cost',
  total_avoided_hotel_energy_cost_lkr_y: 'Total Avoided Hotel Energy Cost',
  proposed_annual_grid_import_cost_lkr_y: 'Annual Grid Import Cost',
  proposed_annual_biomass_fuel_cost_lkr_y: 'Annual Biomass Fuel Cost',
  proposed_annual_project_net_operating_cost_lkr_y: 'Annual Net Operating Cost',
  proposed_annual_project_operating_cost_before_export_lkr_y: 'Operating Cost Before Export Revenue',
  direct_equipment_capex_lkr: 'Direct Equipment CAPEX',
  net_initial_investment_lkr: 'Net Initial Investment',
  turbine_kw: 'Steam Turbine Capacity',
  absorption_chiller_rt: 'Absorption Chiller Capacity',
  main_chiller_rt: 'Main Absorption Chiller',
  backup_chiller_rt: 'Backup Absorption Chiller'
};

function formatMetricLabel(key) {
  const normalized = String(key || '').trim().toLowerCase();
  if (metricLabelMap[normalized]) return metricLabelMap[normalized];

  return titleCase(normalized)
    .replace(/\bLkr\b/g, 'LKR')
    .replace(/\bNpv\b/g, 'NPV')
    .replace(/\bIrr\b/g, 'IRR')
    .replace(/\bOm\b/g, 'O&M')
    .replace(/\bDhw\b/g, 'DHW')
    .replace(/\bGhg\b/g, 'GHG')
    .replace(/\bCo2\b/g, 'CO2')
    .replace(/\bKgco2\b/g, 'kgCO2')
    .replace(/\bKwh\b/g, 'kWh')
    .replace(/\bKw\b/g, 'kW')
    .replace(/\bRt\b/g, 'RT');
}

function unitForMetric(key) {
  const k = String(key || '').toLowerCase();
  if (k.includes('irr') || k.includes('percent') || k.endsWith('_pct')) return '%';
  if (k.includes('payback')) return 'years';
  if (k.includes('lkr')) return 'LKR';
  if (k.includes('kgco2')) return 'kgCO2/year';
  if (k.includes('co2') || k.includes('emission') || k.includes('tonnes')) return 'tCO2/year';
  if (k.includes('kwh_th') || k.includes('kwhth')) return 'kWhth/year';
  if (k.includes('kwh')) return 'kWh/year';
  if (k.includes('turbine') && k.includes('kw')) return 'kW';
  if (k.includes('chiller') && k.includes('rt')) return 'RT';
  if (k.includes('biomass') && k.includes('tonnes')) return 'tonnes/year';
  return '';
}

function formatMetricValue(key, value, decimals = 2) {
  if (value === undefined || value === null || value === '') return 'N/A';
  const x = Number(value);
  const k = String(key || '').toLowerCase();
  if (!Number.isFinite(x)) return String(value);
  if (k.includes('lkr')) return moneyShort(x);
  if (k.includes('irr') || k.includes('percent') || k.endsWith('_pct')) return `${n(x, decimals)}%`;
  if (k.includes('payback')) return `${n(x, decimals)} years`;
  if (k.includes('kgco2')) return `${n(x, decimals)} kgCO2/year`;
  if (k.includes('co2') || k.includes('emission') || k.includes('tonnes')) return `${n(x, decimals)} tCO2/year`;
  if (k.includes('kwh_th') || k.includes('kwhth')) return `${n(x, decimals)} kWhth/year`;
  if (k.includes('kwh')) return `${n(x, decimals)} kWh/year`;
  if (k.includes('turbine') && k.includes('kw')) return `${n(x, decimals)} kW`;
  if (k.includes('chiller') && k.includes('rt')) return `${n(x, decimals)} RT`;
  return n(x, decimals);
}

function reportParagraph(doc, text, opts = {}) {
  if (!text) return;
  ensureSpace(doc, opts.height || 52);
  doc
    .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(opts.size || 9.3)
    .fillColor(opts.color || '#16212c')
    .text(text, opts.x || 42, doc.y, {
      width: opts.width || 510,
      align: opts.align || 'justify',
      lineGap: opts.lineGap || 2.5,
      paragraphGap: opts.paragraphGap || 7
    });
}

function subsection(doc, title) {
  ensureSpace(doc, 32);
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#183241')
    .text(title, 42, doc.y, { width: 510 });
  doc.moveDown(0.35);
}

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

function lockPageLimit(doc) {
  const originalAddPage = doc.addPage.bind(doc);

  doc.addPage = (...args) => {
    if (pageCount(doc) >= MAX_REPORT_PAGES) {
      doc._pageLimitReached = true;
      return doc;
    }

    return originalAddPage(...args);
  };
}

function canContinue(doc) {
  return !doc._pageLimitReached && pageCount(doc) < MAX_REPORT_PAGES;
}

function limitNotice(doc) {
  if (!doc._limitNoticeAdded) {
    doc.moveDown(0.8);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#b42318')
      .text(
        `Report page limit reached. Some detailed tables/graphs were omitted to keep the report within ${MAX_REPORT_PAGES} pages.`,
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
    if (safeAddPage(doc)) doc.y = topY;
  }
}
function cover(doc, project, inputs) {
  const hotel = project.hotel_name || inputs.hotel_name || 'Selected Hotel';
  const img = path.join(__dirname, '..', '..', 'assets', 'report-cover.png');
  const generatedAt = new Date().toLocaleString('en-LK', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  doc.rect(0, 0, doc.page.width, doc.page.height).fill('#000000');

  if (fs.existsSync(img)) {
    try {
      doc.image(img, 0, 0, {
        width: doc.page.width,
        height: doc.page.height
      });
    } catch (err) {
      console.warn('Cover image could not be rendered:', err.message);
    }
  }

  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .fillColor('#0b2f2a')
    .text(hotel, 220, 235.91, {
      width: 170,
      align: 'center'
    });

  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor('#000000')
    .text(`Generated: ${generatedAt}`, doc.page.width - 250, doc.page.height - 63.79, {
      width: 210,
      align: 'right'
    });
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
    .fillColor('#062f29')
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
      .strokeColor('#06342d')
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
    .fillColor('#062f29')
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
    if (!safeAddPage(doc)) return;
    y = 55;
  }

  drawHeader();

  const displayRows = rows.slice(0, opts.maxRows || 40);

  displayRows.forEach((r, ri) => {
    // IMPORTANT:
    // Check space BEFORE drawing the next row.
    // This avoids creating blank pages after the last row.
    if (y + rowH > bottomLimit) {
      if (!safeAddPage(doc)) return;
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
      if (!safeAddPage(doc)) return;
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
    if (!safeAddPage(doc)) return y;
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
    .strokeColor('#000000')
    .fillColor('#16212c')
    .lineWidth(1);

  return y + h + 25;
}

function signedBarChart(doc, x, y, w, h, rows, labelKey, valueKey, title, color) {
  if (!rows || rows.length === 0) return y;

  if (y > doc.page.height - h - 80) {
    if (!safeAddPage(doc)) return y;
    y = 72;
  }

  doc
    .fillColor('#16212c')
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(title, x, y - 18);

  doc.rect(x, y, w, h).stroke('#dce7ef');

  const values = rows.map((r) => Number(r[valueKey] || 0));
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const zeroY = y + h - ((0 - min) / range) * h;
  const bw = w / rows.length;

  doc
    .strokeColor('#98a2b3')
    .lineWidth(0.8)
    .moveTo(x, zeroY)
    .lineTo(x + w, zeroY)
    .stroke();

  rows.forEach((r, i) => {
    const value = Number(r[valueKey] || 0);
    const valueY = y + h - ((value - min) / range) * h;
    const bx = x + i * bw + 18;
    const by = Math.min(valueY, zeroY);
    const bh = Math.max(2, Math.abs(zeroY - valueY));

    doc
      .rect(bx, by, Math.max(14, bw - 36), bh)
      .fill(value < 0 ? '#b42318' : (color || '#6941c6'));

    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#657686')
      .text(String(r[labelKey] || i + 1), x + i * bw + 3, y + h + 6, {
        width: bw - 6,
        align: 'center'
      });
  });

  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor('#657686')
    .text(compactNumber(max, 1), x + 4, y + 4, { width: 60 })
    .text(compactNumber(min, 1), x + 4, y + h - 13, { width: 60 });

  doc
    .strokeColor('#000000')
    .fillColor('#16212c')
    .lineWidth(1);

  return y + h + 32;
}

function lineChart(doc, x, y, w, h, rows, labelKey, valueKey, title, color) {
  if (!rows || rows.length === 0) return y;

  if (y > doc.page.height - h - 80) {
    if (!safeAddPage(doc)) return y;
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
    if (!safeAddPage(doc)) return y;
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

function compactDispatchChart(doc, x, y, w, h, rows, title, series) {
  if (!rows || !rows.length) return y;

  const allValues = [];
  rows.forEach((row) => {
    series.forEach((s) => allValues.push(numberValue(row[s.key], 0)));
  });

  const max = Math.max(...allValues, 1);
  const min = Math.min(...allValues, 0);
  const range = Math.max(max - min, 1);

  doc
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .fillColor('#16212c')
    .text(title, x, y - 12, { width: w });

  doc.rect(x, y, w, h).stroke('#dce7ef');

  const leftPad = 30;
  const rightPad = 8;
  const topPad = 10;
  const bottomPad = 18;
  const chartX = x + leftPad;
  const chartY = y + topPad;
  const chartW = w - leftPad - rightPad;
  const chartH = h - topPad - bottomPad;

  for (let i = 0; i <= 3; i += 1) {
    const gy = chartY + chartH - (i / 3) * chartH;
    doc
      .strokeColor('#edf2f7')
      .lineWidth(0.4)
      .moveTo(chartX, gy)
      .lineTo(chartX + chartW, gy)
      .stroke();
  }

  series.forEach((s) => {
    let last = null;
    rows.forEach((row, index) => {
      const px = chartX + (index / Math.max(rows.length - 1, 1)) * chartW;
      const py = chartY + chartH - ((numberValue(row[s.key], 0) - min) / range) * chartH;

      if (last) {
        doc
          .moveTo(last.x, last.y)
          .lineTo(px, py)
          .strokeColor(s.color)
          .lineWidth(1.1)
          .stroke();
      }

      last = { x: px, y: py };
    });
  });

  doc
    .font('Helvetica')
    .fontSize(6.5)
    .fillColor('#667085')
    .text(compactNumber(max, 1), x + 3, y + 3, { width: 28 })
    .text(compactNumber(min, 1), x + 3, y + h - 22, { width: 28 })
    .text('0h', chartX - 5, y + h - 13, { width: 18 })
    .text('24h', chartX + chartW - 12, y + h - 13, { width: 24, align: 'right' });

  let lx = x + 4;
  const ly = y + h + 4;
  series.forEach((s) => {
    doc.rect(lx, ly + 2, 7, 3).fill(s.color);
    doc
      .font('Helvetica')
      .fontSize(6.5)
      .fillColor('#667085')
      .text(s.label, lx + 10, ly, { width: 95 });
    lx += Math.min(110, Math.max(62, s.label.length * 4.2));
  });

  doc
    .strokeColor('#000000')
    .fillColor('#16212c')
    .lineWidth(1);

  return y + h + 18;
}

function buildReportDispatchRows(rawRows, result) {
  const rows = Array.isArray(rawRows) && rawRows.length ? rawRows : (result.dispatch_15min || []);
  if (!rows.length) return [];

  const designedTurbineKw = numberValue(result.system_sizing?.turbine_kw, 0);
  const fallbackRatedPower = Math.max(...rows.map((row) => numberValue(row.turbine_output_kw, 0)), 800);
  const ratedPowerKw = designedTurbineKw || fallbackRatedPower;
  const avgElectricKw = numberValue(result.step01_load_profile?.annual_electricity_kwh, 0) / 8760;
  const avgCoolingKw = numberValue(result.step01_load_profile?.annual_cooling_thermal_kwh, 0) / 8760;

  return rows.slice(0, 96).map((row, index) => {
    const electricFactor = numberValue(row.hotel_electric_factor || row.electric_factor, 0) || 1;
    const coolingFactor = numberValue(row.cooling_thermal_factor || row.cooling_factor, 0) || 1;
    const hotelElectricKw = numberValue(row.hotel_electric_kw, 0) || avgElectricKw * electricFactor;
    const coolingThermalKw = numberValue(row.cooling_thermal_kw, 0) || avgCoolingKw * coolingFactor;
    const turbineOutputKw = designedTurbineKw || numberValue(row.turbine_output_kw, 0);
    const loadFraction = ratedPowerKw > 0 ? hotelElectricKw / ratedPowerKw : 0;
    const timeHour = numberValue(row.time_hour ?? row.hour, index / 4);

    return {
      time_hour: timeHour,
      hotel_electric_kw: hotelElectricKw,
      cooling_thermal_kw: coolingThermalKw,
      turbine_output_kw: turbineOutputKw,
      voltage_output_v: Math.max(360, 400 * (1 - 0.04 * loadFraction)),
      frequency_hz: Math.max(49, 50 * (1 - 0.02 * loadFraction)),
      grid_import_kw: Math.max(0, hotelElectricKw - turbineOutputKw),
      grid_export_kw: Math.max(0, turbineOutputKw - hotelElectricKw)
    };
  });
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

    let clusterDispatch = [];
    const reportLocation = project.location || inputs.location || '';
    if (reportLocation) {
      const [clusters] = await pool.query('SELECT id FROM cluster_defaults WHERE cluster_name=? LIMIT 1', [reportLocation]);
      if (clusters.length) {
        clusterDispatch = await getClusterDispatch15Min(clusters[0].id);
      }
    }

    const doc = new PDFDocument({
      margin: 42,
      size: 'A4',
      bufferPages: true
    });
    lockPageLimit(doc);

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

    safeAddPage(doc);

    const summary = result.summary || {};
    const sizing = result.system_sizing || {};
    const financial = result.financial || {};
    const fuel = result.fuel || {};
    const feasibility = result.feasibility || {};
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

const reportNpv = Number(financial.npv_lkr || summary.npv || 0);
const reportIrr = Number(financial.irr_percent || summary.irr_percent || 0);
const reportPayback = Number(financial.simple_payback_years || summary.simple_payback_years || 0);
const reportDiscountedPayback = Number(financial.discounted_payback_years || summary.discounted_payback_years || 0);
const reportProfitabilityIndex = Number(financial.profitability_index || summary.profitability_index || 0);
const reportDiscountRate = Number(inputs.discount_rate || inputs.target_return_percent || 0);
const reportCo2Reduction = Number(emissions.co2_reduction_tonnes_year || emissions.co2_reduction_ton || summary.co2_reduction_ton || 0);
const reportTurbineKw = Number(sizing.turbine_kw || summary.turbine_kw || 0);
const reportCapex = Number(financial.net_initial_investment_lkr || result.step03_capex?.net_initial_investment_lkr || sizing.capex_lkr || 0);
const reportAnnualNetBenefit = Number(financial.year1_net_project_savings_lkr_y || financial.annual_life_cycle_savings_lkr_y || summary.year1_net_project_savings_lkr || 0);
const reportExportRevenue = Number(financial.grid_export_revenue_year1_lkr_y || result.energy_balance?.annual_grid_export_revenue_lkr || 0);
const reportBiomassCost = Number(financial.proposed_annual_biomass_fuel_cost_lkr_y || result.fuel?.annual_biomass_cost_lkr || 0);
const sustainableScenario =
  result.inputs_used?.sustainable_market_scenario ||
  inputs.sustainable_market_scenario ||
  inputs.consider_sustainable_tourism_premium_market_scenario ||
  'No';

// Row 1
kpi(
  doc,
  42,
  y0,
  118,
  'NPV',
  moneyShort(reportNpv),
  '',
  '#0b74b8'
);

kpi(
  doc,
  172,
  y0,
  118,
  'IRR',
  `${n(reportIrr, 2)}%`,
  'cash flow',
  '#14a879'
);

kpi(
  doc,
  302,
  y0,
  118,
  'Profitability index',
  n(reportProfitabilityIndex, 2),
  'ratio',
  '#6941c6'
);

kpi(
  doc,
  432,
  y0,
  118,
  'Discounted payback',
  reportDiscountedPayback ? n(reportDiscountedPayback, 2) : 'N/A',
  'years',
  '#b42318'
);

// Row 2
kpi(
  doc,
  42,
  y0 + 82,
  118,
  'Simple payback',
  n(reportPayback, 2),
  'years',
  '#f79009'
);

kpi(
  doc,
  172,
  y0 + 82,
  118,
  'GHG reduction',
  n(reportCo2Reduction, 0),
  'tCO2/y',
  '#7c3aed'
);

kpi(
  doc,
  302,
  y0 + 82,
  118,
  'Turbine',
  n(reportTurbineKw, 0),
  'kW',
  '#0c6b52'
);

kpi(
  doc,
  432,
  y0 + 82,
  118,
  'Dual chiller',
  n(dualChillerRt, 0),
  'RT',
  '#344054'
);

// Move cursor below KPI cards
doc.y = y0 + 170;
    table(doc, [
      { k: 'Project title', v: project.title || inputs.title || '-' },
      { k: 'Hotel name', v: hotelName },
      { k: 'Location / cluster', v: project.location || inputs.location || '-' },
      { k: 'Financial year', v: inputs.financial_year || '-' },
      { k: 'Number of rooms', v: inputs.rooms || '-' },
      { k: 'Sustainable tourism premium scenario', v: sustainableScenario }
    ], [
      { label: 'Item', get: (r) => r.k },
      { label: 'Value', get: (r) => r.v }
    ], {
      widths: [230, 280],
      maxRows: 8
    });

    const projectSummaryText = [
      reportCo2Reduction > 0
        ? `The results indicate that the proposed biomass-based CCHP configuration provides a measurable environmental benefit, with an estimated annual CO2 reduction of ${n(reportCo2Reduction, 0)} tCO2/year.`
        : 'The current saved result does not show a positive CO2 reduction value, so the environmental benefit should be reviewed with the input assumptions.',
      `The selected system includes a ${n(reportTurbineKw, 0)} kW extraction steam turbine and ${n(dualChillerRt, 0)} RT total absorption chiller capacity.`,
      reportNpv < 0
        ? `However, the financial indicators show that the current configuration requires further optimisation, as the NPV is ${moneyShort(reportNpv)} and the simple payback period is ${n(reportPayback, 2)} years under the selected assumptions.`
        : `The positive NPV of ${moneyShort(reportNpv)} indicates positive financial feasibility under the selected assumptions, with a simple payback period of ${n(reportPayback, 2)} years.`,
      reportDiscountRate && reportIrr < reportDiscountRate
        ? `The IRR of ${n(reportIrr, 2)}% is below the selected discount rate or target return of ${n(reportDiscountRate, 2)}%, therefore financial optimisation is required.`
        : '',
      reportPayback > 10 ? 'The payback period is relatively long for implementation-stage investment approval and should be improved through CAPEX, tariff, or fuel-supply optimisation.' : ''
    ].filter(Boolean).join(' ');
    reportParagraph(doc, projectSummaryText);

    section(doc, '2. Inputs');

    const inputsUsed = result.inputs_used || {};
    const assumptionValue = (key, fallback = '-') => {
      const fromInputs = inputs[key];
      const fromUsed = inputsUsed[key];
      const value = fromInputs ?? fromUsed ?? fallback;
      return typeof value === 'number' ? n(value, 4) : String(value ?? fallback);
    };
    const inputAssumptionRows = [
      ['Rooms', assumptionValue('rooms')],
      ['Occupancy (%)', assumptionValue('occupancy_percent')],
      ['Configuration', assumptionValue('configuration')],
      ['Financial year', assumptionValue('financial_year')],
      ['Analysis period (years)', assumptionValue('analysis_period_years')],
      ['Financial metric years', assumptionValue('financial_metric_years')],
      ['Discount rate', assumptionValue('discount_rate')],
      ['Escalation rate', assumptionValue('escalation_rate', assumptionValue('inflation_escalation_rate'))],
      ['Grid import tariff (LKR/kWh)', assumptionValue('grid_import_tariff_lkr_kwh')],
      ['Year-1 export tariff (LKR/kWh)', assumptionValue('year1_export_tariff_lkr_kwh', assumptionValue('grid_export_tariff_lkr_kwh'))],
      ['Electricity intensity (kWh/room/day)', assumptionValue('electricity_intensity_kwh_room_day')],
      ['Cooling share', assumptionValue('cooling_share')],
      ['Existing electric chiller COP', assumptionValue('electric_chiller_cop')],
      ['Absorption chiller COP', assumptionValue('absorption_chiller_cop')],
      ['DHW demand (L/ORN)', assumptionValue('dhw_l_orn')],
      ['Cold water temperature (C)', assumptionValue('cold_water_temp_c')],
      ['Hot water temperature (C)', assumptionValue('hot_water_temp_c')],
      ['Hot water loss factor', assumptionValue('hot_water_loss_factor')],
      ['Laundry operation', assumptionValue('laundry_operation')],
      ['Existing boiler efficiency', assumptionValue('existing_boiler_efficiency')],
      ['Biomass boiler efficiency', assumptionValue('new_biomass_steam_generator_efficiency')],
      ['Steam enthalpy rise (kJ/kg)', assumptionValue('steam_enthalpy_rise_kj_kg')],
      ['Peak cooling sizing margin', assumptionValue('peak_cooling_sizing_margin')],
      ['Turbine yield (kWh/kg steam)', assumptionValue('extraction_turbine_specific_yield_kwh_kg')],
      ['Steam-to-turbine utilization', assumptionValue('steam_to_turbine_utilization_factor')],
      ['Heating coincidence factor', assumptionValue('heating_coincidence_factor')],
      ['Main chiller share', assumptionValue('main_chiller_share')],
      ['Selected biomass fuel', assumptionValue('selected_biomass_fuel')],
      ['Biomass cost (LKR/kg)', assumptionValue('selected_biomass_cost_lkr_kg', assumptionValue('selected_biomass_delivered_cost_lkr_kg'))],
      ['Biomass LHV (kWh/kg)', assumptionValue('selected_biomass_lhv_kwh_kg')],
      ['Biomass fuel cost (LKR/kWh)', assumptionValue('biomass_fuel_cost_lkr_kwh')],
      ['Chiller CAPEX (LKR/RT)', assumptionValue('absorption_chiller_specific_capex_lkr_rt')],
      ['Turbine CAPEX (LKR/kW)', assumptionValue('extraction_turbine_specific_capex_lkr_kw')],
      ['Steam generator CAPEX', assumptionValue('steam_generator_specific_capex_lkr_kg_h')],
      ['Grid interconnection CAPEX', assumptionValue('grid_interconnection_specific_capex_lkr_kw')],
      ['Installation factor', assumptionValue('installation_factor')],
      ['Engineering factor', assumptionValue('engineering_development_factor')],
      ['Contingency factor', assumptionValue('contingency_factor')],
      ['Fixed O&M rate', assumptionValue('fixed_om_rate_capex')],
      ['Variable turbine O&M', assumptionValue('variable_turbine_om_lkr_kwh')],
      ['Insurance/admin rate', assumptionValue('insurance_admin_rate_capex')],
      ['Major overhaul year', assumptionValue('major_overhaul_year')],
      ['Major overhaul fraction', assumptionValue('major_overhaul_fraction_capex')],
      ['Salvage value fraction', assumptionValue('salvage_value_fraction_capex')],
      ['Grid emission factor', assumptionValue('grid_emission_kgco2_kwh')],
      ['Biomass emission factor', assumptionValue('biomass_emission_kgco2_kwh_fuel')],
      ['Sustainable tourism premium scenario', sustainableScenario],
      ['Dispatch factor source', assumptionValue('dispatch_15min_factor_source')]
    ];

    if (String(sustainableScenario).toLowerCase() === 'yes') {
      inputAssumptionRows.push(
        ['Sustainable room rate (LKR/night)', assumptionValue('sustainable_room_rate_lkr')],
        ['Room price increase fraction', assumptionValue('sustainable_room_price_increase_fraction')]
      );
    }

    const visibleAssumptionRows = inputAssumptionRows.filter(([, value]) => {
      const text = String(value ?? '').trim();
      return text && text !== '-';
    });
    const pairedAssumptionRows = [];
    for (let i = 0; i < visibleAssumptionRows.length; i += 2) {
      const left = visibleAssumptionRows[i] || ['', ''];
      const right = visibleAssumptionRows[i + 1] || ['', ''];
      pairedAssumptionRows.push({ a: left[0], b: left[1], c: right[0], d: right[1] });
    }

    table(doc, pairedAssumptionRows, [
      { label: 'Assumption', get: (r) => r.a },
      { label: 'Value', get: (r) => r.b },
      { label: 'Assumption', get: (r) => r.c },
      { label: 'Value', get: (r) => r.d }
    ], {
      widths: [150, 105, 150, 105],
      rowH: 17,
      maxRows: 26
    });
    safeAddPage(doc)
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
        'Monthly Electricity, Cooling and Heating Demand'
      );
     
    
      table(doc, monthly, [
        { label: 'Month', get: (r) => r.month },
        { label: 'Electricity (kWh)', get: (r) => money(r.hotel_electricity_kwh) },
        { label: 'Cooling (kWh)', get: (r) => money(r.cooling_thermal_kwh) },
        { label: 'Heating (kWhth)', get: (r) => money(r.heating_thermal_kwh) }
      ], {
        widths: [65, 145, 150, 150],
        maxRows: 13
      });
    }
    safeAddPage(doc);
    section(doc, '4. Technical Design');
    const design = result.step02_technical_design || {};
    const configurationImage = path.join(__dirname, '..', '..', 'assets', 'configuration-01.png');

    ensureSpace(doc, 340);
    doc
      .font('Helvetica-Bold')
      .fontSize(10.5)
      .fillColor('#16212c')
      .text('System configuration', 42, doc.y, {
        width: 510
      });
    doc.moveDown(0.6);

    if (fs.existsSync(configurationImage)) {
      doc.image(configurationImage, 42, doc.y, {
        fit: [510, 300],
        align: 'center'
      });
      doc.y += 308;
    } else {
      doc.roundedRect(42, doc.y, 510, 120, 8).fillAndStroke('#f8fbfd', '#dbe7ef');
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#667085')
        .text('Configuration image not available.', 58, doc.y + 48, {
          width: 478,
          align: 'center'
        });
      doc.y += 132;
    }

    reportParagraph(
      doc,
      'The proposed configuration consists of a biomass-fired boiler, extraction-condensing steam turbine, electrical generator, absorption chiller, domestic hot water heat exchanger, condenser, and feedwater return loop. The system is designed to supply electricity, cooling, and useful thermal energy from a single biomass fuel input.',
      { size: 8.9, color: '#405363', height: 50 }
    );

    table(doc, [
      ['1', 'Biomass-fired boiler / steam generator', sizing.boiler_tph, 'ton/hr'],
      ['2', 'High-pressure steam line', design.selected_turbine_inlet_steam_flow_kg_h, 'kg/h'],
      ['3', 'Extraction-condensing steam turbine', sizing.turbine_kw, 'kW'],
      ['4', 'Electric generator output', sizing.turbine_kw, 'kW'],
      ['5a', 'Absorption chiller generator', dualChillerRt, 'RT'],
      ['5b', 'DHW heat exchanger', sizing.heat_exchanger_kw, 'kW']
    ].map(([a, b, c, d]) => ({ a, b, c, d })), [
      { label: 'No.', get: (r) => r.a },
      { label: 'Configuration component', get: (r) => r.b },
      { label: 'Value', get: (r) => typeof r.c === 'number' ? n(r.c, 2) : (r.c ?? 'N/A') },
      { label: 'Unit', get: (r) => r.d }
    ], {
      widths: [48, 272, 105, 85],
      maxRows: 8
    });

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

      barChart(doc, 42, yMonthly, 245, 145, monthly, 'month', 'export_revenue_lkr', 'Monthly Export Revenue', '#14a879');
      barChart(doc, 310, yMonthly, 245, 145, monthly, 'month', 'import_cost_lkr', 'Monthly Grid Import Cost', '#f04438');

      doc.y = yMonthly + 180;

      table(doc, monthly, [
        { label: 'Month', get: (r) => r.month },
        { label: 'Electricity (kWh)', get: (r) => money(r.hotel_electricity_kwh) },
        { label: 'Cooling (kWh)', get: (r) => money(r.cooling_thermal_kwh) },
        { label: 'Heating (kWhth)', get: (r) => money(r.heating_thermal_kwh) },
        { label: 'Export (kWh)', get: (r) => money(r.grid_export_kwh) },
        { label: 'Export revenue', get: (r) => moneyShort(r.export_revenue_lkr) }
      ], {
        widths: [45, 95, 90, 90, 85, 105],
        maxRows: 13
      });
    }
    safeAddPage(doc)
    section(doc, '6. Financial Feasibility');

    table(doc, Object.entries(financial).map(([k, v]) => ({ k, v })), [
      { label: 'Financial metric', get: (r) => formatMetricLabel(r.k) },
      { label: 'Value', get: (r) => formatMetricValue(r.k, r.v, 2) },
      { label: 'Unit', get: (r) => unitForMetric(r.k) || '-' }
    ], {
      widths: [270, 150, 90],
      maxRows: 26
    });

    const financialInterpretation = [
      reportNpv < 0
        ? `The financial results indicate that the project is financially weak under the current assumptions, with an NPV of ${moneyShort(reportNpv)}.`
        : `The financial results indicate that the project is financially acceptable under the current assumptions, with an NPV of ${moneyShort(reportNpv)}.`,
      `The annual net benefit is estimated as ${moneyShort(reportAnnualNetBenefit)}, compared with a net initial investment of ${moneyShort(reportCapex)}.`,
      reportPayback > 15
        ? `The simple payback period of ${n(reportPayback, 2)} years is long and indicates sensitivity to capital cost, biomass fuel cost, and tariff assumptions.`
        : `The simple payback period is ${n(reportPayback, 2)} years under the selected tariff and cost assumptions.`,
      reportExportRevenue > Math.abs(reportAnnualNetBenefit) * 0.2
        ? `Year 1 grid export revenue of ${moneyShort(reportExportRevenue)} provides a meaningful improvement to project cash flow.`
        : '',
      reportBiomassCost > 0 && reportBiomassCost > Math.abs(reportAnnualNetBenefit) * 0.5
        ? `The annual biomass fuel cost of ${moneyShort(reportBiomassCost)} is a major operating-cost driver and should be confirmed using supplier quotations and fuel logistics assessment.`
        : ''
    ].filter(Boolean).join(' ');
    reportParagraph(doc, financialInterpretation);
    safeAddPage(doc)
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
        'Cumulative Discounted Cash Flow over Project Lifetime',
        '#b42318'
      );

      table(doc, filtered, [
        { label: 'Year', get: (r) => r.year_index },
        { label: 'Export tariff (LKR/kWh)', get: (r) => n(r.export_tariff_lkr_kwh, 2) },
        { label: 'Benefits (LKR)', get: (r) => moneyShort(r.total_project_benefits_lkr) },
        { label: 'Net CF (LKR)', get: (r) => moneyShort(r.net_cash_flow_lkr) },
        { label: 'Cum. DCF (LKR)', get: (r) => moneyShort(r.cumulative_discounted_cash_flow_lkr) }
      ], {
        widths: [50, 90, 125, 120, 125],
        maxRows: 26
      });

      const lastCashFlow = filtered[filtered.length - 1] || {};
      const finalDcf = Number(lastCashFlow.cumulative_discounted_cash_flow_lkr || 0);
      reportParagraph(
        doc,
        finalDcf < 0
          ? `The cumulative discounted cash flow remains negative at the end of the ${filtered.length}-year period, indicating that the project does not fully recover the initial investment under the selected discounting assumptions.`
          : `The cumulative discounted cash flow becomes positive by the end of the analysed period, indicating that discounted investment recovery is achieved under the selected assumptions.`
      );
    }

    section(doc, '8. Emission Reduction');

    // Get emission values safely
    const baselineEmissionKg = Number.isFinite(Number(emissions.baseline_total_emissions_kgco2_y))
      ? Number(emissions.baseline_total_emissions_kgco2_y)
      : null;
    const projectEmissionKg = Number.isFinite(Number(emissions.proposed_net_emissions_kgco2_y))
      ? Number(emissions.proposed_net_emissions_kgco2_y)
      : null;
    const co2ReductionKg = Number.isFinite(Number(emissions.annual_ghg_reduction_kgco2_y))
      ? Number(emissions.annual_ghg_reduction_kgco2_y)
      : null;

    const baselineEmission = baselineEmissionKg !== null
      ? baselineEmissionKg / 1000
      : Number(emissions.baseline_tonnes_year || 0) ||
        Number(emissions.baseline_emission_tonnes_year || 0) ||
        Number(emissions.current_emission_tonnes_year || 0) ||
        0;
    
    const projectEmission = projectEmissionKg !== null
      ? projectEmissionKg / 1000
      : Number(emissions.project_tonnes_year || 0) ||
        Number(emissions.project_emission_tonnes_year || 0) ||
        Number(emissions.new_system_emission_tonnes_year || 0) ||
        0;
    
    const co2Reduction = co2ReductionKg !== null
      ? co2ReductionKg / 1000
      : Number(emissions.co2_reduction_tonnes_year || 0) ||
        Number(emissions.co2_reduction_ton || 0) ||
        baselineEmission - projectEmission;
    
    // Emission graph data
    const emissionGraphRows = [
      {
        item: 'Baseline total',
        value: baselineEmissionKg !== null ? baselineEmissionKg : baselineEmission * 1000
      },
      {
        item: 'Project net',
        value: projectEmissionKg !== null ? projectEmissionKg : projectEmission * 1000
      },
      {
        item: 'GHG reduction',
        value: co2ReductionKg !== null ? co2ReductionKg : co2Reduction * 1000
      }
    ];
    
    // Add graph
    doc.y = signedBarChart(
      doc,
      42,
      doc.y + 18,
      510,
      150,
      emissionGraphRows,
      'item',
      'value',
      'Annual Emission Comparison (kgCO2/year)',
      '#6941c6'
    );
    
    // Add emission table
    table(doc, Object.entries(emissions).map(([k, v]) => ({ k, v })), [
      { label: 'Emission item', get: (r) => formatMetricLabel(r.k) },
      { label: 'Value', get: (r) => formatMetricValue(r.k, r.v, 2) },
      { label: 'Unit', get: (r) => unitForMetric(r.k) || 'tCO2/year' }
    ], {
      widths: [285, 145, 80],
      maxRows: 12
    });

    const emissionReductionPercent = baselineEmission > 0 ? (co2Reduction / baselineEmission) * 100 : 0;
    const exportCredit = Number(emissions.export_displacement_credit_tonnes_year || emissions.export_credit_tonnes_year || 0);
    const emissionInterpretation = [
      `The baseline emissions are estimated at ${n(baselineEmission, 2)} tCO2/year, while the project net emissions are estimated at ${n(projectEmission, 2)} tCO2/year.`,
      co2Reduction > 0
        ? `This gives an estimated CO2 reduction of ${n(co2Reduction, 2)} tCO2/year.`
        : 'The current saved result does not show a positive emission reduction, so the emission factors and dispatch assumptions should be reviewed.',
      projectEmission < 0 || emissionReductionPercent > 100
        ? 'The negative project net emissions or reduction above 100% occurs because exported electricity is treated as a grid-displacement credit. This should be interpreted as a model-based displacement benefit rather than direct on-site negative emissions.'
        : '',
      exportCredit > 0 ? `The grid export displacement credit is ${n(exportCredit, 2)} tCO2/year and has a significant influence on the net emission result.` : ''
    ].filter(Boolean).join(' ');
    reportParagraph(doc, emissionInterpretation);
    safeAddPage(doc)
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
        'Sensitivity of Simple Payback Period',
        '#f79009'
      );

      table(doc, sensitivity, [
        { label: 'Scenario', get: (r) => r.scenario },
        { label: 'Savings (LKR/year)', get: (r) => moneyShort(r.adjusted_year1_net_project_savings_lkr) },
        { label: 'NPV (LKR)', get: (r) => moneyShort(r.adjusted_npv_lkr) },
        { label: 'Payback (years)', get: (r) => n(r.adjusted_simple_payback_years, 2) }
      ], {
        widths: [150, 130, 130, 100],
        maxRows: 12
      });

      const byNpv = sensitivity
        .filter((r) => Number.isFinite(Number(r.adjusted_npv_lkr)))
        .sort((a, b) => Number(b.adjusted_npv_lkr) - Number(a.adjusted_npv_lkr));
      const byPayback = sensitivity
        .filter((r) => Number.isFinite(Number(r.adjusted_simple_payback_years)))
        .sort((a, b) => Number(a.adjusted_simple_payback_years) - Number(b.adjusted_simple_payback_years));
      const best = byNpv[0] || byPayback[0];
      const worst = byNpv[byNpv.length - 1] || byPayback[byPayback.length - 1];
      const scenarioNames = sensitivity.map((r) => String(r.scenario || '').toLowerCase()).join(' ');
      const drivers = [
        scenarioNames.includes('capex') ? 'CAPEX' : '',
        scenarioNames.includes('grid') || scenarioNames.includes('tariff') ? 'grid electricity tariff' : '',
        scenarioNames.includes('biomass') || scenarioNames.includes('fuel') ? 'biomass fuel cost' : '',
        scenarioNames.includes('export') ? 'export tariff' : ''
      ].filter(Boolean);
      reportParagraph(
        doc,
        [
          best ? `The best sensitivity case is "${best.scenario}", with an adjusted NPV of ${moneyShort(best.adjusted_npv_lkr)} and payback of ${n(best.adjusted_simple_payback_years, 2)} years.` : '',
          worst ? `The weakest case is "${worst.scenario}", with an adjusted NPV of ${moneyShort(worst.adjusted_npv_lkr)} and payback of ${n(worst.adjusted_simple_payback_years, 2)} years.` : '',
          drivers.length
            ? `The sensitivity results indicate that project feasibility is strongly influenced by ${drivers.join(', ')}. Improved tariff savings or reduced biomass cost can reduce the payback period, while higher fuel cost or reduced grid-tariff savings weakens the financial performance.`
            : 'The sensitivity results should be reviewed to identify the input assumptions that most strongly affect NPV and payback period.'
        ].filter(Boolean).join(' ')
      );
    }
    safeAddPage(doc);
    section(doc, '10. Design Analysis & Validation');

   
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#16212c')
      .text('15-Minute CCHP Dispatch Validation');

    doc.moveDown(0.35);

    const dispatchValidationRows = buildReportDispatchRows(clusterDispatch, result);

    if (dispatchValidationRows.length) {
      doc
        .font('Helvetica')
        .fontSize(8.8)
        .fillColor('#667085')
        .text(
          'The following 15-minute profiles use the selected cluster factors and the current system design turbine capacity. Grid interaction, voltage and frequency are recalculated from the simulated dispatch.',
          { width: 510, align: 'justify' }
        );

      doc.moveDown(0.9);

      const chartW = 245;
      const chartH = 112;
      const leftX = 42;
      const rightX = 307;
      let chartY = doc.y + 14;

      compactDispatchChart(doc, leftX, chartY, chartW, chartH, dispatchValidationRows, '15-Minute Hotel Electric Load Profile', [
        { key: 'hotel_electric_kw', label: 'Hotel electric', color: '#0b74b8' }
      ]);
      compactDispatchChart(doc, rightX, chartY, chartW, chartH, dispatchValidationRows, '15-Minute Turbine Output Profile', [
        { key: 'turbine_output_kw', label: 'Turbine output', color: '#6941c6' }
      ]);

      chartY += chartH + 42;
      compactDispatchChart(doc, leftX, chartY, chartW, chartH, dispatchValidationRows, '15-Minute Cooling Thermal Load Profile', [
        { key: 'cooling_thermal_kw', label: 'Cooling thermal', color: '#14a879' }
      ]);
      compactDispatchChart(doc, rightX, chartY, chartW, chartH, dispatchValidationRows, 'Generator Voltage Response', [
        { key: 'voltage_output_v', label: 'Voltage', color: '#f79009' }
      ]);

      chartY += chartH + 42;
      compactDispatchChart(doc, leftX, chartY, chartW, chartH, dispatchValidationRows, 'Generator Frequency Response', [
        { key: 'frequency_hz', label: 'Frequency', color: '#b42318' }
      ]);
      doc.y = compactDispatchChart(doc, rightX, chartY, chartW, chartH, dispatchValidationRows, 'Grid Import and Export Profile', [
        { key: 'grid_import_kw', label: 'Grid import', color: '#0b74b8' },
        { key: 'grid_export_kw', label: 'Grid export', color: '#14a879' }
      ]);

      const maxHotelLoad = Math.max(...dispatchValidationRows.map((r) => Number(r.hotel_electric_kw || 0)));
      const maxTurbineOutput = Math.max(...dispatchValidationRows.map((r) => Number(r.turbine_output_kw || 0)));
      const maxExport = Math.max(...dispatchValidationRows.map((r) => Number(r.grid_export_kw || 0)));
      const minVoltage = Math.min(...dispatchValidationRows.map((r) => Number(r.voltage_output_v || 0)));
      const minFrequency = Math.min(...dispatchValidationRows.map((r) => Number(r.frequency_hz || 0)));
      reportParagraph(
        doc,
        [
          `The 15-minute dispatch profiles show the interaction between hotel demand, turbine generation, cooling demand, and grid exchange. The peak hotel load is ${n(maxHotelLoad, 2)} kW and the designed turbine output reaches ${n(maxTurbineOutput, 2)} kW.`,
          maxExport > 0 ? `During periods where turbine output exceeds hotel demand, the model indicates grid export up to ${n(maxExport, 2)} kW.` : 'The simulated profile does not indicate significant grid export during the sampled dispatch period.',
          minVoltage < 380 || minFrequency < 49.5
            ? `The minimum simulated voltage is ${n(minVoltage, 2)} V and the minimum frequency is ${n(minFrequency, 3)} Hz; further generator-control and grid-interconnection validation is required.`
            : `The simulated voltage and frequency remain within the assumed operating range, with minimum voltage of ${n(minVoltage, 2)} V and minimum frequency of ${n(minFrequency, 3)} Hz.`,
          'Detailed dynamic validation using MATLAB/Simulink or PSCAD is recommended before practical implementation.'
        ].join(' ')
      );
    } else {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#667085')
        .text('No 15-minute dispatch factors are available for the selected cluster.');

      doc.moveDown(0.8);
    }

    
    safeAddPage(doc);
    section(doc, '11. Feasibility Status and Decision Summary');

    const reportAnalysisPeriod = Number(inputs.analysis_period_years || result.inputs_used?.analysis_period_years || 0);
    const reportMonthlyBiomassTonnes = Number(fuel.monthly_average_biomass_tonnes || 0);
    const fallbackFeasibilityRows = {
      npv_status: reportNpv > 0 ? 'PASS' : 'FAIL',
      irr_status: reportIrr > 0 ? 'PASS' : 'FAIL',
      simple_payback_status: reportPayback > 0 && (!reportAnalysisPeriod || reportPayback <= reportAnalysisPeriod) ? 'PASS' : 'FAIL',
      discounted_payback_status: reportDiscountedPayback > 0 && (!reportAnalysisPeriod || reportDiscountedPayback <= reportAnalysisPeriod) ? 'PASS' : 'FAIL',
      biomass_benchmark_status: reportMonthlyBiomassTonnes > 0 && reportMonthlyBiomassTonnes <= 1500 ? 'PASS' : 'FAIL'
    };
    const finalFeasibilityDecision =
      feasibility.final_decision ||
      (Object.values(fallbackFeasibilityRows).every((status) => status === 'PASS') ? 'FEASIBLE' : 'NOT FEASIBLE');
    const feasibilityRows = [
      {
        item: 'NPV status',
        value: feasibility.npv_status || fallbackFeasibilityRows.npv_status,
        benchmark: feasibility.npv_benchmark || 'NPV > 0',
        note: moneyShort(reportNpv)
      },
      {
        item: 'IRR status',
        value: feasibility.irr_status || fallbackFeasibilityRows.irr_status,
        benchmark: feasibility.irr_benchmark || 'IRR > 0',
        note: `${n(reportIrr, 2)}%`
      },
      {
        item: 'Simple payback status',
        value: feasibility.simple_payback_status || fallbackFeasibilityRows.simple_payback_status,
        benchmark: feasibility.simple_payback_benchmark || '<= analysis period',
        note: `${n(reportPayback, 2)} years`
      },
      {
        item: 'Discounted payback status',
        value: feasibility.discounted_payback_status || fallbackFeasibilityRows.discounted_payback_status,
        benchmark: feasibility.discounted_payback_benchmark || '<= analysis period',
        note: reportDiscountedPayback ? `${n(reportDiscountedPayback, 2)} years` : 'N/A'
      },
      {
        item: 'Biomass benchmark status',
        value: feasibility.biomass_benchmark_status || fallbackFeasibilityRows.biomass_benchmark_status,
        benchmark: feasibility.biomass_benchmark || '<= 1500 t/mo',
        note: reportMonthlyBiomassTonnes ? `${n(reportMonthlyBiomassTonnes, 2)} t/mo` : 'N/A'
      },
      {
        item: 'Final decision',
        value: finalFeasibilityDecision,
        benchmark: 'All checks PASS',
        note: 'Overall screening result.'
      }
    ];

    table(doc, feasibilityRows, [
      { label: 'Feasibility decision', get: (r) => r.item },
      { label: 'Value', get: (r) => r.value },
      { label: 'Benchmark', get: (r) => r.benchmark },
      { label: 'Source / note', get: (r) => r.note }
    ], {
      widths: [145, 85, 115, 165],
      rowH: 26,
      maxRows: 8
    });

    const failedChecks = feasibilityRows
      .filter((row) => row.value === 'FAIL')
      .map((row) => row.item.replace(' status', '').toLowerCase());
    const feasibilityConclusion = finalFeasibilityDecision === 'FEASIBLE'
      ? 'Conclusion: The project satisfies the selected screening criteria. The NPV, IRR, payback indicators and biomass supply benchmark support proceeding to detailed engineering, supplier quotation, and implementation-level validation.'
      : `Conclusion: The project is not fully feasible under the selected screening criteria${failedChecks.length ? ` because the ${failedChecks.join(', ')} check${failedChecks.length > 1 ? 's' : ''} did not pass` : ''}. The case should be improved through CAPEX optimisation, tariff review, biomass supply confirmation, or operating-cost adjustment before implementation approval.`;

    reportParagraph(doc, feasibilityConclusion, { height: 58, bold: true });

    reportParagraph(
      doc,
      `${feasibility.biomass_supply_note || 'Biomass use above 1500 t/mo is treated as not feasible for this study unless supply is contractually proven.'} The final feasibility status should therefore be interpreted as a preliminary screening result for decision support, not as final implementation approval.`,
      { height: 64 }
    );
    section(doc, '12. Methodology Notes');

    const methodologyNotes = [
      ['Energy Demand Assessment', 'The energy demand assessment is carried out using benchmark hotel energy intensities, selected cluster factors, and uploaded BMS or measured energy data where available. Annual electrical energy demand is estimated from the selected hotel cluster and number of rooms or obtained directly from uploaded measurements. Cooling demand is derived from existing chiller electricity consumption and chiller COP, while thermal demand is estimated from domestic hot water, laundry, and other process heat requirements.'],
      ['Technical Sizing Methodology', 'The technical design stage converts peak cooling demand into refrigeration tons and applies the selected sizing margin. Main and backup absorption chillers are selected from predefined candidate capacities to improve reliability and part-load flexibility. The extraction-condensing steam turbine is sized using available steam flow, process thermal demand, and the specific electric yield assumption.'],
      ['Financial Evaluation Methodology', 'The financial model follows a savings-driven project assessment method. Project benefits include avoided grid electricity cost, avoided conventional heating cost, and electricity export revenue. Project costs include biomass fuel consumption, fixed and variable operation and maintenance, insurance and administration, scheduled overhaul allowance, and capital investment.'],
      ['Export Tariff and Cash Flow Modelling', 'Electricity export revenue is modelled using a year-linked export tariff schedule. Year 1 applies the tariff corresponding to the selected financial year, while later cash-flow years apply the relevant tariff values for each year of the analysis period. Discounted cash flow indicators are calculated from the resulting annual project cash flows.'],
      ['Emissions Assessment', 'The emissions assessment compares baseline grid electricity and conventional thermal energy emissions with the project case. Biomass-related emissions, grid imports, and electricity export displacement credits are included in the net project emissions. CO2 reduction is therefore interpreted as a modelled avoided-emissions benefit.'],
      ['Decision-Support Application', 'The tool combines demand assessment, equipment sizing, financial evaluation, tariff-based export revenue modelling, and emissions assessment into a preliminary decision-support workflow for hotel-sector biomass CCHP feasibility screening.']
    ];

    methodologyNotes.forEach(([heading, text]) => {
      subsection(doc, heading);
      reportParagraph(doc, text, { height: 60 });
    });

    const notes = [
       'The proposed biomass-based CCHP feasibility tool was developed using an integrated technical, financial, and environmental assessment methodology. The calculation procedure follows the structure of the web-based model, where hotel energy demand is first segregated into electrical, cooling, and thermal energy requirements before sizing the CCHP system and evaluating its economic and environmental performance.',

  'The energy demand assessment is carried out using either benchmark-based hotel energy intensities or uploaded BMS/measured energy data. Annual electrical energy demand is estimated based on the selected hotel cluster and number of rooms, or directly obtained from uploaded measured data when available. Cooling demand is derived by separating the portion of electricity consumed by the existing vapour-compression chiller system and converting it into useful cooling demand using the existing chiller COP. Thermal demand is estimated by considering domestic hot water, laundry, and other process heat requirements relevant to hotel operation.',

  'The technical design stage determines the required capacity of the proposed biomass-based CCHP system. Peak cooling demand is converted into refrigeration tons and used to select suitable absorption chiller capacities. A dual-chiller configuration is considered, where the main and backup absorption chillers are selected from predefined candidate sizes to improve reliability and part-load flexibility. The extraction steam turbine is selected based on the required electrical output and available thermal demand.',

  'The financial evaluation follows a savings-driven project assessment approach. Project benefits include avoided grid electricity cost, avoided conventional thermal energy cost, and revenue from exported electricity. Project costs include biomass fuel consumption, operation and maintenance expenses, insurance cost, scheduled major overhaul allowance, and capital investment.',

  'Electricity export revenue is calculated using a year-linked export tariff structure. The first project year applies the tariff corresponding to the selected financial year, while subsequent cash-flow years apply the relevant tariff values from the applicable yearly tariff schedule. This allows the financial model to reflect tariff variation throughout the project lifetime.',

  'The environmental assessment evaluates the CO₂ reduction achieved by the proposed CCHP system. Baseline emissions are calculated from grid electricity consumption and conventional thermal energy supply. Project emissions are estimated by considering grid electricity imports and biomass-related emissions. Electricity exported to the grid is treated as a displacement credit, reducing the net emissions of the proposed system.',

  'Overall, the methodology provides a structured framework for evaluating the feasibility of biomass-based CCHP systems for hotel applications. By combining energy demand estimation, equipment sizing, financial analysis, tariff-based export revenue calculation, and emissions reduction assessment, the tool supports preliminary decision-making for sustainable hotel energy system planning.'
];
    
    [].forEach((m, i) => {
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
    // 13. Model Limitations and Assumptions
    // =========================
    
    section(doc, '13. Model Limitations and Assumptions');

    reportParagraph(
      doc,
      'The feasibility results are based on benchmark energy intensities, selected cluster factors, assumed biomass fuel properties, predefined equipment capacities, and tariff assumptions. The model is intended for preliminary feasibility assessment and should not be considered a final engineering design. Detailed site measurements, supplier quotations, fuel supply assessment, grid interconnection approval, detailed thermal system design, and dynamic validation using MATLAB/Simulink or PSCAD are required before implementation.',
      { size: 9.7, height: 88 }
    );

    // =========================
    // 14. Final Conclusion
    // =========================

    section(doc, '14. Final Conclusion');
    
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
    
    const conclusionFailedChecks = feasibilityRows
      .filter((row) => row.value === 'FAIL')
      .map((row) => row.item.replace(' status', '').toLowerCase());
    const conclusionPassedChecks = feasibilityRows
      .filter((row) => row.value === 'PASS')
      .map((row) => row.item.replace(' status', '').toLowerCase());

    let feasibilityText = 'The project should be reviewed through detailed engineering and commercial optimisation before implementation.';

    if (finalFeasibilityDecision === 'FEASIBLE') {
      feasibilityText = 'The project satisfies the feasibility screening criteria and is suitable for further implementation-level study.';
    } else if (conclusionNpv <= 0) {
      feasibilityText = 'Although the project generates positive annual savings, the negative NPV indicates that the project does not fully recover its investment on a discounted cash-flow basis under the current assumptions.';
    } else if (conclusionPayback > 10) {
      feasibilityText = 'The project shows positive long-term economic potential, although the payback period should be reviewed carefully during detailed feasibility assessment.';
    }
    
    // Conclusion paragraphs
    const conclusionParagraphs = [
      `Based on the saved simulation results, the proposed biomass-based trigeneration CCHP system for ${conclusionHotelName} in the ${conclusionLocation} cluster was evaluated using the web-based feasibility model. The model considered hotel electricity demand, cooling thermal demand, hot water and process heat demand, biomass fuel cost, grid tariff, export tariff, capital cost, operating cost, and emission reduction potential.`,
    
      `The estimated annual electricity demand is ${n(annualElectricityConclusion, 0)} kWh/year, while the annual cooling thermal demand is ${n(annualCoolingConclusion, 0)} kWh/year and the annual heating demand is ${n(annualHeatingConclusion, 0)} kWhth/year. According to the technical design output, the selected turbine capacity is approximately ${n(conclusionTurbine, 0)} kW and the dual absorption chiller capacity is approximately ${n(conclusionDualChiller, 0)} RT.`,
    
      `From the financial analysis, the calculated Net Present Value is ${moneyShort(conclusionNpv)}, the Internal Rate of Return is ${n(conclusionIrr, 2)}%, and the simple payback period is approximately ${n(conclusionPayback, 2)} years. ${feasibilityText}`,

      `From the feasibility assessment, the final screening decision is ${finalFeasibilityDecision}. ${conclusionPassedChecks.length ? `The project passes the ${conclusionPassedChecks.join(', ')} check${conclusionPassedChecks.length > 1 ? 's' : ''}. ` : ''}${conclusionFailedChecks.length ? `However, it fails the ${conclusionFailedChecks.join(', ')} check${conclusionFailedChecks.length > 1 ? 's' : ''}. Therefore, the project is not fully feasible under the current tariff, CAPEX, fuel cost, and operating-cost assumptions.` : 'All feasibility checks pass under the current assumptions.'}`,
    
      `From the environmental assessment, the system provides an estimated CO2 reduction of approximately ${n(conclusionCo2Reduction, 0)} tCO2/year. This reduction is achieved by replacing part of the conventional grid electricity and fossil-fuel-based heating demand with biomass-based combined cooling, heating and power generation.`,
    
      `Overall, the proposed biomass-based CCHP system demonstrates strong environmental potential and provides a structured pathway for reducing grid electricity dependence and conventional thermal energy use. ${finalFeasibilityDecision === 'FEASIBLE' ? 'The financial and feasibility results support proceeding to detailed implementation-level assessment.' : 'Based on the current financial and feasibility results, the project should be improved through CAPEX reduction, improved export tariff conditions, lower biomass fuel cost, grants or subsidies, or optimized system sizing before proceeding to implementation-level study.'} The tool supports preliminary decision-making; before actual implementation, supplier quotations, site-specific biomass availability, boiler and turbine selection, grid export approval, detailed PSCAD/MATLAB validation, and operational constraints should be verified.`
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
