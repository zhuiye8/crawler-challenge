const express = require('express');
const router = express.Router();
const db = require('../utils/db');

/**
 * Real-time Scoreboard
 */

router.get('/', (req, res) => {
  // Get leaderboard data
  const leaderboard = db.prepare(`
    SELECT
      team_id,
      SUM(score) as total_score,
      COUNT(DISTINCT level) as levels_completed,
      MAX(submitted_at) as last_submission,
      GROUP_CONCAT(DISTINCT level) as completed_levels
    FROM (
      SELECT team_id, level, MAX(score) as score, MAX(submitted_at) as submitted_at
      FROM submissions
      GROUP BY team_id, level
    )
    GROUP BY team_id
    ORDER BY total_score DESC, last_submission ASC
    LIMIT 50
  `).all();

  // Get level-specific scores for each team
  const detailedScores = {};
  leaderboard.forEach(team => {
    const scores = db.prepare(`
      SELECT level, MAX(score) as score
      FROM submissions
      WHERE team_id = ?
      GROUP BY level
    `).all(team.team_id);

    detailedScores[team.team_id] = {};
    scores.forEach(s => {
      detailedScores[team.team_id][s.level] = s.score;
    });
  });

  res.render('scoreboard', { leaderboard, detailedScores });
});

module.exports = router;
