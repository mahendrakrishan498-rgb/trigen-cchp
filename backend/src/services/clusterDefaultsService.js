const pool = require('../db');

const DEFAULT_MONTHLY_FACTORS = [1.42, 1.28, 1.03, 1.20, 0.94, 0.45, 0.64, 0.89, 0.78, 0.98, 1.06, 1.31];
const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

let schemaReady = false;

async function ensureClusterMonthlyFactorsColumn() {
  if (schemaReady) return;

  const dbName = process.env.DB_NAME || 'trigen_cchp';
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'cluster_defaults' AND COLUMN_NAME = 'monthly_factors_json'`,
    [dbName]
  );

  if (!columns.length) {
    await pool.query('ALTER TABLE cluster_defaults ADD COLUMN monthly_factors_json JSON NULL');
  }

  schemaReady = true;
}

function normalizeMonthlyFactors(value) {
  let raw = value;

  if (typeof raw === 'string' && raw.trim()) {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }

  if (!Array.isArray(raw)) raw = [];

  const factors = DEFAULT_MONTHLY_FACTORS.map((fallback, index) => {
    const n = Number(raw[index]);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  });

  return factors;
}

function rowWithMonthlyFactors(row) {
  return {
    ...row,
    monthly_factors: normalizeMonthlyFactors(row.monthly_factors_json)
  };
}

function monthlyFactorsJson(row) {
  const direct = normalizeMonthlyFactors(row.monthly_factors);
  const fromMonthKeys = MONTH_KEYS.map((key, index) => {
    const value = row[`monthly_factor_${key}`];
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : direct[index];
  });

  return JSON.stringify(fromMonthKeys);
}

function monthlyFactorTemplateColumns() {
  return MONTH_KEYS.map((key) => `monthly_factor_${key}`);
}

function monthlyFactorTemplateValues() {
  return DEFAULT_MONTHLY_FACTORS;
}

module.exports = {
  DEFAULT_MONTHLY_FACTORS,
  ensureClusterMonthlyFactorsColumn,
  monthlyFactorTemplateColumns,
  monthlyFactorTemplateValues,
  monthlyFactorsJson,
  normalizeMonthlyFactors,
  rowWithMonthlyFactors
};
