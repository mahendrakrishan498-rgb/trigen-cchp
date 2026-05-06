const express = require('express');
const pool = require('../db');
const { ensureClusterMonthlyFactorsColumn, rowWithMonthlyFactors } = require('../services/clusterDefaultsService');
const { getClusterDispatch15Min } = require('../services/clusterDispatch15MinService');

const router = express.Router();

// Public route: used by Input tab to load hotel cluster defaults
router.get('/', async (req, res, next) => {
  try {
    await ensureClusterMonthlyFactorsColumn();
    const [rows] = await pool.query(`
      SELECT
        id,
        cluster_name,
        electricity_intensity_kwh_room_day,
        cooling_share,
        dhw_l_orn,
        occupancy_percent,
        grid_import_tariff_lkr_kwh,
        selected_biomass_fuel,
        selected_biomass_delivered_cost_lkr_kg,
        selected_biomass_lhv_kwh_kg,
        notes,
        monthly_factors_json
      FROM cluster_defaults
      ORDER BY
        FIELD(
          cluster_name,
          'Colombo–Negombo',
          'South/South-West Coast',
          'Cultural Triangle',
          'Hill Country',
          'East Coast/Wildlife',
          'Generic Hotel Case'
        ),
        cluster_name
    `);

    res.json(rows.map(rowWithMonthlyFactors));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/dispatch15min', async (req, res, next) => {
  try {
    const clusterId = Number(req.params.id);
    const [clusters] = await pool.query('SELECT id, cluster_name FROM cluster_defaults WHERE id=?', [clusterId]);
    if (!clusters.length) return res.status(404).json({ message: 'Cluster not found' });

    const rows = await getClusterDispatch15Min(clusterId);
    res.json({
      cluster_id: clusterId,
      cluster_name: clusters[0].cluster_name,
      rows
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
