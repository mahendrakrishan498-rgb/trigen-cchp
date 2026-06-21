function applyExcelMonthlyProfile(result, inputs) {
  const profile = inputs.monthly_profile;

  if (!Array.isArray(profile) || profile.length === 0) {
    return result;
  }

  const existingMonthly = result.monthly_dispatch || [];
  const load = result.step01_load_profile || {};
  const annualElectricityKwh = Number(load.annual_electricity_kwh || 0);
  const annualCoolingKwh = Number(load.annual_cooling_thermal_kwh || 0);
  const annualHeatingKwh = Number(load.annual_heating_demand_kwh_th || 0);

  function valuesFor(field) {
    return profile.map((row) => Number(row[field] || 0));
  }

  function hasValues(values) {
    return values.some((value) => value > 0);
  }

  function weightsFrom(values, fallbackValues = []) {
    const total = values.reduce((sum, value) => sum + value, 0);
    if (total > 0) return values.map((value) => value / total);

    const fallbackTotal = fallbackValues.reduce((sum, value) => sum + value, 0);
    if (fallbackTotal > 0) return fallbackValues.map((value) => value / fallbackTotal);

    return profile.map(() => 1 / profile.length);
  }

  const existingElectricValues = existingMonthly.map((row) => Number(row.hotel_electricity_kwh || 0));
  const electricValues = valuesFor('hotel_electricity_kwh');
  const coolingValues = valuesFor('cooling_thermal_kwh');
  const heatingValues = valuesFor('heating_thermal_kwh');
  const electricWeights = weightsFrom(electricValues, existingElectricValues);
  const coolingWeights = hasValues(coolingValues) ? weightsFrom(coolingValues) : electricWeights;
  const heatingWeights = hasValues(heatingValues) ? weightsFrom(heatingValues) : electricWeights;

  result.monthly_dispatch = profile.map((row, index) => {
    const existing = existingMonthly[index] || {};

    return {
      ...existing,
      month: row.month || existing.month,
      occupancy_percent: row.occupancy_percent || existing.occupancy_percent,
      hotel_electricity_kwh: annualElectricityKwh * electricWeights[index],
      cooling_thermal_kwh: annualCoolingKwh * coolingWeights[index],
      heating_thermal_kwh: annualHeatingKwh * heatingWeights[index]
    };
  });

  result.load_profile = {
    ...(result.load_profile || {}),
    monthly_profile: result.monthly_dispatch.map((row) => ({
      month: row.month,
      electricity_kwh: row.hotel_electricity_kwh,
      cooling_kwh: row.cooling_thermal_kwh,
      dhw_kwh: row.heating_thermal_kwh
    }))
  };

  result.step01_load_profile = {
    ...(result.step01_load_profile || {}),
    data_source: 'Manual/Excel monthly profile factors',
    excel_input_file_name: inputs.excel_input_file_name || '',
    annual_electricity_kwh: annualElectricityKwh,
    annual_cooling_thermal_kwh: annualCoolingKwh,
    annual_heating_demand_kwh_th: annualHeatingKwh,
    daily_electricity_kwh: annualElectricityKwh / 365,
    daily_cooling_thermal_kwh: annualCoolingKwh / 365,
    daily_heating_demand_kwh_th: annualHeatingKwh / 365
  };

  result.inputs_used = {
    ...(result.inputs_used || {}),
    excel_input_file_name: inputs.excel_input_file_name || '',
    monthly_profile_uploaded: true,
    monthly_profile_mode: 'monthly values used as load distribution factors'
  };

  return result;
}
const express = require('express');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { calculate, EXPORT_TARIFFS } = require('../calcEngine');
const { getSettingsMap, getEquipmentRows, getExportTariffs, getLatestBmsSummary } = require('../services/settingsService');
const { getClusterDispatch15Min } = require('../services/clusterDispatch15MinService');
const southWestDispatch15Min = require('../data/southWestDispatch15Min');

const router = express.Router();
router.use(authRequired);

function isSouthWestLocation(location) {
  return /south|south-west|south\/south-west|south coast/i.test(location || '');
}

function southWestWorkbookExportTariffs() {
  return EXPORT_TARIFFS;
}

function withSouthWestWorkbookDefaults(inputs) {
  if (!isSouthWestLocation(inputs.location)) return inputs;

  return {
    ...inputs,
    occupancy_percent: 92,
    electricity_intensity_kwh_room_day: 50,
    cooling_share: 0.591470459820233,
    dhw_l_orn: 308,
    laundry_operation: 'Yes',
    grid_import_tariff_lkr_kwh: 16.291666666666668,
    grid_export_tariff_lkr_kwh: 43.27,
    selected_biomass_fuel: 'Gliricidia',
    selected_biomass_delivered_cost_lkr_kg: 12,
    selected_biomass_lhv_kwh_kg: 4,
    electric_chiller_cop: 5,
    absorption_chiller_cop: 0.7,
    existing_boiler_efficiency: 0.8,
    new_biomass_steam_generator_efficiency: 0.85,
    steam_enthalpy_rise_kj_kg: 2100,
    turbine_steam_operating_hours_y: 8760,
    workbook_turbine_kw_per_room: 0,
    workbook_chiller_rt_per_room: 0,
    financial_year: 2026,
    analysis_period_years: 25,
    financial_metric_years: 20,
    inflation_escalation_rate: 0.05,
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
    variable_turbine_om_lkr_kwh: 1.5,
    insurance_admin_rate_capex: 0.005,
    major_overhaul_year: 10,
    major_overhaul_fraction_capex: 0.1,
    salvage_value_fraction_capex: 0.1,
    export_tariff_schedule: southWestWorkbookExportTariffs()
  };
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

async function withClusterDispatchFactors(inputs) {
  const normalizedInputs = withSouthWestWorkbookDefaults(inputs);
  const location = normalizedInputs.location || '';
  if (!location) return normalizedInputs;

  if (isSouthWestLocation(location)) {
    return {
      ...normalizedInputs,
      dispatch_15min_profile: southWestDispatchFactors()
    };
  }

  if (normalizedInputs.dispatch_15min_profile || normalizedInputs.dispatch_15min_factors) return normalizedInputs;

  const [clusters] = await pool.query('SELECT id FROM cluster_defaults WHERE cluster_name=? LIMIT 1', [location]);
  if (!clusters.length) return normalizedInputs;

  const rows = await getClusterDispatch15Min(clusters[0].id);
  if (!rows.length) return normalizedInputs;

  return {
    ...normalizedInputs,
    dispatch_15min_profile: rows.map((row) => ({
      time_fraction: Number(row.time_fraction || 0),
      time_hour: Number(row.time_hour || 0),
      electric_factor: Number(row.hotel_electric_factor || 0) || 1,
      cooling_factor: Number(row.cooling_thermal_factor || 0) || 1
    }))
  };
}

router.post('/preview', async (req, res, next) => {
  try {
    const settings = await getSettingsMap();
    const equipment = await getEquipmentRows();
    const tariffs = await getExportTariffs();

    const inputs = await withClusterDispatchFactors(req.body || {});

    const bms = inputs.project_id
      ? await getLatestBmsSummary(inputs.project_id, req.user.id)
      : null;

      let result = calculate(inputs, settings, equipment, tariffs, bms);
      result = applyExcelMonthlyProfile(result, inputs);
      res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/save', async (req, res, next) => {
  try {
    const settings = await getSettingsMap();
    const equipment = await getEquipmentRows();
    const tariffs = await getExportTariffs();

    const inputs = await withClusterDispatchFactors(req.body || {});
    const bms = inputs.project_id
      ? await getLatestBmsSummary(inputs.project_id, req.user.id)
      : null;

      let result = calculate(inputs, settings, equipment, tariffs, bms);
      result = applyExcelMonthlyProfile(result, inputs);

    const title = inputs.title || `${inputs.hotel_name || 'Hotel'} - Step03 Design`;
    const hotelName = inputs.hotel_name || '';
    const location = inputs.location || '';

    let projectId = Number(inputs.project_id || 0);

    if (projectId > 0) {
      const [updateResult] = await pool.query(
        `UPDATE projects
         SET title = ?, hotel_name = ?, location = ?, inputs_json = ?, result_json = ?
         WHERE id = ? AND user_id = ?`,
        [
          title,
          hotelName,
          location,
          JSON.stringify(inputs),
          JSON.stringify(result),
          projectId,
          req.user.id
        ]
      );

      if (updateResult.affectedRows === 0) {
        projectId = 0;
      }
    }

    if (!projectId) {
      const [saved] = await pool.query(
        `INSERT INTO projects
         (user_id, title, hotel_name, location, inputs_json, result_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          title,
          hotelName,
          location,
          JSON.stringify(inputs),
          JSON.stringify(result)
        ]
      );

      projectId = saved.insertId;
    }

    res.json({
      id: projectId,
      result,
      message: 'Project saved successfully'
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
