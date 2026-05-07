const express = require('express');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { calculate } = require('../calcEngine');
const { getSettingsMap, getEquipmentRows, getExportTariffs, getLatestBmsSummary } = require('../services/settingsService');
const southWestDispatch15Min = require('../data/southWestDispatch15Min');

const router = express.Router();
router.use(authRequired);

function parseJson(value, fallback) {
  try { return typeof value === 'string' ? JSON.parse(value) : value || fallback; } catch { return fallback; }
}

function isSouthWestLocation(location) {
  return /south|south-west|south\/south-west|south coast/i.test(location || '');
}

function southWestDispatchFactors() {
  const averageElectricKw = southWestDispatch15Min.reduce((sum, row) => sum + Number(row[1] || 0), 0) / southWestDispatch15Min.length;
  const averageCoolingKw = southWestDispatch15Min.reduce((sum, row) => sum + Number(row[2] || 0), 0) / southWestDispatch15Min.length;

  return southWestDispatch15Min.map(([timeFraction, hotelElectricKw, coolingThermalKw]) => ({
    time_fraction: Number(timeFraction || 0),
    time_hour: Number(timeFraction || 0) * 24,
    electric_factor: averageElectricKw > 0 ? Number(hotelElectricKw || 0) / averageElectricKw : 1,
    cooling_factor: averageCoolingKw > 0 ? Number(coolingThermalKw || 0) / averageCoolingKw : 1
  }));
}

function withWorkbookDefaults(inputs, project = {}) {
  const location = inputs.location || project.location || '';
  if (!isSouthWestLocation(location)) return inputs;

  return {
    ...inputs,
    location,
    occupancy_percent: 92,
    electricity_intensity_kwh_room_day: 50,
    cooling_share: 0.591470459820233,
    dhw_l_orn: 308,
    laundry_operation: 'Yes',
    grid_import_tariff_lkr_kwh: 16.291666666666668,
    selected_biomass_fuel: 'Gliricidia',
    selected_biomass_delivered_cost_lkr_kg: 12,
    selected_biomass_lhv_kwh_kg: 4,
    financial_metric_years: 20,
    dispatch_15min_profile: southWestDispatchFactors()
  };
}

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, title, hotel_name, location, created_at, updated_at FROM projects WHERE user_id=? ORDER BY updated_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM projects WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Project not found' });
    const project = rows[0];
    project.inputs = parseJson(project.inputs_json, {});
    const settings = await getSettingsMap();
    const equipment = await getEquipmentRows();
    const tariffs = await getExportTariffs();
    const inputs = withWorkbookDefaults(project.inputs, project);
    const bms = await getLatestBmsSummary(project.id, req.user.id);
    project.inputs = inputs;
    project.result = calculate(inputs, settings, equipment, tariffs, bms);
    delete project.inputs_json;
    delete project.result_json;
    res.json(project);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM projects WHERE id=? AND user_id=?', [req.params.id, req.user.id]);
    res.json({ message: 'Project deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
