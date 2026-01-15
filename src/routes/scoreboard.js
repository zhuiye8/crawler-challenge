const express = require('express');
const router = express.Router();
const db = require('../utils/db');

/**
 * Real-time Scoreboard
 */

router.get('/', (req, res) => {
  // Get leaderboard data with names from tasks table
  const leaderboard = db.prepare(`
    SELECT
      s.task_id,
      t.name,
      SUM(s.score) as total_score,
      COUNT(DISTINCT s.level) as levels_completed,
      MIN(s.submitted_at) as first_submission,
      MAX(s.submitted_at) as last_submission,
      GROUP_CONCAT(DISTINCT s.level ORDER BY s.level ASC) as completed_levels
    FROM (
      SELECT task_id, level, MAX(score) as score, MAX(submitted_at) as submitted_at
      FROM submissions
      GROUP BY task_id, level
    ) s
    LEFT JOIN tasks t ON s.task_id = t.task_id
    GROUP BY s.task_id
    ORDER BY total_score DESC, last_submission ASC
    LIMIT 50
  `).all();

  // Calculate elapsed time and get level-specific scores
  const detailedScores = {};
  leaderboard.forEach(record => {
    // Calculate elapsed time
    if (record.first_submission && record.last_submission) {
      const start = new Date(record.first_submission);
      const end = new Date(record.last_submission);
      const diffMs = end - start;
      const minutes = Math.floor(diffMs / 60000);
      const seconds = Math.floor((diffMs % 60000) / 1000);
      record.elapsed_time = `${minutes}分${seconds}秒`;
    } else {
      record.elapsed_time = '-';
    }

    // Get level-specific scores
    const scores = db.prepare(`
      SELECT level, MAX(score) as score
      FROM submissions
      WHERE task_id = ?
      GROUP BY level
    `).all(record.task_id);

    detailedScores[record.task_id] = {};
    scores.forEach(s => {
      detailedScores[record.task_id][s.level] = s.score;
    });
  });

  res.render('scoreboard', { leaderboard, detailedScores });
});

module.exports = router;
