const pool = require('../db');
const { parseUploadedTable, pick, toNumber, normalizeKey } = require('../utils/fileParser');
const southWestDispatch15Min = require('../data/southWestDispatch15Min');

const REQUIRED_COLUMNS = [
  ['time_fraction', 'Time Fraction (-)'],
  ['hotel_electric_kw', 'Hotel Electric (kW)'],
  ['cooling_thermal_kw', 'Cooling Thermal (kW_cool)']
];

const FACTOR_COLUMNS = [
  ['time_fraction', 'Time Fraction (-)'],
  ['hotel_electric_factor', 'Hotel Electric factor'],
  ['cooling_thermal_factor', 'Cooling Thermal factor']
];

async function ensureClusterDispatch15MinTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cluster_dispatch_15min (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      cluster_id INT NOT NULL,
      interval_index INT NOT NULL,
      time_fraction DECIMAL(18,8),
      time_hour DECIMAL(10,4),
      hotel_electric_factor DECIMAL(18,8),
      cooling_thermal_factor DECIMAL(18,8),
      hotel_electric_kw DECIMAL(18,4),
      cooling_thermal_kw DECIMAL(18,4),
      turbine_output_kw DECIMAL(18,4),
      grid_import_kw DECIMAL(18,4),
      grid_export_kw DECIMAL(18,4),
      voltage_output_v DECIMAL(10,4),
      frequency_hz DECIMAL(10,4),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cluster_dispatch_interval (cluster_id, interval_index),
      INDEX idx_cluster_dispatch_cluster (cluster_id),
      CONSTRAINT fk_cluster_dispatch_cluster
        FOREIGN KEY (cluster_id) REFERENCES cluster_defaults(id) ON DELETE CASCADE
    )
  `);

  await ensureDispatchColumn('hotel_electric_factor', 'DECIMAL(18,8) NULL');
  await ensureDispatchColumn('cooling_thermal_factor', 'DECIMAL(18,8) NULL');
  await seedSouthWestDispatch15Min();
}

async function ensureDispatchColumn(columnName, definition) {
  const dbName = process.env.DB_NAME || 'trigen_cchp';
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'cluster_dispatch_15min' AND COLUMN_NAME = ?`,
    [dbName, columnName]
  );
  if (!rows.length) {
    await pool.query(`ALTER TABLE cluster_dispatch_15min ADD COLUMN ${columnName} ${definition}`);
  }
}

function rowHasColumns(row, columns) {
  return columns.every(([key, label]) => Object.prototype.hasOwnProperty.call(row, key) || Object.prototype.hasOwnProperty.call(row, normalizeKey(label)));
}

function validateDispatchRows(rows) {
  if (!rows.length) {
    const err = new Error('Uploaded dispatch file has no data rows.');
    err.status = 400;
    throw err;
  }

  if (!rowHasColumns(rows[0], REQUIRED_COLUMNS) && !rowHasColumns(rows[0], FACTOR_COLUMNS)) {
    const kwNames = REQUIRED_COLUMNS.map(([, label]) => label).join(', ');
    const factorNames = FACTOR_COLUMNS.map(([, label]) => label).join(', ');
    const err = new Error(`Missing required dispatch columns. Use either kW columns (${kwNames}) or factor columns (${factorNames}).`);
    err.status = 400;
    throw err;
  }
}

function round(value, digits = 4) {
  const m = 10 ** digits;
  return Math.round(Number(value || 0) * m) / m;
}

function buildDispatchRows(rawRows) {
  const averageElectricKw = rawRows.reduce((sum, row) => sum + Number(row.hotel_electric_kw || 0), 0) / Math.max(rawRows.length, 1);
  const averageCoolingKw = rawRows.reduce((sum, row) => sum + Number(row.cooling_thermal_kw || 0), 0) / Math.max(rawRows.length, 1);
  const turbineOutputs = rawRows
    .map((row) => Number(row.turbine_output_kw || 0))
    .filter((value) => value > 0);
  const ratedPowerKw = turbineOutputs.length ? Math.max(...turbineOutputs) : 800;

  return rawRows.map((row, index) => {
    const timeFraction = Number(row.time_fraction ?? index / 96);
    const hotelElectricFactor = Number(row.hotel_electric_factor || 0) || (averageElectricKw > 0 ? Number(row.hotel_electric_kw || 0) / averageElectricKw : 1);
    const coolingThermalFactor = Number(row.cooling_thermal_factor || 0) || (averageCoolingKw > 0 ? Number(row.cooling_thermal_kw || 0) / averageCoolingKw : 1);
    const hotelElectricKw = Number(row.hotel_electric_kw || 0);
    const coolingThermalKw = Number(row.cooling_thermal_kw || 0);
    const turbineOutputKw = Number(row.turbine_output_kw || 0);
    const gridImportKw = Number(row.grid_import_kw || 0);
    const gridExportKw = Number(row.grid_export_kw || 0);
    const loadFraction = ratedPowerKw > 0 ? hotelElectricKw / ratedPowerKw : 0;

    return {
      interval_index: index + 1,
      time_fraction: round(timeFraction, 8),
      time_hour: round(timeFraction * 24, 4),
      hotel_electric_factor: round(hotelElectricFactor, 8),
      cooling_thermal_factor: round(coolingThermalFactor, 8),
      hotel_electric_kw: round(hotelElectricKw, 4),
      cooling_thermal_kw: round(coolingThermalKw, 4),
      turbine_output_kw: round(turbineOutputKw, 4),
      grid_import_kw: round(gridImportKw, 4),
      grid_export_kw: round(gridExportKw, 4),
      voltage_output_v: round(Math.max(360, 400 * (1 - 0.04 * loadFraction)), 4),
      frequency_hz: round(Math.max(49, 50 * (1 - 0.02 * loadFraction)), 4)
    };
  });
}

async function parseDispatchUpload(file) {
  if (!file?.buffer) {
    const err = new Error('Upload a CSV, XLSX, or XLS file.');
    err.status = 400;
    throw err;
  }

  const rows = await parseUploadedTable(file.buffer, file.originalname);
  validateDispatchRows(rows);

  const firstRows = rows.slice(0, 96);
  const rawDispatchRows = firstRows.map((row, index) => ({
    time_fraction: toNumber(pick(row, ['time_fraction', 'Time Fraction (-)'], index / 96), index / 96),
    hotel_electric_factor: toNumber(pick(row, ['hotel_electric_factor', 'Hotel Electric factor'], 0), 0),
    cooling_thermal_factor: toNumber(pick(row, ['cooling_thermal_factor', 'Cooling Thermal factor'], 0), 0),
    hotel_electric_kw: toNumber(pick(row, ['hotel_electric_kw', 'Hotel Electric (kW)'], 0), 0),
    cooling_thermal_kw: toNumber(pick(row, ['cooling_thermal_kw', 'Cooling Thermal (kW_cool)'], 0), 0),
    turbine_output_kw: toNumber(pick(row, ['turbine_output_kw', 'Extraction Turbine Output (kW)'], 0), 0),
    grid_import_kw: toNumber(pick(row, ['grid_import_kw', 'Grid Import (kW)'], 0), 0),
    grid_export_kw: toNumber(pick(row, ['grid_export_kw', 'Grid Export (kW)'], 0), 0)
  }));
  const dispatchRows = buildDispatchRows(rawDispatchRows);

  const warnings = [];
  if (rows.length < 96) warnings.push(`Only ${rows.length} rows were uploaded. Expected 96 rows for one day.`);
  if (rows.length > 96) warnings.push(`Uploaded file had ${rows.length} rows. Only the first 96 rows were saved.`);

  return { rows: dispatchRows, warnings };
}

async function insertDispatchRows(conn, clusterId, rows) {
  if (!rows.length) return;
  const values = rows.map((row) => [
    clusterId,
    row.interval_index,
    row.time_fraction,
    row.time_hour,
    row.hotel_electric_factor,
    row.cooling_thermal_factor,
    row.hotel_electric_kw,
    row.cooling_thermal_kw,
    row.turbine_output_kw,
    row.grid_import_kw,
    row.grid_export_kw,
    row.voltage_output_v,
    row.frequency_hz
  ]);

  await conn.query(`
    INSERT INTO cluster_dispatch_15min
      (cluster_id, interval_index, time_fraction, time_hour, hotel_electric_factor,
       cooling_thermal_factor, hotel_electric_kw,
       cooling_thermal_kw, turbine_output_kw, grid_import_kw, grid_export_kw,
       voltage_output_v, frequency_hz)
    VALUES ?
  `, [values]);
}

async function replaceClusterDispatch15Min(clusterId, rows) {
  await ensureClusterDispatch15MinTable();

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM cluster_dispatch_15min WHERE cluster_id=?', [clusterId]);
    await insertDispatchRows(conn, clusterId, rows);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

function southWestSeedRows() {
  const rawRows = southWestDispatch15Min.map(([timeFraction, hotelElectricKw, coolingThermalKw, turbineOutputKw, gridImportKw, gridExportKw]) => ({
    time_fraction: timeFraction,
    hotel_electric_kw: hotelElectricKw,
    cooling_thermal_kw: coolingThermalKw,
    turbine_output_kw: turbineOutputKw,
    grid_import_kw: gridImportKw,
    grid_export_kw: gridExportKw
  }));
  return buildDispatchRows(rawRows);
}

async function seedSouthWestDispatch15Min() {
  const [clusters] = await pool.query(`
    SELECT id FROM cluster_defaults
    WHERE cluster_name IN ('South/South-West Coast', 'South Coast (Beach)')
    ORDER BY FIELD(cluster_name, 'South/South-West Coast', 'South Coast (Beach)')
    LIMIT 1
  `);
  if (!clusters.length) return;

  const clusterId = clusters[0].id;
  const [existing] = await pool.query('SELECT COUNT(*) AS count FROM cluster_dispatch_15min WHERE cluster_id=?', [clusterId]);
  if (Number(existing[0]?.count || 0) > 0) return;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await insertDispatchRows(conn, clusterId, southWestSeedRows());
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function getClusterDispatch15Min(clusterId) {
  await ensureClusterDispatch15MinTable();
  const [rows] = await pool.query(`
    SELECT
      id,
      cluster_id,
      interval_index,
      time_fraction,
      time_hour,
      hotel_electric_factor,
      cooling_thermal_factor,
      hotel_electric_kw,
      cooling_thermal_kw,
      turbine_output_kw,
      grid_import_kw,
      grid_export_kw,
      voltage_output_v,
      frequency_hz,
      created_at
    FROM cluster_dispatch_15min
    WHERE cluster_id = ?
    ORDER BY interval_index
  `, [clusterId]);
  return rows;
}

function dispatchTemplateCsv() {
  const header = FACTOR_COLUMNS.map(([, label]) => label);
  const rows = southWestSeedRows().map((row) => [
    row.time_fraction,
    row.hotel_electric_factor,
    row.cooling_thermal_factor
  ]);

  return [header, ...rows]
    .map((row) => row.join(','))
    .join('\n');
}

module.exports = {
  ensureClusterDispatch15MinTable,
  dispatchTemplateCsv,
  parseDispatchUpload,
  replaceClusterDispatch15Min,
  getClusterDispatch15Min
};
