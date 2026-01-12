#!/bin/sh
set -e

# Initialize database if it doesn't exist
if [ ! -f /app/data/challenge.db ]; then
  echo "Initializing database..."
  npm run init-db
  echo "Database initialized successfully!"
fi

# Start the application
exec npm start
