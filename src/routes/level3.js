const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

/**
 * Level 3: Login + Headers Detection (25 points)
 *
 * Challenge:
 * - Login required to access order history
 * - CSRF token validation
 * - User-Agent detection (returns fake data for default/bot UAs)
 * - Must identify and filter fake orders
 */

// Default/Bot User-Agent patterns
const BOT_UA_PATTERNS = [
  /python-requests/i,
  /python-urllib/i,
  /curl/i,
  /wget/i,
  /httpie/i,
  /postman/i,
  /insomnia/i,
  /^java\//i,
  /^go-http-client/i,
  /headless/i,
  /phantomjs/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i,
  /^node-fetch/i,
  /^axios/i,
  /^got\//i,
  /scrapy/i
];

function isBotUserAgent(ua) {
  if (!ua) return true;
  return BOT_UA_PATTERNS.some(pattern => pattern.test(ua));
}

// Generate CSRF token
function generateCsrfToken() {
  return uuidv4();
}

// Middleware to check auth
function requireAuth(req, res, next) {
  const token = req.cookies.session_token;
  if (!token) {
    return res.redirect('/level3/login');
  }

  const session = db.prepare(`
    SELECT s.*, u.id as user_id, u.username, u.team_name
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token);

  if (!session) {
    res.clearCookie('session_token');
    return res.redirect('/level3/login');
  }

  req.user = {
    id: session.user_id,
    username: session.username,
    teamName: session.team_name
  };
  next();
}

// Login page
router.get('/login', (req, res) => {
  const csrfToken = generateCsrfToken();
  // Store CSRF token temporarily (in production, use proper storage)
  res.cookie('csrf_token', csrfToken, { httpOnly: true, maxAge: 300000 });

  res.render('level3/login', { csrfToken, error: null });
});

// Login handler
router.post('/login', (req, res) => {
  const { username, password, csrf_token } = req.body;
  const storedCsrf = req.cookies.csrf_token;

  // CSRF validation
  if (!csrf_token || csrf_token !== storedCsrf) {
    const newCsrf = generateCsrfToken();
    res.cookie('csrf_token', newCsrf, { httpOnly: true, maxAge: 300000 });
    return res.render('level3/login', {
      csrfToken: newCsrf,
      error: 'Invalid CSRF token. Please try again.'
    });
  }

  // Find user
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    const newCsrf = generateCsrfToken();
    res.cookie('csrf_token', newCsrf, { httpOnly: true, maxAge: 300000 });
    return res.render('level3/login', {
      csrfToken: newCsrf,
      error: 'Invalid username or password'
    });
  }

  // Create session
  const sessionToken = uuidv4();
  const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour

  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(sessionToken, user.id, expiresAt);

  res.cookie('session_token', sessionToken, {
    httpOnly: true,
    maxAge: 3600000
  });

  res.redirect('/level3/orders');
});

// Logout
router.get('/logout', (req, res) => {
  const token = req.cookies.session_token;
  if (token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  res.clearCookie('session_token');
  res.redirect('/level3/login');
});

// Orders page (protected)
router.get('/orders', requireAuth, (req, res) => {
  const userAgent = req.get('User-Agent') || '';
  const referer = req.get('Referer') || '';
  const acceptLanguage = req.get('Accept-Language') || '';

  // Check if using bot/default UA
  const isBot = isBotUserAgent(userAgent);

  // Additional checks
  const missingHeaders = [];
  if (!referer) missingHeaders.push('Referer');
  if (!acceptLanguage) missingHeaders.push('Accept-Language');

  // Get orders
  let orders;
  if (isBot) {
    // Return ALL orders including fake ones for bots
    orders = db.prepare(`
      SELECT id, product_name, quantity, total_price, status, order_date, is_fake
      FROM orders
      WHERE user_id = ?
      ORDER BY order_date DESC
    `).all(req.user.id);

    // Log this suspicious request
    db.prepare(`
      INSERT INTO honeypot_logs (task_id, ip_address, trap_type)
      VALUES (?, ?, ?)
    `).run(req.user.username, req.ip, 'level3_bot_ua_detected');
  } else {
    // Return only real orders for legitimate browsers
    orders = db.prepare(`
      SELECT id, product_name, quantity, total_price, status, order_date, is_fake
      FROM orders
      WHERE user_id = ? AND is_fake = 0
      ORDER BY order_date DESC
    `).all(req.user.id);
  }

  res.render('level3/orders', {
    user: req.user,
    orders,
    isBot,
    userAgent: userAgent.substring(0, 50) + (userAgent.length > 50 ? '...' : ''),
    missingHeaders
  });
});

// API endpoint for orders (alternative scraping method)
router.get('/api/orders', requireAuth, (req, res) => {
  const userAgent = req.get('User-Agent') || '';
  const isBot = isBotUserAgent(userAgent);

  let orders;
  if (isBot) {
    // Include fake orders for bots
    orders = db.prepare(`
      SELECT id, product_name, quantity, total_price, status, order_date
      FROM orders
      WHERE user_id = ?
      ORDER BY order_date DESC
    `).all(req.user.id);

    // Log
    db.prepare(`
      INSERT INTO honeypot_logs (task_id, ip_address, trap_type)
      VALUES (?, ?, ?)
    `).run(req.user.username, req.ip, 'level3_api_bot_detected');
  } else {
    orders = db.prepare(`
      SELECT id, product_name, quantity, total_price, status, order_date
      FROM orders
      WHERE user_id = ? AND is_fake = 0
      ORDER BY order_date DESC
    `).all(req.user.id);
  }

  res.json({
    user: req.user.username,
    total_orders: orders.length,
    orders
  });
});

module.exports = router;
