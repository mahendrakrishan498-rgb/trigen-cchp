function applyExcelMonthlyProfile(result, inputs) {
  const profile = inputs.monthly_profile;

  if (!Array.isArray(profile) || profile.length === 0) {
    return result;
  }

  const existingMonthly = result.monthly_dispatch || [];

  const annualElectricityKwh = profile.reduce(
    (sum, r) => sum + Number(r.hotel_electricity_kwh || 0),
    0
  );

  const annualCoolingKwh = profile.reduce(
    (sum, r) => sum + Number(r.cooling_thermal_kwh || 0),
    0
  );

  const annualHeatingKwh = profile.reduce(
    (sum, r) => sum + Number(r.heating_thermal_kwh || 0),
    0
  );

  result.monthly_dispatch = profile.map((row, index) => ({
    ...(existingMonthly[index] || {}),
    month: row.month,
    occupancy_percent: row.occupancy_percent,
    hotel_electricity_kwh: Number(row.hotel_electricity_kwh || 0),
    cooling_thermal_kwh: Number(row.cooling_thermal_kwh || 0),
    heating_thermal_kwh: Number(row.heating_thermal_kwh || 0)
  }));

  result.step01_load_profile = {
    ...(result.step01_load_profile || {}),
    data_source: 'Uploaded Excel/CSV input file',
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
    monthly_profile_uploaded: true
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