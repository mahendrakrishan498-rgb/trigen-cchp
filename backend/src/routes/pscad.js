const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');
const { parseUploadedTable, toNumber, pick } = require('../utils/fileParser');

const upload = multer({ dest: 'uploads/' });
const router = express.Router();
router.use(authRequired);

router.post('/:projectId/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'File required' });
    const [projects] = await pool.query('SELECT id FROM projects WHERE id=? AND user_id=?', [req.params.projectId, req.user.id]);
    if (!projects[0]) return res.status(404).json({ message: 'Project not found' });
    const rows = await parseUploadedTable(req.file.path, req.file.originalname);
    const values = rows.slice(0, 20000).map((r) => [
      req.params.projectId,
      req.user.id,
      toNumber(pick(r, ['time_s', 'time', 't']), 0),
      toNumber(pick(r, ['voltage', 'voltage_v', 'v']), null),
      toNumber(pick(r, ['frequency', 'frequency_hz', 'f']), null),
      toNumber(pick(r, ['power_kw', 'generator_power_kw', 'p_kw']), null),
      toNumber(pick(r, ['exported_kw', 'grid_export_kw', 'export_kw']), null)
    ]);
    await pool.query('DELETE FROM pscad_results WHERE project_id=? AND user_id=?', [req.params.projectId, req.user.id]);
    if (values.length) {
      await pool.query('INSERT INTO pscad_results (project_id, user_id, time_s, voltage_v, frequency_hz, power_kw, exported_kw) VALUES ?', [values]);
    }
    fs.unlink(req.file.path, () => {});
    res.json({ message: 'PSCAD results uploaded', count: values.length });
  } catch (err) { next(err); }
});

router.get('/:projectId', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT time_s, voltage_v, frequency_hz, power_kw, exported_kw FROM pscad_results WHERE project_id=? AND user_id=? ORDER BY time_s LIMIT 5000', [req.params.projectId, req.user.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
