const express = require('express');
const router = express.Router();
const db = require('../utils/db');

/**
 * Level 1: Static HTML Scraping (15 points)
 *
 * Challenge: Scrape 100 products from a static HTML table
 * - Basic HTTP request
 * - HTML parsing
 * - Data extraction
 *
 * Hidden challenges:
 * - 4 honeypot products (every 25th) have is_honeypot=1
 * - One hidden product in HTML comments
 */

router.get('/', (req, res) => {
  const products = db.prepare(`
    SELECT id, name, price, stock, sku, category
    FROM products
    WHERE is_honeypot = 0
    ORDER BY id
  `).all();

  // Get honeypot products (will be hidden with CSS)
  const honeypots = db.prepare(`
    SELECT id, name, price, stock, sku, category
    FROM products
    WHERE is_honeypot = 1
    ORDER BY id
  `).all();

  res.render('level1/index', {
    products,
    honeypots,
    totalCount: products.length
  });
});

// API endpoint for verification (not shown to contestants)
router.get('/verify', (req, res) => {
  const realProducts = db.prepare(`
    SELECT id, name, price, stock, sku, category
    FROM products
    WHERE is_honeypot = 0
    ORDER BY id
  `).all();

  res.json({
    expected_count: realProducts.length,
    sample: realProducts.slice(0, 3)
  });
});

module.exports = router;
