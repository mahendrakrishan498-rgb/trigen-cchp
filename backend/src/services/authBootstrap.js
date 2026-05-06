const bcrypt = require('bcryptjs');
const pool = require('../db');

async function ensureAdminUser() {
  const adminUsers = [
    {
      email: process.env.ADMIN_EMAIL || 'admin@trigen.local',
      password: process.env.ADMIN_PASSWORD || 'admin123',
      name: process.env.ADMIN_NAME || 'System Admin'
    },
    { email: 'gayasha@admin', password: 'gayasha123', name: 'Gayasha Admin' },
    { email: 'krishan@admin', password: 'krishan123', name: 'Krishan Admin' },
    { email: 'dihan@admin', password: 'dihan123', name: 'Dihan Admin' }
  ];

  for (const admin of adminUsers) {
    const hash = await bcrypt.hash(admin.password, 10);
    const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [admin.email]);

    if (rows.length > 0) {
      await pool.query(
        'UPDATE users SET name = ?, password_hash = ?, role = ? WHERE email = ?',
        [admin.name, hash, 'admin', admin.email]
      );
      continue;
    }

    await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [admin.name, admin.email, hash, 'admin']
    );
  }

  console.log('Admin accounts verified.');
}

module.exports = { ensureAdminUser };
