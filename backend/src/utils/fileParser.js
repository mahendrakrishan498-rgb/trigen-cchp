const fs = require('fs');
const csv = require('csv-parser');
const XLSX = require('xlsx');

function normalizeKey(key) {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[()/%]/g, '')
    .replace(/[^a-z0-9_]/g, '');
}

function normalizeRow(row) {
  const out = {};
  Object.entries(row).forEach(([k, v]) => {
    out[normalizeKey(k)] = v;
  });
  return out;
}

function parseCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => rows.push(normalizeRow(data)))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function parseExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
  return raw.map(normalizeRow);
}

async function parseUploadedTable(filePath, originalName) {
  const ext = (originalName || '').toLowerCase().split('.').pop();
  if (ext === 'csv') return parseCsv(filePath);
  if (ext === 'xlsx' || ext === 'xls') return parseExcel(filePath);
  throw new Error('Unsupported file type. Upload CSV, XLSX, or XLS.');
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : fallback;
}

function pick(row, names, fallback = '') {
  for (const n of names) {
    const k = normalizeKey(n);
    if (row[k] !== undefined && row[k] !== '') return row[k];
  }
  return fallback;
}

module.exports = { parseUploadedTable, toNumber, pick, normalizeKey };
