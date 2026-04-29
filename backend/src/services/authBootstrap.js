const bcrypt = require('bcryptjs');
const pool = require('../db');

async function ensureAdminUser() {
  const email = process.env.ADMIN_EMAIL || 'admin@trigen.local';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const name = process.env.ADMIN_NAME || 'System Admin';
  const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (rows.length > 0) return;
  const hash = await bcrypt.hash(password, 10);
  await pool.query('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [name, email, hash, 'admin']);
  console.log(`Default admin created: ${email} / ${password}`);
}

module.exports = { ensureAdminUser };
