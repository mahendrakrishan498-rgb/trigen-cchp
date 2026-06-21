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
  return southWestDispatch15Min.map(([timeFraction, electricFactor, coolingFactor]) => ({
    time_fraction: Number(timeFraction || 0),
    time_hour: Number(timeFraction || 0) * 24,
    electric_factor: Number(electricFactor || 0) || 1,
    cooling_factor: Number(coolingFactor || 0) || 1
  }));
}

function southWestWorkbookExportTariffs() {
  return Array.from({ length: 32 }, (_, index) => ({
    year: 2026 + index,
    om: 0,
    fuel: 46.21,
    fixed: 0
  }));
}

function clusterColdWaterTemp(location) {
  if (/hill/i.test(location || '')) return 24;
  if (/airport|negombo|heritage|colombo/i.test(location || '')) return 28;
  if (isSouthWestLocation(location)) return 27.5;
  return null;
}

function withClusterWorkbookDefaults(inputs, project = {}) {
  const location = inputs.location || project.location || '';
  const coldWaterTemp = clusterColdWaterTemp(location);
  if (coldWaterTemp === null) return inputs;

  return {
    ...inputs,
    location,
    cold_water_temp_c: coldWaterTemp
  };
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
    cold_water_temp_c: 27.5,
    hot_water_temp_c: 55,
    hot_water_loss_factor: 0.25,
    laundry_operation: 'No',
    grid_import_tariff_lkr_kwh: 16.291666666666668,
    grid_export_tariff_lkr_kwh: 46.21,
    selected_biomass_fuel: 'Gliricidia',
    selected_biomass_delivered_cost_lkr_kg: 12,
    selected_biomass_lhv_kwh_kg: 4,
    electric_chiller_cop: 5,
    absorption_chiller_cop: 0.7,
    existing_boiler_efficiency: 0.8,
    new_biomass_steam_generator_efficiency: 0.85,
    steam_enthalpy_rise_kj_kg: 2100,
    turbine_steam_operating_hours_y: 8760,
    grid_exchange_method: 'profile',
    workbook_turbine_kw_per_room: 0,
    workbook_chiller_rt_per_room: 0,
    financial_year: 2027,
    analysis_period_years: 20,
    financial_metric_years: 20,
    inflation_escalation_rate: 0.025,
    absorption_chiller_specific_capex_lkr_rt: 220000,
    extraction_turbine_specific_capex_lkr_kw: 300000,
    steam_generator_specific_capex_lkr_kg_h: 18000,
    cooling_integration_specific_capex_lkr_rt: 40000,
    grid_interconnection_specific_capex_lkr_kw: 20000,
    fuel_handling_specific_capex_lkr_kw: 0,
    steam_condensate_piping_factor: 0,
    water_treatment_condensate_factor: 0,
    chw_cw_piping_factor: 0,
    stack_flue_gas_specific_capex_lkr_kw: 0,
    electrical_instrumentation_factor: 0,
    civil_structural_factor: 0,
    direct_capex_tax_factor: 1,
    installation_factor: 0.18,
    engineering_development_factor: 0.08,
    contingency_factor: 0.10,
    fixed_om_rate_capex: 0.03,
    variable_turbine_om_lkr_kwh: 0.3,
    insurance_admin_rate_capex: 0.005,
    major_overhaul_year: 10,
    major_overhaul_fraction_capex: 0.1,
    salvage_value_fraction_capex: 0.1,
    export_tariff_schedule: southWestWorkbookExportTariffs(),
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
    const inputs = withWorkbookDefaults(withClusterWorkbookDefaults(project.inputs, project), project);
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
