#!/bin/sh

# Initialize the database if it doesn't exist
echo "Initializing database..."
node server/init-db.js

# Start the application
echo "Starting application..."
npm start
