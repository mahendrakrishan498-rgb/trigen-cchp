const express = require('express');
const pool = require('../db');
const { authRequired, adminRequired } = require('../middleware/auth');
const multer = require('multer');
const { parseUploadedTable, toNumber, pick } = require('../utils/fileParser');
const {
  ensureClusterMonthlyFactorsColumn,
  monthlyFactorsJson,
  rowWithMonthlyFactors
} = require('../services/clusterDefaultsService');
const {
  dispatchTemplateCsv,
  parseDispatchUpload,
  replaceClusterDispatch15Min
} = require('../services/clusterDispatch15MinService');

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();
router.use(authRequired, adminRequired);

router.get('/settings', async (req, res, next) => {
  try { const [rows] = await pool.query('SELECT * FROM assumption_settings ORDER BY setting_key'); res.json(rows); }
  catch (err) { next(err); }
});

router.put('/settings/:key', async (req, res, next) => {
  try {
    const { key } = req.params;
    const { setting_value, unit, description } = req.body;
    await pool.query(`INSERT INTO assumption_settings (setting_key, setting_value, unit, description) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value), unit=VALUES(unit), description=VALUES(description), updated_at=CURRENT_TIMESTAMP`, [key, setting_value, unit || '', description || '']);
    res.json({ message: 'Setting saved' });
  } catch (err) { next(err); }
});

router.get('/equipment', async (req, res, next) => {
  try { const [rows] = await pool.query('SELECT * FROM equipment_quotations ORDER BY room_capacity, item_name'); res.json(rows); }
  catch (err) { next(err); }
});

router.post('/equipment', async (req, res, next) => {
  try {
    const { item_name, config_type, room_capacity, capacity_value, capacity_unit, cost_lkr, supplier, reference_note } = req.body;
    const [result] = await pool.query(`INSERT INTO equipment_quotations (item_name, config_type, room_capacity, capacity_value, capacity_unit, cost_lkr, supplier, reference_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [item_name, config_type || 'both', room_capacity, capacity_value, capacity_unit, cost_lkr, supplier || '', reference_note || '']);
    res.json({ id: result.insertId, message: 'Equipment quotation added' });
  } catch (err) { next(err); }
});

router.put('/equipment/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { item_name, config_type, room_capacity, capacity_value, capacity_unit, cost_lkr, supplier, reference_note } = req.body;
    await pool.query(`UPDATE equipment_quotations SET item_name=?, config_type=?, room_capacity=?, capacity_value=?, capacity_unit=?, cost_lkr=?, supplier=?, reference_note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [item_name, config_type || 'both', room_capacity, capacity_value, capacity_unit, cost_lkr, supplier || '', reference_note || '', id]);
    res.json({ message: 'Equipment quotation updated' });
  } catch (err) { next(err); }
});

router.delete('/equipment/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM equipment_quotations WHERE id=?', [req.params.id]); res.json({ message: 'Equipment quotation deleted' }); }
  catch (err) { next(err); }
});

router.get('/export-tariffs', async (req, res, next) => {
  try { const [rows] = await pool.query('SELECT * FROM export_tariffs ORDER BY year'); res.json(rows); }
  catch (err) { next(err); }
});

router.put('/export-tariffs/:year', async (req, res, next) => {
  try {
    const year = Number(req.params.year);
    const { om_tariff_lkr_kwh, fuel_tariff_lkr_kwh, fixed_tariff_lkr_kwh } = req.body;
    await pool.query(`INSERT INTO export_tariffs (year, om_tariff_lkr_kwh, fuel_tariff_lkr_kwh, fixed_tariff_lkr_kwh) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE om_tariff_lkr_kwh=VALUES(om_tariff_lkr_kwh), fuel_tariff_lkr_kwh=VALUES(fuel_tariff_lkr_kwh), fixed_tariff_lkr_kwh=VALUES(fixed_tariff_lkr_kwh)`, [year, om_tariff_lkr_kwh, fuel_tariff_lkr_kwh, fixed_tariff_lkr_kwh]);
    res.json({ message: 'Export tariff saved' });
  } catch (err) { next(err); }
});


router.get('/clusters', async (req, res, next) => {
  try {
    await ensureClusterMonthlyFactorsColumn();
    const [rows] = await pool.query('SELECT * FROM cluster_defaults ORDER BY FIELD(cluster_name, "Colombo–Negombo","South/South-West Coast","Cultural Triangle","Hill Country","East Coast/Wildlife","Generic Hotel Case"), cluster_name');
    res.json(rows.map(rowWithMonthlyFactors));
  } catch (err) { next(err); }
});

router.get('/clusters/template', async (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="cluster_defaults_template.csv"');
  res.send([
    'cluster_name,electricity_intensity_kwh_room_day,cooling_share,dhw_l_orn,occupancy_percent,grid_import_tariff_lkr_kwh,selected_biomass_fuel,selected_biomass_delivered_cost_lkr_kg,selected_biomass_lhv_kwh_kg,monthly_factor_jan,monthly_factor_feb,monthly_factor_mar,monthly_factor_apr,monthly_factor_may,monthly_factor_jun,monthly_factor_jul,monthly_factor_aug,monthly_factor_sep,monthly_factor_oct,monthly_factor_nov,monthly_factor_dec,notes',
    'Colombo–Negombo,58,0.62,320,82,16.291667,Gliricidia,12,4.0,Urban coastal hotel cluster',
    'South/South-West Coast,50,0.59147046,308,92,16.291667,Gliricidia,12,4.0,South/South-West resort cluster'
  ].join('\n'));
});

router.get('/clusters/dispatch15min/template', async (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="cluster_15min_dispatch_template.csv"');
  res.send(dispatchTemplateCsv());
});

router.put('/clusters/:id', async (req, res, next) => {
  try {
    await ensureClusterMonthlyFactorsColumn();
    const { id } = req.params;
    const r = req.body;
    await pool.query(`UPDATE cluster_defaults SET cluster_name=?, electricity_intensity_kwh_room_day=?, cooling_share=?, dhw_l_orn=?, occupancy_percent=?, grid_import_tariff_lkr_kwh=?, selected_biomass_fuel=?, selected_biomass_delivered_cost_lkr_kg=?, selected_biomass_lhv_kwh_kg=?, monthly_factors_json=?, notes=? WHERE id=?`, [
      r.cluster_name,
      r.electricity_intensity_kwh_room_day,
      r.cooling_share,
      r.dhw_l_orn,
      r.occupancy_percent,
      r.grid_import_tariff_lkr_kwh,
      r.selected_biomass_fuel || '',
      r.selected_biomass_delivered_cost_lkr_kg,
      r.selected_biomass_lhv_kwh_kg,
      monthlyFactorsJson(r),
      r.notes || '',
      id
    ]);
    res.json({ message: 'Cluster default updated' });
  } catch (err) { next(err); }
});

router.post('/clusters', async (req, res, next) => {
  try {
    await ensureClusterMonthlyFactorsColumn();
    const r = req.body;
    await pool.query(`INSERT INTO cluster_defaults (cluster_name, electricity_intensity_kwh_room_day, cooling_share, dhw_l_orn, occupancy_percent, grid_import_tariff_lkr_kwh, selected_biomass_fuel, selected_biomass_delivered_cost_lkr_kg, selected_biomass_lhv_kwh_kg, monthly_factors_json, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE electricity_intensity_kwh_room_day=VALUES(electricity_intensity_kwh_room_day), cooling_share=VALUES(cooling_share), dhw_l_orn=VALUES(dhw_l_orn), occupancy_percent=VALUES(occupancy_percent), grid_import_tariff_lkr_kwh=VALUES(grid_import_tariff_lkr_kwh), selected_biomass_fuel=VALUES(selected_biomass_fuel), selected_biomass_delivered_cost_lkr_kg=VALUES(selected_biomass_delivered_cost_lkr_kg), selected_biomass_lhv_kwh_kg=VALUES(selected_biomass_lhv_kwh_kg), monthly_factors_json=VALUES(monthly_factors_json), notes=VALUES(notes)`, [
      r.cluster_name,
      r.electricity_intensity_kwh_room_day,
      r.cooling_share,
      r.dhw_l_orn,
      r.occupancy_percent,
      r.grid_import_tariff_lkr_kwh,
      r.selected_biomass_fuel || '',
      r.selected_biomass_delivered_cost_lkr_kg,
      r.selected_biomass_lhv_kwh_kg,
      monthlyFactorsJson(r),
      r.notes || ''
    ]);
    const [rows] = await pool.query('SELECT id, cluster_name FROM cluster_defaults WHERE cluster_name=?', [r.cluster_name]);
    res.json({ message: 'Cluster default saved', id: rows[0]?.id, cluster: rows[0] || null });
  } catch (err) { next(err); }
});

router.delete('/clusters/:id', async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM cluster_defaults WHERE id=?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Cluster not found' });
    res.json({ message: 'Cluster deleted' });
  } catch (err) { next(err); }
});

router.post('/clusters/:id/dispatch15min/upload', upload.single('file'), async (req, res, next) => {
  try {
    const clusterId = Number(req.params.id);
    const [clusters] = await pool.query('SELECT id, cluster_name FROM cluster_defaults WHERE id=?', [clusterId]);
    if (!clusters.length) return res.status(404).json({ message: 'Cluster not found' });

    const parsed = await parseDispatchUpload(req.file);
    await replaceClusterDispatch15Min(clusterId, parsed.rows);

    res.json({
      message: '15-minute dispatch data uploaded',
      cluster_id: clusterId,
      cluster_name: clusters[0].cluster_name,
      saved_rows: parsed.rows.length,
      warning: parsed.warnings[0] || '',
      warnings: parsed.warnings
    });
  } catch (err) { next(err); }
});

router.post('/clusters/upload', upload.single('file'), async (req, res, next) => {
  try {
    await ensureClusterMonthlyFactorsColumn();
    const rows = await parseUploadedTable(req.file.buffer, req.file.originalname);
    let updated = 0;
    for (const row of rows) {
      const clusterName = pick(row, ['cluster_name', 'cluster', 'hotel_cluster', 'location']);
      if (!clusterName) continue;
      await pool.query(`INSERT INTO cluster_defaults (cluster_name, electricity_intensity_kwh_room_day, cooling_share, dhw_l_orn, occupancy_percent, grid_import_tariff_lkr_kwh, selected_biomass_fuel, selected_biomass_delivered_cost_lkr_kg, selected_biomass_lhv_kwh_kg, monthly_factors_json, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE electricity_intensity_kwh_room_day=VALUES(electricity_intensity_kwh_room_day), cooling_share=VALUES(cooling_share), dhw_l_orn=VALUES(dhw_l_orn), occupancy_percent=VALUES(occupancy_percent), grid_import_tariff_lkr_kwh=VALUES(grid_import_tariff_lkr_kwh), selected_biomass_fuel=VALUES(selected_biomass_fuel), selected_biomass_delivered_cost_lkr_kg=VALUES(selected_biomass_delivered_cost_lkr_kg), selected_biomass_lhv_kwh_kg=VALUES(selected_biomass_lhv_kwh_kg), monthly_factors_json=VALUES(monthly_factors_json), notes=VALUES(notes)`, [
        clusterName,
        toNumber(pick(row, ['electricity_intensity_kwh_room_day', 'electricity_intensity', 'kwh_room_day'], 50), 50),
        toNumber(pick(row, ['cooling_share'], 0.59147046), 0.59147046),
        toNumber(pick(row, ['dhw_l_orn', 'dhw_lorn', 'dhw'], 308), 308),
        toNumber(pick(row, ['occupancy_percent', 'occupancy'], 92), 92),
        toNumber(pick(row, ['grid_import_tariff_lkr_kwh', 'grid_tariff', 'electricity_tariff'], 16.291667), 16.291667),
        pick(row, ['selected_biomass_fuel', 'biomass_fuel'], 'Gliricidia'),
        toNumber(pick(row, ['selected_biomass_delivered_cost_lkr_kg', 'biomass_price', 'biomass_cost'], 12), 12),
        toNumber(pick(row, ['selected_biomass_lhv_kwh_kg', 'biomass_lhv'], 4.0), 4.0),
        monthlyFactorsJson(row),
        pick(row, ['notes', 'remarks'], '')
      ]);
      updated += 1;
    }
    res.json({ message: `Cluster upload completed`, updated });
  } catch (err) { next(err); }
});

module.exports = router;
