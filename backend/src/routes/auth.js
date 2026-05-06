const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

function tokenFor(user) {
  return jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '7d' });
}

let googleAuthSchemaReady = false;

async function ensureGoogleAuthColumns() {
  if (googleAuthSchemaReady) return;

  const dbName = process.env.DB_NAME || 'trigen_cchp';
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'
       AND COLUMN_NAME IN ('google_id', 'auth_provider')`,
    [dbName]
  );
  const names = new Set(columns.map((row) => row.COLUMN_NAME));

  if (!names.has('google_id')) {
    await pool.query('ALTER TABLE users ADD COLUMN google_id VARCHAR(255) NULL');
  }

  if (!names.has('auth_provider')) {
    await pool.query("ALTER TABLE users ADD COLUMN auth_provider VARCHAR(50) NOT NULL DEFAULT 'local'");
  }

  googleAuthSchemaReady = true;
}

async function verifyGoogleCredential(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    const err = new Error('Google login is not configured');
    err.statusCode = 500;
    throw err;
  }

  const params = new URLSearchParams({ id_token: credential });
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?${params.toString()}`);
  const data = await response.json();

  if (!response.ok || data.aud !== clientId || data.email_verified !== 'true') {
    const err = new Error('Invalid Google login');
    err.statusCode = 401;
    throw err;
  }

  return {
    googleId: data.sub,
    email: String(data.email || '').toLowerCase(),
    name: data.name || data.email
  };
}

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password required' });
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [name, email, hash, 'user']);
    const user = { id: result.insertId, name, email, role: 'user' };
    res.json({ user, token: tokenFor(user) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Email already registered' });
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password, role } = req.body;
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });
    if (!user.password_hash) return res.status(401).json({ message: 'Use Google login for this account' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid email or password' });
    if (role && user.role !== role) {
      return res.status(403).json({
        message: role === 'admin' ? 'Admin account required' : 'User account required'
      });
    }
    const safe = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.json({ user: safe, token: tokenFor(safe) });
  } catch (err) {
    next(err);
  }
});

router.post('/google', async (req, res, next) => {
  try {
    await ensureGoogleAuthColumns();
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ message: 'Google credential required' });

    const profile = await verifyGoogleCredential(credential);
    let [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [profile.email]);
    let user = rows[0];

    if (!user) {
      const [result] = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, google_id, auth_provider)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [profile.name, profile.email, '', 'user', profile.googleId, 'google']
      );
      user = {
        id: result.insertId,
        name: profile.name,
        email: profile.email,
        role: 'user'
      };
    } else {
      if (user.role === 'admin') return res.status(403).json({ message: 'Use admin login for this account' });
      await pool.query(
        'UPDATE users SET google_id=?, auth_provider=? WHERE id=?',
        [profile.googleId, 'google', user.id]
      );
      user = {
        id: user.id,
        name: user.name || profile.name,
        email: user.email,
        role: user.role
      };
    }

    res.json({ user, token: tokenFor(user) });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    next(err);
  }
});

router.get('/me', authRequired, (req, res) => res.json({ user: req.user }));

module.exports = router;
