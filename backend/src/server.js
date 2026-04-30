require('dotenv').config();
const express = require('express');
const fs = require('fs');
const cors = require('cors');
const errorHandler = require('./middleware/errorHandler');
const { ensureAdminUser } = require('./services/authBootstrap');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const calcRoutes = require('./routes/calculations');
const projectRoutes = require('./routes/projects');
const bmsRoutes = require('./routes/bms');
const pscadRoutes = require('./routes/pscad');
const comparisonRoutes = require('./routes/comparison');
const reportRoutes = require('./routes/reports');

fs.mkdirSync('/tmp/uploads', { recursive: true });
const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => res.json({ ok: true, name: 'trigen-cchp-backend', version: '2.0.0' }));
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/calculations', calcRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/bms', bmsRoutes);
app.use('/api/pscad', pscadRoutes);
app.use('/api/comparison', comparisonRoutes);
app.use('/api/reports', reportRoutes);
app.use(errorHandler);

const port = Number(process.env.PORT || 5000);
ensureAdminUser()
  .then(() => app.listen(port, () => console.log(`Backend running on http://localhost:${port}`)))
  .catch((err) => {
    console.error('Startup failed. Check MySQL connection and schema import.');
    console.error(err);
    process.exit(1);
  });
