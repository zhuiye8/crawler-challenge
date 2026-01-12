const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../../data/challenge.db');

// Check if database file exists
if (!fs.existsSync(dbPath)) {
  console.error('============================================');
  console.error('ERROR: Database not found!');
  console.error(`Expected at: ${dbPath}`);
  console.error('Run: npm run init-db');
  console.error('============================================');
  process.exit(1);
}

let db;
try {
  db = new Database(dbPath);
  console.log('Database connected successfully');
} catch (e) {
  console.error('Failed to open database:', e.message);
  process.exit(1);
}

module.exports = db;
