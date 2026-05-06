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

const router = express.Router();
router.use(authRequired);

router.post('/preview', async (req, res, next) => {
  try {
    const settings = await getSettingsMap();
    const equipment = await getEquipmentRows();
    const tariffs = await getExportTariffs();

    const bms = req.body.project_id
      ? await getLatestBmsSummary(req.body.project_id, req.user.id)
      : null;

      let result = calculate(req.body || {}, settings, equipment, tariffs, bms);
      result = applyExcelMonthlyProfile(result, req.body || {});
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

    const inputs = req.body || {};
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
