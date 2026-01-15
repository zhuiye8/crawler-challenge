const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

/**
 * Submission and Scoring API
 *
 * POST /api/register - Register a candidate and get task_id
 * POST /api/submit - Submit scraped data for scoring
 * GET /api/leaderboard - Get current leaderboard
 * GET /api/answers/:level - Get expected answers (admin only)
 */

// Helper function to generate unique task_id
function generateTaskId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'task_';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Register endpoint
router.post('/register', (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({
      success: false,
      error: '请提供姓名'
    });
  }

  // Validate name length
  if (name.length < 2 || name.length > 20) {
    return res.status(400).json({
      success: false,
      error: '姓名长度必须在2-20个字符之间'
    });
  }

  // Check if name already exists
  const existing = db.prepare('SELECT task_id, name, registered_at FROM tasks WHERE name = ?').get(name);

  if (existing) {
    return res.json({
      success: true,
      task_id: existing.task_id,
      name: existing.name,
      registered_at: existing.registered_at,
      is_new: false,
      message: '欢迎回来！你已经注册过了'
    });
  }

  // Generate unique task_id with retry
  let task_id;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    task_id = generateTaskId();
    try {
      const stmt = db.prepare('INSERT INTO tasks (task_id, name) VALUES (?, ?)');
      stmt.run(task_id, name);
      break;
    } catch (e) {
      if (e.code === 'SQLITE_CONSTRAINT') {
        attempts++;
        continue;
      }
      throw e;
    }
  }

  if (attempts >= maxAttempts) {
    return res.status(500).json({
      success: false,
      error: '生成唯一ID失败，请重试'
    });
  }

  // Create user account for Level 3
  const passwordHash = bcrypt.hashSync('test123', 10);
  try {
    db.prepare('INSERT INTO users (username, password_hash, team_name) VALUES (?, ?, ?)').run(task_id, passwordHash, name);

    // Get user_id
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(task_id);

    // Generate sample orders for this user
    if (user) {
      const productNames = [
        'Laptop Pro', 'Wireless Mouse', 'Keyboard Deluxe', 'Monitor 4K',
        'USB Cable', 'Phone Charger', 'Headphones', 'Webcam HD'
      ];
      const statuses = ['Completed', 'Shipped', 'Processing', 'Delivered'];

      const insertOrder = db.prepare(`
        INSERT INTO orders (user_id, product_name, quantity, total_price, status, order_date, is_fake)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      // Generate 5-8 real orders
      const numOrders = 5 + Math.floor(Math.random() * 4);
      for (let i = 0; i < numOrders; i++) {
        const productName = productNames[Math.floor(Math.random() * productNames.length)];
        const quantity = 1 + Math.floor(Math.random() * 3);
        const totalPrice = parseFloat((50 + Math.random() * 500).toFixed(2));
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const daysAgo = Math.floor(Math.random() * 30);
        const orderDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

        insertOrder.run(user.id, productName, quantity, totalPrice, status, orderDate, 0);
      }

      // Add 2-3 fake orders as traps
      const numFakeOrders = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < numFakeOrders; i++) {
        const productName = 'FAKE_' + productNames[Math.floor(Math.random() * productNames.length)];
        const quantity = 1;
        const totalPrice = 99999.99;  // Obviously fake price
        const status = 'Cancelled';
        const daysAgo = Math.floor(Math.random() * 30);
        const orderDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

        insertOrder.run(user.id, productName, quantity, totalPrice, status, orderDate, 1);
      }
    } else {
      throw new Error('Failed to create user record');
    }
  } catch (e) {
    console.error('Error creating user account:', e);
    // Clean up: rollback tasks table insert
    db.prepare('DELETE FROM tasks WHERE task_id = ?').run(task_id);
    return res.status(500).json({
      success: false,
      error: '创建用户账号失败: ' + e.message
    });
  }

  // Get the registered record
  const registered = db.prepare('SELECT task_id, name, registered_at FROM tasks WHERE task_id = ?').get(task_id);

  res.json({
    success: true,
    task_id: registered.task_id,
    name: registered.name,
    registered_at: registered.registered_at,
    is_new: true
  });
});

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

  // Check for honeypot data (only check specific fields)
  let honeypotTriggered = false;
  const honeypotNamePatterns = ['TRAP', 'FAKE_', 'DEBUG', 'SECRET', 'HIDDEN', 'TEST_'];

  for (const item of submitted) {
    // Check product/item name for honeypot patterns
    const name = (item.product_name || item.name || '').toUpperCase();
    if (honeypotNamePatterns.some(p => name.includes(p))) {
      honeypotTriggered = true;
      break;
    }

    // Check for abnormal prices (< 0 or > 10000)
    const price = item.total_price || item.price || 0;
    if (price < 0 || price > 10000) {
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
      if (exp) {
        let fieldMatches = 0;
        let totalFields = 4;  // id, product_name, quantity, total_price

        // Product name match (trim and case-insensitive)
        const expName = (exp.product_name || '').trim().toLowerCase();
        const subName = (sub.product_name || '').trim().toLowerCase();
        if (expName === subName) {
          fieldMatches++;
        }

        // Quantity match
        if (exp.quantity === sub.quantity) {
          fieldMatches++;
        }

        // Price match (tolerance 0.1 yuan)
        if (Math.abs(exp.total_price - (sub.total_price || 0)) < 0.1) {
          fieldMatches++;
        }

        // Status match (optional field)
        if (sub.status) {
          totalFields++;
          if (exp.status === sub.status) {
            fieldMatches++;
          }
        }

        matchCount += fieldMatches / totalFields;
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
  const { level, task_id, data } = req.body;

  if (!level || !task_id || !data) {
    return res.status(400).json({
      success: false,
      error: '缺少必要字段',
      required: ['level', 'task_id', 'data']
    });
  }

  if (level < 1 || level > 4) {
    return res.status(400).json({
      success: false,
      error: '无效的关卡级别（必须为1-4）'
    });
  }

  // Check submission count
  const submissionCount = db.prepare(`
    SELECT COUNT(*) as count FROM submissions
    WHERE task_id = ? AND level = ?
  `).get(task_id, level);

  if (submissionCount.count >= 5) {
    return res.status(429).json({
      success: false,
      error: '已达到最大提交次数（每关5次）',
      submissions_used: submissionCount.count,
      tip: '请仔细检查数据格式和内容后再提交'
    });
  }

  // Get user ID for level 3
  let userId = null;
  if (level === 3) {
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(task_id);
    if (user) userId = user.id;
  }

  // Get expected answers
  const expected = level === 3 ? EXPECTED_ANSWERS[level](userId) : EXPECTED_ANSWERS[level]();

  // Calculate score
  const result = calculateScore(level, data, expected, task_id);

  // Save submission
  db.prepare(`
    INSERT INTO submissions (task_id, level, score, max_score, details)
    VALUES (?, ?, ?, ?, ?)
  `).run(task_id, level, result.score, result.maxScore, JSON.stringify(result.details));

  // Emit to scoreboard
  const io = req.app.get('io');
  if (io) {
    io.emit('submission', {
      task_id,
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
      task_id,
      SUM(score) as total_score,
      COUNT(DISTINCT level) as levels_completed,
      MAX(submitted_at) as last_submission
    FROM (
      SELECT task_id, level, MAX(score) as score, MAX(submitted_at) as submitted_at
      FROM submissions
      GROUP BY task_id, level
    )
    GROUP BY task_id
    ORDER BY total_score DESC, last_submission ASC
    LIMIT 50
  `).all();

  res.json({ leaderboard });
});

// Honeypot trap endpoints
router.get('/trap/:type', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  db.prepare(`
    INSERT INTO honeypot_logs (task_id, ip_address, trap_type)
    VALUES (?, ?, ?)
  `).run(req.query.task_id || 'unknown', ip, `trap_link_${req.params.type}`);

  res.status(403).json({ error: '蜜罐陷阱已触发，此行为已被记录' });
});

// Admin: Get expected answers (protected)
router.get('/answers/:level', (req, res) => {
  const adminKey = req.query.admin_key;
  if (adminKey !== 'super_secret_admin_2025') {
    return res.status(403).json({ error: '未授权访问' });
  }

  const level = parseInt(req.params.level);
  if (level < 1 || level > 4) {
    return res.status(400).json({ error: '无效的关卡级别' });
  }

  const answers = EXPECTED_ANSWERS[level](req.query.user_id);
  res.json({ level, expected_count: answers.length, answers });
});

module.exports = router;
