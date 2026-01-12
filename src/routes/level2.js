const express = require('express');
const router = express.Router();
const db = require('../utils/db');

/**
 * Level 2: Pagination + AJAX (25 points)
 *
 * Challenge:
 * - Products split across 10 pages (10 per page)
 * - Prices loaded via AJAX API
 * - Product IDs in data-id attributes
 * - Rate limiting on API (10 req/s)
 */

const ITEMS_PER_PAGE = 10;
const TOTAL_PAGES = 10;

// Rate limiting state
const rateLimiter = {
  requests: new Map(),
  limit: 10,
  windowMs: 1000
};

function checkRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - rateLimiter.windowMs;

  if (!rateLimiter.requests.has(ip)) {
    rateLimiter.requests.set(ip, []);
  }

  const requests = rateLimiter.requests.get(ip).filter(t => t > windowStart);
  rateLimiter.requests.set(ip, requests);

  if (requests.length >= rateLimiter.limit) {
    return false;
  }

  requests.push(now);
  return true;
}

// Main page with pagination
router.get('/', (req, res) => {
  const page = Math.max(1, Math.min(TOTAL_PAGES, parseInt(req.query.page) || 1));
  const offset = (page - 1) * ITEMS_PER_PAGE;

  // Get products without price (price loaded via AJAX)
  const products = db.prepare(`
    SELECT id, name, stock, sku, category
    FROM products
    WHERE is_honeypot = 0
    ORDER BY id
    LIMIT ? OFFSET ?
  `).all(ITEMS_PER_PAGE, offset);

  res.render('level2/index', {
    products,
    currentPage: page,
    totalPages: TOTAL_PAGES,
    itemsPerPage: ITEMS_PER_PAGE
  });
});

// AJAX API for prices
router.get('/api/prices', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;

  // Check rate limit
  if (!checkRateLimit(ip)) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Maximum 10 requests per second. Please slow down.',
      retry_after: 1
    });
  }

  const idsParam = req.query.ids;
  if (!idsParam) {
    return res.status(400).json({ error: 'Missing ids parameter' });
  }

  const ids = idsParam.split(',').map(id => parseInt(id)).filter(id => !isNaN(id));

  if (ids.length === 0) {
    return res.status(400).json({ error: 'No valid IDs provided' });
  }

  if (ids.length > 20) {
    return res.status(400).json({ error: 'Maximum 20 IDs per request' });
  }

  const placeholders = ids.map(() => '?').join(',');
  const prices = db.prepare(`
    SELECT id, price
    FROM products
    WHERE id IN (${placeholders}) AND is_honeypot = 0
  `).all(...ids);

  // Convert to object for easier lookup
  const priceMap = {};
  prices.forEach(p => {
    priceMap[p.id] = p.price;
  });

  res.json({
    prices: priceMap,
    timestamp: Date.now()
  });
});

// Hidden API endpoint (trap)
router.get('/api/all-prices', (req, res) => {
  // Log honeypot trigger
  const ip = req.ip || req.connection.remoteAddress;
  db.prepare(`
    INSERT INTO honeypot_logs (team_id, ip_address, trap_type)
    VALUES (?, ?, ?)
  `).run(req.query.team_id || 'unknown', ip, 'level2_all_prices_api');

  // Return fake data
  res.json({
    warning: 'This endpoint is monitored',
    prices: { 1: 0.01, 2: 0.01, 3: 0.01 }
  });
});

module.exports = router;
