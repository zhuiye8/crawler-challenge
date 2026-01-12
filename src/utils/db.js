const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../../data/challenge.db');
let db;

try {
  db = new Database(dbPath);
} catch (e) {
  console.error('Database not found. Run: npm run init-db');
  process.exit(1);
}

module.exports = db;
