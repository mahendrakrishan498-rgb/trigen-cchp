const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { parseUploadedTable, toNumber, pick } = require('../utils/fileParser');

const upload = multer({ dest: 'uploads/' });
const router = express.Router();
router.use(authRequired);

function getWebsiteValue(result, metric) {
  const paths = {
    annual_electricity_kwh: 'step01_load_profile.annual_electricity_kwh',
    annual_cooling_thermal_kwh: 'step01_load_profile.annual_cooling_thermal_kwh',
    annual_heating_demand_kwh: 'step01_load_profile.annual_heating_demand_kwh_th',
    selected_absorption_chiller_rt: 'system_sizing.absorption_chiller_rt',
    main_chiller_rt: 'system_sizing.main_chiller_rt',
    backup_chiller_rt: 'system_sizing.backup_chiller_rt',
    selected_turbine_kw: 'system_sizing.turbine_kw',
    selected_inlet_steam_flow_kg_h: 'step02_technical_design.selected_turbine_inlet_steam_flow_kg_h',
    annual_export_kwh: 'energy_balance.annual_grid_export_kwh',
    annual_grid_export_kwh: 'energy_balance.annual_grid_export_kwh',
    biomass_tonnes_year: 'fuel.annual_biomass_tonnes',
    net_initial_investment_lkr: 'step03_capex.net_initial_investment_lkr',
    annual_net_benefit_lkr: 'financial.annual_net_benefit_lkr',
    year1_net_project_savings_lkr: 'financial.year1_net_project_savings_lkr_y',
    payback_years: 'financial.simple_payback_years',
    npv_lkr: 'financial.npv_lkr',
    irr_percent: 'financial.irr_percent',
    profitability_index: 'financial.profitability_index',
    co2_reduction_tonnes_year: 'emissions.co2_reduction_tonnes_year',
    annual_ghg_reduction_kgco2_y: 'emissions.annual_ghg_reduction_kgco2_y'
  };
  const path = paths[metric] || metric;
  return path.split('.').reduce((obj, key) => obj && obj[key], result);
}

async function saveRows(projectId, userId, rows) {
  const [projects] = await pool.query('SELECT result_json FROM projects WHERE id=? AND user_id=?', [projectId, userId]);
  if (!projects[0]) throw new Error('Project not found');
  const result = JSON.parse(projects[0].result_json || '{}');
  await pool.query('DELETE FROM retscreen_comparisons WHERE project_id=? AND user_id=?', [projectId, userId]);
  const values = rows.map((r) => {
    const metric = String(pick(r, ['metric', 'parameter', 'item'], '')).trim();
    const unit = String(pick(r, ['unit'], '')).trim();
    const retscreenValue = toNumber(pick(r, ['retscreen_value', 'retscreen', 'excel_value', 'excel']), null);
    const websiteValue = toNumber(pick(r, ['website_value']), getWebsiteValue(result, metric));
    const errorPercent = retscreenValue !== 0 && retscreenValue !== null ? ((websiteValue - retscreenValue) / retscreenValue) * 100 : null;
    return [projectId, userId, metric, websiteValue, retscreenValue, unit, errorPercent];
  }).filter((v) => v[2]);
  if (values.length) {
    await pool.query('INSERT INTO retscreen_comparisons (project_id, user_id, metric, website_value, retscreen_value, unit, error_percent) VALUES ?', [values]);
  }
  return values.length;
}

router.post('/:projectId/manual', async (req, res, next) => {
  try {
    const count = await saveRows(req.params.projectId, req.user.id, req.body.rows || []);
    res.json({ message: 'Comparison saved', count });
  } catch (err) { next(err); }
});

router.post('/:projectId/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'File required' });
    const rows = await parseUploadedTable(req.file.path, req.file.originalname);
    const count = await saveRows(req.params.projectId, req.user.id, rows);
    fs.unlink(req.file.path, () => {});
    res.json({ message: 'RETScreen/Excel comparison uploaded', count });
  } catch (err) { next(err); }
});

router.get('/:projectId', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM retscreen_comparisons WHERE project_id=? AND user_id=? ORDER BY id', [req.params.projectId, req.user.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
