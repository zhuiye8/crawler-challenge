const express = require('express');
const router = express.Router();
const db = require('../utils/db');

/**
 * Submission and Scoring API
 *
 * POST /api/submit - Submit scraped data for scoring
 * GET /api/leaderboard - Get current leaderboard
 * GET /api/answers/:level - Get expected answers (admin only)
 */

// Expected answers for each level
const EXPECTED_ANSWERS = {
  1: () => {
    // Level 1: 96 real products (100 - 4 honeypots)
    return db.prepare(`
      SELECT id, name, price, stock, sku, category
      FROM products
      WHERE is_honeypot = 0
      ORDER BY id
    `).all();
  },
  2: () => {
    // Level 2: Same products with prices
    return db.prepare(`
      SELECT id, name, price, stock, sku, category
      FROM products
      WHERE is_honeypot = 0
      ORDER BY id
    `).all();
  },
  3: (userId) => {
    // Level 3: Real orders only (no fake orders)
    return db.prepare(`
      SELECT id, product_name, quantity, total_price, status, order_date
      FROM orders
      WHERE user_id = ? AND is_fake = 0
      ORDER BY order_date DESC
    `).all(userId);
  },
  4: () => {
    // Level 4: VIP products with secret codes
    return db.prepare(`
      SELECT id, name, original_price, sale_price, discount_percent, stock, secret_code
      FROM vip_products
    `).all();
  }
};

// Score calculation
function calculateScore(level, submitted, expected, teamId) {
  const maxScores = { 1: 15, 2: 25, 3: 25, 4: 35 };
  const maxScore = maxScores[level] || 0;

  let score = 0;
  let details = {
    completeness: 0,
    accuracy: 0,
    no_honeypot: 0,
    bonus: 0
  };

  if (!Array.isArray(submitted) || submitted.length === 0) {
    return { score: 0, maxScore, details, honeypot_triggered: false };
  }

  // Check for honeypot data
  let honeypotTriggered = false;
  const honeypotPatterns = ['TRAP', 'FAKE_', 'DEBUG', 'SECRET', 'HIDDEN', '999999'];

  for (const item of submitted) {
    const itemStr = JSON.stringify(item).toUpperCase();
    if (honeypotPatterns.some(p => itemStr.includes(p))) {
      honeypotTriggered = true;
      break;
    }
  }

  // Completeness (30% of max score)
  const completenessRatio = Math.min(submitted.length / expected.length, 1);
  details.completeness = Math.round(maxScore * 0.3 * completenessRatio);

  // Accuracy (40% of max score)
  let matchCount = 0;
  const expectedMap = new Map();

  if (level === 1 || level === 2) {
    expected.forEach(e => expectedMap.set(e.id, e));
    for (const sub of submitted) {
      const exp = expectedMap.get(sub.id);
      if (exp) {
        let fieldMatches = 0;
        if (exp.name === sub.name) fieldMatches++;
        if (Math.abs(exp.price - (sub.price || 0)) < 0.01) fieldMatches++;
        if (exp.stock === sub.stock) fieldMatches++;
        if (exp.sku === sub.sku) fieldMatches++;
        matchCount += fieldMatches / 4;
      }
    }
  } else if (level === 3) {
    expected.forEach(e => expectedMap.set(e.id, e));
    for (const sub of submitted) {
      const exp = expectedMap.get(sub.id);
      if (exp && exp.product_name === sub.product_name &&
          Math.abs(exp.total_price - (sub.total_price || 0)) < 0.01) {
        matchCount++;
      }
    }
  } else if (level === 4) {
    expected.forEach(e => expectedMap.set(e.id, e));
    for (const sub of submitted) {
      const exp = expectedMap.get(sub.id);
      if (exp) {
        let fieldMatches = 0;
        if (exp.name === sub.name) fieldMatches++;
        if (Math.abs(exp.sale_price - (sub.sale_price || 0)) < 0.01) fieldMatches++;
        if (exp.discount_percent === sub.discount_percent) fieldMatches++;
        matchCount += fieldMatches / 3;
      }
    }
  }

  const accuracyRatio = expected.length > 0 ? matchCount / expected.length : 0;
  details.accuracy = Math.round(maxScore * 0.4 * accuracyRatio);

  // No honeypot bonus (20% of max score)
  if (!honeypotTriggered) {
    details.no_honeypot = Math.round(maxScore * 0.2);
  }

  // Speed/early submission bonus (10% of max score) - simplified
  details.bonus = Math.round(maxScore * 0.1);

  score = details.completeness + details.accuracy + details.no_honeypot + details.bonus;

  return {
    score: Math.min(score, maxScore),
    maxScore,
    details,
    honeypot_triggered: honeypotTriggered
  };
}

// Submit endpoint
router.post('/submit', (req, res) => {
  const { level, team_id, data } = req.body;

  if (!level || !team_id || !data) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['level', 'team_id', 'data']
    });
  }

  if (level < 1 || level > 4) {
    return res.status(400).json({ error: 'Invalid level (1-4)' });
  }

  // Check submission count
  const submissionCount = db.prepare(`
    SELECT COUNT(*) as count FROM submissions
    WHERE team_id = ? AND level = ?
  `).get(team_id, level);

  if (submissionCount.count >= 5) {
    return res.status(429).json({
      error: 'Maximum submissions reached (5 per level)',
      submissions_used: submissionCount.count
    });
  }

  // Get user ID for level 3
  let userId = null;
  if (level === 3) {
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(team_id);
    if (user) userId = user.id;
  }

  // Get expected answers
  const expected = level === 3 ? EXPECTED_ANSWERS[level](userId) : EXPECTED_ANSWERS[level]();

  // Calculate score
  const result = calculateScore(level, data, expected, team_id);

  // Save submission
  db.prepare(`
    INSERT INTO submissions (team_id, level, score, max_score, details)
    VALUES (?, ?, ?, ?, ?)
  `).run(team_id, level, result.score, result.maxScore, JSON.stringify(result.details));

  // Emit to scoreboard
  const io = req.app.get('io');
  if (io) {
    io.emit('submission', {
      team_id,
      level,
      score: result.score,
      timestamp: Date.now()
    });
  }

  res.json({
    success: true,
    level,
    score: result.score,
    max_score: result.maxScore,
    details: result.details,
    honeypot_triggered: result.honeypot_triggered,
    submissions_remaining: 5 - submissionCount.count - 1
  });
});

// Leaderboard
router.get('/leaderboard', (req, res) => {
  const leaderboard = db.prepare(`
    SELECT
      team_id,
      SUM(score) as total_score,
      COUNT(DISTINCT level) as levels_completed,
      MAX(submitted_at) as last_submission
    FROM (
      SELECT team_id, level, MAX(score) as score, MAX(submitted_at) as submitted_at
      FROM submissions
      GROUP BY team_id, level
    )
    GROUP BY team_id
    ORDER BY total_score DESC, last_submission ASC
    LIMIT 50
  `).all();

  res.json({ leaderboard });
});

// Honeypot trap endpoints
router.get('/trap/:type', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  db.prepare(`
    INSERT INTO honeypot_logs (team_id, ip_address, trap_type)
    VALUES (?, ?, ?)
  `).run(req.query.team_id || 'unknown', ip, `trap_link_${req.params.type}`);

  res.status(403).json({ error: 'Honeypot triggered. This has been logged.' });
});

// Admin: Get expected answers (protected)
router.get('/answers/:level', (req, res) => {
  const adminKey = req.query.admin_key;
  if (adminKey !== 'super_secret_admin_2025') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const level = parseInt(req.params.level);
  if (level < 1 || level > 4) {
    return res.status(400).json({ error: 'Invalid level' });
  }

  const answers = EXPECTED_ANSWERS[level](req.query.user_id);
  res.json({ level, expected_count: answers.length, answers });
});

module.exports = router;
