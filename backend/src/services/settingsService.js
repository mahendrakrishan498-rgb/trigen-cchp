const pool = require('../db');
const { EXPORT_TARIFFS } = require('../calcEngine');

async function getSettingsMap() {
  const [rows] = await pool.query('SELECT setting_key, setting_value FROM assumption_settings');
  const settings = {};
  rows.forEach((r) => {
    const num = Number(r.setting_value);
    settings[r.setting_key] = Number.isFinite(num) ? num : r.setting_value;
  });
  return settings;
}

async function getEquipmentRows() {
  const [rows] = await pool.query('SELECT * FROM equipment_quotations ORDER BY room_capacity, item_name');
  return rows;
}

async function getExportTariffs() {
  try {
    const [rows] = await pool.query('SELECT year, om_tariff_lkr_kwh AS om, fuel_tariff_lkr_kwh AS fuel, fixed_tariff_lkr_kwh AS fixed FROM export_tariffs ORDER BY year');
    return rows.length ? rows.map((r) => ({ year:Number(r.year), om:Number(r.om), fuel:Number(r.fuel), fixed:Number(r.fixed) })) : EXPORT_TARIFFS;
  } catch {
    return EXPORT_TARIFFS;
  }
}

async function getLatestBmsSummary(projectId, userId) {
  if (!projectId || !userId) return null;
  const [rows] = await pool.query('SELECT summary_json FROM bms_uploads WHERE project_id=? AND user_id=? ORDER BY uploaded_at DESC LIMIT 1', [projectId, userId]);
  if (!rows[0]) return null;
  try { return JSON.parse(rows[0].summary_json || '{}'); } catch { return null; }
}

module.exports = { getSettingsMap, getEquipmentRows, getExportTariffs, getLatestBmsSummary };
