require('dotenv').config();
const express = require('express');
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
const excelRoutes = require('./routes/excel');
const clusterRoutes = require('./routes/clusters');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));

const apiRouter = express.Router();

apiRouter.get('/health', (req, res) => res.json({ ok: true, name: 'trigen-cchp-backend', version: '2.0.0' }));
apiRouter.use('/auth', authRoutes);
apiRouter.use('/admin', adminRoutes);
apiRouter.use('/calculations', calcRoutes);
apiRouter.use('/projects', projectRoutes);
apiRouter.use('/bms', bmsRoutes);
apiRouter.use('/pscad', pscadRoutes);
apiRouter.use('/comparison', comparisonRoutes);
apiRouter.use('/reports', reportRoutes);
apiRouter.use('/excel', excelRoutes);
apiRouter.use('/clusters', clusterRoutes);

app.use('/api', apiRouter);
app.use('/_/backend/api', apiRouter);
app.use(errorHandler);

const port = Number(process.env.PORT || 5000);
ensureAdminUser()
  .then(() => app.listen(port, () => console.log(`Backend running on http://localhost:${port}`)))
  .catch((err) => {
    console.error('Startup failed. Check MySQL connection and schema import.');
    console.error(err);
    process.exit(1);
  });
