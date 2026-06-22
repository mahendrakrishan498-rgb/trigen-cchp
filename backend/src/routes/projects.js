const express = require('express');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { calculate, EXPORT_TARIFFS } = require('../calcEngine');
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
  return EXPORT_TARIFFS;
}

function southWestWorkbookMonthlyFactors() {
  return [
    1.39343592970298,
    1.38759480996878,
    1.01282093181775,
    1.21945187269608,
    0.916222508739332,
    0.453366009726108,
    0.631362923561298,
    0.871138062235122,
    0.792022548603994,
    0.956436813918152,
    1.07660749315029,
    1.2895400958801
  ];
}

function clusterWorkbookDefaults(location) {
  if (isSouthWestLocation(location)) {
    return {
      occupancy_percent: 71,
      electricity_intensity_kwh_room_day: 50,
      cooling_share: 0.591470459820233,
      cold_water_temp_c: 27.5,
      monthly_factors: southWestWorkbookMonthlyFactors(),
      laundry_operation: 'No',
      excel_shift_monthly_electricity: 'Yes'
    };
  }

  if (/airport|negombo/i.test(location || '')) {
    return {
      occupancy_percent: 64,
      electricity_intensity_kwh_room_day: 38.0452,
      cooling_share: 0.422655158,
      cold_water_temp_c: 28,
      excel_shift_monthly_electricity: 'No',
      laundry_operation: 'No',
      cooling_integration_specific_capex_lkr_rt: 0,
      monthly_factors: [
        1.360431, 1.410203, 1.289092, 0.909166, 0.501037, 0.525923,
        0.960597, 1.131481, 0.962256, 0.763169, 1.050187, 1.136458
      ]
    };
  }

  if (/heritage/i.test(location || '')) {
    return {
      occupancy_percent: 75,
      electricity_intensity_kwh_room_day: 23.96,
      cooling_share: 0.375626043405676,
      cold_water_temp_c: 28,
      excel_shift_monthly_electricity: 'No',
      laundry_operation: 'No',
      monthly_factors: [
        1.360431, 1.410203, 1.289092, 0.909166, 0.501037, 0.525923,
        0.960597, 1.131481, 0.962256, 0.763169, 1.050187, 1.136458
      ]
    };
  }

  if (/hill/i.test(location || '')) {
    return {
      occupancy_percent: 75,
      electricity_intensity_kwh_room_day: 51.0375,
      cooling_share: 0.648395787,
      cold_water_temp_c: 24,
      excel_shift_monthly_electricity: 'No',
      laundry_operation: 'Yes',
      laundry_diesel_available_l_room_day: 0.975296125,
      include_occupied_laundry_heat: 'Yes',
      laundry_heat_selection_mode: 'max',
      cooling_integration_specific_capex_lkr_rt: 0,
      monthly_factors: [
        1.189103, 1.181926, 1.234354, 1.129628, 0.760097, 0.716082,
        1.027152, 1.162474, 0.836348, 0.826928, 0.994606, 0.948546
      ]
    };
  }

  return null;
}

function clusterColdWaterTemp(location) {
  if (/hill/i.test(location || '')) return 24;
  if (/airport|negombo|heritage|colombo/i.test(location || '')) return 28;
  if (isSouthWestLocation(location)) return 27.5;
  return null;
}

function withClusterWorkbookDefaults(inputs, project = {}) {
  const location = inputs.location || project.location || '';
  const defaults = clusterWorkbookDefaults(location);
  const coldWaterTemp = defaults?.cold_water_temp_c ?? clusterColdWaterTemp(location);
  if (coldWaterTemp === null) return inputs;

  return {
    ...inputs,
    location,
    occupancy_percent: inputs.occupancy_percent ?? defaults?.occupancy_percent,
    electricity_intensity_kwh_room_day: inputs.electricity_intensity_kwh_room_day ?? defaults?.electricity_intensity_kwh_room_day,
    cooling_share: inputs.cooling_share ?? defaults?.cooling_share,
    dhw_l_orn: inputs.dhw_l_orn ?? 308,
    cold_water_temp_c: coldWaterTemp,
    hot_water_temp_c: inputs.hot_water_temp_c ?? 55,
    hot_water_loss_factor: inputs.hot_water_loss_factor ?? 0.25,
    monthly_factors: defaults?.monthly_factors ?? inputs.monthly_factors,
    laundry_operation: inputs.laundry_operation ?? defaults?.laundry_operation ?? 'No',
    grid_import_tariff_lkr_kwh: inputs.grid_import_tariff_lkr_kwh ?? 16.291666666666668,
    selected_biomass_fuel: inputs.selected_biomass_fuel ?? 'Gliricidia',
    selected_biomass_delivered_cost_lkr_kg: inputs.selected_biomass_delivered_cost_lkr_kg ?? 12,
    selected_biomass_lhv_kwh_kg: inputs.selected_biomass_lhv_kwh_kg ?? 4,
    laundry_diesel_available_l_room_day: inputs.laundry_diesel_available_l_room_day ?? defaults?.laundry_diesel_available_l_room_day,
    include_occupied_laundry_heat: inputs.include_occupied_laundry_heat ?? defaults?.include_occupied_laundry_heat,
    laundry_heat_selection_mode: inputs.laundry_heat_selection_mode ?? defaults?.laundry_heat_selection_mode,
    electric_chiller_cop: inputs.electric_chiller_cop ?? 5,
    absorption_chiller_cop: inputs.absorption_chiller_cop ?? 0.7,
    existing_boiler_efficiency: inputs.existing_boiler_efficiency ?? 0.8,
    new_biomass_steam_generator_efficiency: inputs.new_biomass_steam_generator_efficiency ?? 0.85,
    steam_enthalpy_rise_kj_kg: inputs.steam_enthalpy_rise_kj_kg ?? 2100,
    turbine_steam_operating_hours_y: inputs.turbine_steam_operating_hours_y ?? 8760,
    grid_exchange_method: inputs.grid_exchange_method ?? 'monthly',
    excel_shift_monthly_electricity: inputs.excel_shift_monthly_electricity ?? defaults?.excel_shift_monthly_electricity ?? 'No',
    workbook_turbine_kw_per_room: inputs.workbook_turbine_kw_per_room ?? 0,
    workbook_chiller_rt_per_room: inputs.workbook_chiller_rt_per_room ?? 0,
    financial_year: inputs.financial_year ?? 2026,
    analysis_period_years: 20,
    financial_metric_years: 20,
    inflation_escalation_rate: 0.025,
    use_absorption_chiller_capex_bands: inputs.use_absorption_chiller_capex_bands ?? 'Yes',
    absorption_chiller_specific_capex_lkr_rt: inputs.absorption_chiller_specific_capex_lkr_rt ?? 170000,
    extraction_turbine_specific_capex_lkr_kw: inputs.extraction_turbine_specific_capex_lkr_kw ?? 60000,
    steam_generator_specific_capex_lkr_kg_h: inputs.steam_generator_specific_capex_lkr_kg_h ?? 1000,
    cooling_integration_specific_capex_lkr_rt: inputs.cooling_integration_specific_capex_lkr_rt ?? defaults?.cooling_integration_specific_capex_lkr_rt ?? 15000,
    grid_interconnection_specific_capex_lkr_kw: inputs.grid_interconnection_specific_capex_lkr_kw ?? 27000,
    fuel_handling_specific_capex_lkr_kw: inputs.fuel_handling_specific_capex_lkr_kw ?? 5664,
    steam_condensate_piping_factor: inputs.steam_condensate_piping_factor ?? 0.06,
    water_treatment_condensate_factor: inputs.water_treatment_condensate_factor ?? 0.04,
    chw_cw_piping_factor: inputs.chw_cw_piping_factor ?? 0.04,
    stack_flue_gas_specific_capex_lkr_kw: inputs.stack_flue_gas_specific_capex_lkr_kw ?? 1500,
    electrical_instrumentation_factor: inputs.electrical_instrumentation_factor ?? 0.08,
    civil_structural_factor: inputs.civil_structural_factor ?? 0.02,
    direct_capex_tax_factor: inputs.direct_capex_tax_factor ?? 1.35,
    installation_factor: inputs.installation_factor ?? 0.15,
    engineering_development_factor: inputs.engineering_development_factor ?? 0.09,
    contingency_factor: inputs.contingency_factor ?? 0.10,
    fixed_om_rate_capex: inputs.fixed_om_rate_capex ?? 0.03,
    variable_turbine_om_lkr_kwh: inputs.variable_turbine_om_lkr_kwh ?? 0.3,
    insurance_admin_rate_capex: inputs.insurance_admin_rate_capex ?? 0.005,
    major_overhaul_year: inputs.major_overhaul_year ?? 10,
    major_overhaul_fraction_capex: inputs.major_overhaul_fraction_capex ?? 0.1,
    salvage_value_fraction_capex: inputs.salvage_value_fraction_capex ?? 0.1,
    export_tariff_schedule: inputs.export_tariff_schedule ?? southWestWorkbookExportTariffs()
  };
}

function withWorkbookDefaults(inputs, project = {}) {
  const location = inputs.location || project.location || '';
  if (!isSouthWestLocation(location)) return inputs;

  return {
    ...inputs,
    location,
    occupancy_percent: inputs.occupancy_percent ?? 71,
    electricity_intensity_kwh_room_day: 50,
    cooling_share: 0.591470459820233,
    dhw_l_orn: 308,
    cold_water_temp_c: 27.5,
    hot_water_temp_c: 55,
    hot_water_loss_factor: 0.25,
    monthly_factors: inputs.monthly_factors ?? southWestWorkbookMonthlyFactors(),
    laundry_operation: inputs.laundry_operation ?? 'No',
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
    grid_exchange_method: inputs.grid_exchange_method ?? 'monthly',
    excel_shift_monthly_electricity: 'Yes',
    workbook_turbine_kw_per_room: 0,
    workbook_chiller_rt_per_room: 0,
    financial_year: inputs.financial_year ?? 2026,
    analysis_period_years: 20,
    financial_metric_years: 20,
    inflation_escalation_rate: 0.025,
    use_absorption_chiller_capex_bands: 'Yes',
    absorption_chiller_specific_capex_lkr_rt: 170000,
    extraction_turbine_specific_capex_lkr_kw: 60000,
    steam_generator_specific_capex_lkr_kg_h: 1000,
    cooling_integration_specific_capex_lkr_rt: 15000,
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
