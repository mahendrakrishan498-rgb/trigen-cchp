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

function southWestWorkbookExportTariffs() {
  const totals = [
    45.82, 46.02, 46.21, 46.41, 46.61,
    46.82, 47.02, 47.22, 47.43, 47.64,
    47.85, 48.06, 48.27, 48.48, 48.69,
    48.91, 49.12, 49.34, 49.56, 49.78,
    50.00, 50.23
  ];

  return totals.map((total, index) => ({
    year: 2026 + index,
    om: 0,
    fuel: Number(total),
    fixed: 0
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
    grid_export_tariff_lkr_kwh: 46.019999999999996,
    selected_biomass_fuel: 'Gliricidia',
    selected_biomass_delivered_cost_lkr_kg: 12,
    selected_biomass_lhv_kwh_kg: 4,
    electric_chiller_cop: 5,
    absorption_chiller_cop: 0.7,
    existing_boiler_efficiency: 1,
    new_biomass_steam_generator_efficiency: 0.85,
    steam_enthalpy_rise_kj_kg: 2300,
    turbine_steam_operating_hours_y: 8000,
    workbook_turbine_kw_per_room: 1250 / 350,
    workbook_chiller_rt_per_room: 1000 / 350,
    financial_year: 2027,
    analysis_period_years: 20,
    financial_metric_years: 20,
    inflation_escalation_rate: 0.025,
    absorption_chiller_specific_capex_lkr_rt: 140000,
    extraction_turbine_specific_capex_lkr_kw: 60000,
    steam_generator_specific_capex_lkr_kg_h: 1000,
    cooling_integration_specific_capex_lkr_rt: 0,
    grid_interconnection_specific_capex_lkr_kw: 27000,
    fuel_handling_specific_capex_lkr_kw: 5664,
    steam_condensate_piping_factor: 0.06,
    water_treatment_condensate_factor: 0.04,
    chw_cw_piping_factor: 0.04,
    stack_flue_gas_specific_capex_lkr_kw: 1500,
    electrical_instrumentation_factor: 0.08,
    civil_structural_factor: 0.02,
    direct_capex_tax_factor: 1.35,
    installation_factor: 0.15,
    engineering_development_factor: 0.09,
    contingency_factor: 0.10,
    fixed_om_rate_capex: 0.03,
    variable_turbine_om_lkr_kwh: 0.3,
    insurance_admin_rate_capex: 0.005,
    major_overhaul_year: 7,
    major_overhaul_fraction_capex: 0.08,
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
