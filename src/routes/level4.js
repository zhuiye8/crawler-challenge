const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

/**
 * Level 4: Headless Browser + Slider Captcha (35 points)
 *
 * Challenge:
 * - JavaScript-rendered page (SPA-like)
 * - Browser fingerprint detection
 * - Slider captcha with trajectory validation
 * - Dynamic request signing
 */

// Captcha sessions storage (in production, use Redis)
const captchaSessions = new Map();

// Generate slider captcha
function generateCaptcha() {
  const id = uuidv4();
  const targetX = Math.floor(Math.random() * 200) + 50; // 50-250px

  captchaSessions.set(id, {
    targetX,
    created: Date.now(),
    attempts: 0
  });

  // Clean old sessions
  const now = Date.now();
  for (const [key, value] of captchaSessions) {
    if (now - value.created > 300000) { // 5 minutes
      captchaSessions.delete(key);
    }
  }

  return { id, targetX };
}

// Validate slider trajectory
function validateTrajectory(track, targetX) {
  if (!track || !Array.isArray(track) || track.length < 5) {
    return { valid: false, reason: 'Track too short' };
  }

  const lastPoint = track[track.length - 1];
  const endX = lastPoint.x;

  // The puzzle piece starts at 10px, so to reach targetX position,
  // the slider needs to move (targetX - 10) pixels
  const requiredMovement = targetX - 10;

  // Check if reached target (±8px tolerance for better UX)
  if (Math.abs(endX - requiredMovement) > 8) {
    return { valid: false, reason: 'Did not reach target' };
  }

  // Check total time (not instant) - must take at least 150ms
  const totalTime = track[track.length - 1].t - track[0].t;
  if (totalTime < 150) {
    return { valid: false, reason: 'Too fast (instant movement)' };
  }

  // For real humans, we do lighter checks:
  // 1. Check for some Y-axis variation OR time variation (humans can't be perfectly precise)
  const yValues = track.map(p => p.y);
  const yVariation = Math.max(...yValues) - Math.min(...yValues);

  // 2. Check speed isn't perfectly uniform
  const speeds = [];
  for (let i = 1; i < track.length; i++) {
    const dx = track[i].x - track[i-1].x;
    const dt = track[i].t - track[i-1].t;
    if (dt > 0) speeds.push(dx / dt);
  }

  // Calculate speed variance
  const avgSpeed = speeds.length > 0 ? speeds.reduce((a,b) => a+b, 0) / speeds.length : 0;
  const speedVariance = speeds.length > 0
    ? speeds.reduce((sum, s) => sum + Math.pow(s - avgSpeed, 2), 0) / speeds.length
    : 0;

  // Must have EITHER Y variation OR speed variation (humans have at least one)
  const hasYVariation = yVariation >= 0.5;
  const hasSpeedVariation = speedVariance > 0.0001;

  if (!hasYVariation && !hasSpeedVariation) {
    return { valid: false, reason: 'Movement too uniform (robotic)' };
  }

  return { valid: true, reason: 'OK' };
}

// Generate request signature
function generateSignature(productId, timestamp, secret) {
  return crypto.createHash('md5')
    .update(`${productId}${timestamp}${secret}`)
    .digest('hex');
}

// Secret key (exposed in obfuscated JS)
const SECRET_KEY = 'cr4wl3r_ch4ll3ng3_2025';

// Main page
router.get('/', (req, res) => {
  const captcha = generateCaptcha();
  res.render('level4/index', {
    captchaId: captcha.id,
    captchaTarget: captcha.targetX // Hidden in obfuscated JS
  });
});

// Verify captcha
router.post('/verify-captcha', (req, res) => {
  const { captchaId, track } = req.body;

  const session = captchaSessions.get(captchaId);
  if (!session) {
    return res.status(400).json({ success: false, error: 'Invalid or expired captcha' });
  }

  session.attempts++;
  if (session.attempts > 10) {
    captchaSessions.delete(captchaId);
    return res.status(429).json({ success: false, error: 'Too many attempts' });
  }

  const result = validateTrajectory(track, session.targetX);
  if (!result.valid) {
    return res.json({ success: false, error: result.reason });
  }

  // Generate access token
  const accessToken = uuidv4();
  session.accessToken = accessToken;

  res.json({ success: true, accessToken });
});

// Get products (requires valid captcha token)
router.get('/api/products', (req, res) => {
  const { captchaId, token, productId, timestamp, sign } = req.query;

  // Verify captcha session
  const session = captchaSessions.get(captchaId);
  if (!session || session.accessToken !== token) {
    return res.status(403).json({ error: 'Invalid access token. Complete captcha first.' });
  }

  // If requesting specific product, verify signature
  if (productId) {
    const expectedSign = generateSignature(productId, timestamp, SECRET_KEY);
    if (sign !== expectedSign) {
      return res.status(403).json({ error: 'Invalid signature' });
    }

    const product = db.prepare(`
      SELECT * FROM vip_products WHERE id = ?
    `).get(productId);

    return res.json({ product });
  }

  // Return all VIP products
  const products = db.prepare(`
    SELECT id, name, original_price, sale_price, discount_percent, stock, flash_sale_end
    FROM vip_products
  `).all();

  res.json({
    products,
    signature_hint: 'For individual products, use sign=md5(productId+timestamp+SECRET_KEY)'
  });
});

// Fingerprint check endpoint
router.post('/api/fingerprint', (req, res) => {
  const fp = req.body;

  const botScore = {
    webdriver: fp.webdriver ? 30 : 0,
    plugins: (fp.plugins || 0) < 3 ? 20 : 0,
    languages: (fp.languages || 0) < 2 ? 15 : 0,
    chrome: !fp.chrome ? 20 : 0,
    screenSize: !fp.screenWidth ? 15 : 0
  };

  const totalScore = Object.values(botScore).reduce((a, b) => a + b, 0);

  // Log if bot detected
  if (totalScore > 40) {
    db.prepare(`
      INSERT INTO honeypot_logs (team_id, ip_address, trap_type)
      VALUES (?, ?, ?)
    `).run(req.query.team_id || 'unknown', req.ip, 'level4_bot_fingerprint');
  }

  res.json({
    score: totalScore,
    isBot: totalScore > 40,
    details: botScore,
    requireCaptcha: totalScore > 30
  });
});

module.exports = router;
