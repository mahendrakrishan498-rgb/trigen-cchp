const express = require('express');
const multer = require('multer');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { parseUploadedTable, toNumber, pick } = require('../utils/fileParser');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB
  }
});

const router = express.Router();
router.use(authRequired);

function parseTime(row) {
  return pick(row, ['timestamp', 'time', 'datetime', 'date_time', 'date'], null);
}

function hoursBetween(rows) {
  const times = rows.map((r) => new Date(parseTime(r)).getTime()).filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  if (times.length < 2) return 0.25;
  const diffs = [];
  for (let i = 1; i < Math.min(times.length, 20); i += 1) diffs.push((times[i] - times[i - 1]) / 3600000);
  const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  return avg > 0 && avg < 24 ? avg : 0.25;
}

function summarize(rows) {
  const intervalH = hoursBetween(rows);
  let totalElec = 0, totalChiller = 0, totalHotWater = 0, peakElec = 0, occSum = 0, occCount = 0;
  rows.forEach((r) => {
    const elec = toNumber(pick(r, ['electricity_kw', 'kw', 'power_kw', 'electricity_demand_kw']), 0);
    const chiller = toNumber(pick(r, ['chiller_kw', 'cooling_kw', 'cooling_demand_kw']), 0);
    const hotWater = toNumber(pick(r, ['hot_water_l', 'dhw_l', 'hot_water_liters']), 0);
    const occ = toNumber(pick(r, ['occupancy_percent', 'occupancy', 'occupied_percent']), NaN);
    totalElec += elec * intervalH;
    totalChiller += chiller * intervalH;
    totalHotWater += hotWater;
    peakElec = Math.max(peakElec, elec);
    if (Number.isFinite(occ)) { occSum += occ; occCount += 1; }
  });
  const times = rows.map((r) => new Date(parseTime(r)).getTime()).filter((t) => Number.isFinite(t));
  const daysCovered = times.length > 1 ? Math.max(1, (Math.max(...times) - Math.min(...times)) / 86400000 + intervalH / 24) : 365;
  return {
    days_covered: Number(daysCovered.toFixed(2)),
    interval_hours_assumed: Number(intervalH.toFixed(4)),
    records: rows.length,
    total_electricity_kwh: Number(totalElec.toFixed(2)),
    total_chiller_kwh: Number(totalChiller.toFixed(2)),
    cooling_share_from_bms: totalElec > 0 ? Number((totalChiller / totalElec).toFixed(4)) : null,
    total_hot_water_liters: Number(totalHotWater.toFixed(2)),
    peak_electricity_kw: Number(peakElec.toFixed(2)),
    average_occupancy_percent: occCount ? Number((occSum / occCount).toFixed(2)) : null
  };
}

router.post('/:projectId/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'File required' });
    const [projects] = await pool.query('SELECT id FROM projects WHERE id=? AND user_id=?', [req.params.projectId, req.user.id]);
    if (!projects[0]) return res.status(404).json({ message: 'Project not found' });

    const rows = await parseUploadedTable(req.file.buffer, req.file.originalname);
    const summary = summarize(rows);
    const [up] = await pool.query(
      'INSERT INTO bms_uploads (project_id, user_id, filename, record_count, summary_json) VALUES (?, ?, ?, ?, ?)',
      [req.params.projectId, req.user.id, req.file.originalname, rows.length, JSON.stringify(summary)]
    );
    const uploadId = up.insertId;
    const values = rows.slice(0, 20000).map((r) => [
      uploadId,
      parseTime(r) || null,
      toNumber(pick(r, ['electricity_kw', 'kw', 'power_kw', 'electricity_demand_kw']), null),
      toNumber(pick(r, ['chiller_kw', 'cooling_kw', 'cooling_demand_kw']), null),
      toNumber(pick(r, ['hot_water_l', 'dhw_l', 'hot_water_liters']), null),
      toNumber(pick(r, ['occupancy_percent', 'occupancy', 'occupied_percent']), null),
      toNumber(pick(r, ['steam_kg_h', 'steam_kg_per_h', 'steam_flow_kg_h']), null)
    ]);
    if (values.length) {
      await pool.query(
        'INSERT INTO bms_records (upload_id, timestamp_text, electricity_kw, chiller_kw, hot_water_l, occupancy_percent, steam_kg_h) VALUES ?',
        [values]
      );
    }
    res.json({ upload_id: uploadId, summary, message: 'BMS data uploaded' });
  } catch (err) { next(err); }
});

router.get('/:projectId/uploads', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM bms_uploads WHERE project_id=? AND user_id=? ORDER BY uploaded_at DESC', [req.params.projectId, req.user.id]);
    res.json(rows.map((r) => ({ ...r, summary: JSON.parse(r.summary_json || '{}') })));
  } catch (err) { next(err); }
});

router.get('/upload/:uploadId/records', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.* FROM bms_records r JOIN bms_uploads u ON r.upload_id=u.id WHERE r.upload_id=? AND u.user_id=? ORDER BY r.id LIMIT 1000`,
      [req.params.uploadId, req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
