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
const { calculate } = require('../calcEngine');
const { getSettingsMap, getEquipmentRows, getExportTariffs, getLatestBmsSummary } = require('../services/settingsService');
const { getClusterDispatch15Min } = require('../services/clusterDispatch15MinService');
const southWestDispatch15Min = require('../data/southWestDispatch15Min');

const router = express.Router();
router.use(authRequired);

function isSouthWestLocation(location) {
  return /south|south-west|south\/south-west|south coast/i.test(location || '');
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
    selected_biomass_fuel: 'Gliricidia',
    selected_biomass_delivered_cost_lkr_kg: 12,
    selected_biomass_lhv_kwh_kg: 4,
    financial_metric_years: 20
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
