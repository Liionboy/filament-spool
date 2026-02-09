const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../db/inventory.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    }
    console.log('Connected to SQLite database');
});

const initDatabase = async () => {
    // Enable foreign keys
    db.run('PRAGMA foreign_keys = ON');

    // Create users table
    await new Promise((resolve, reject) => {
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    // Create filaments table
    await new Promise((resolve, reject) => {
        db.run(`
            CREATE TABLE IF NOT EXISTS filaments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                material TEXT NOT NULL,
                color_name TEXT NOT NULL,
                color TEXT NOT NULL,
                brand TEXT NOT NULL,
                total_weight REAL NOT NULL,
                remaining_weight REAL NOT NULL,
                price REAL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    // Create quick_brands table
    await new Promise((resolve, reject) => {
        db.run(`
            CREATE TABLE IF NOT EXISTS quick_brands (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                brand TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id, brand)
            )
        `, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    // Create print_history table
    await new Promise((resolve, reject) => {
        db.run(`
            CREATE TABLE IF NOT EXISTS print_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                filament_id INTEGER,
                material TEXT NOT NULL,
                brand TEXT NOT NULL,
                color_name TEXT NOT NULL,
                color TEXT NOT NULL,
                weight_used REAL NOT NULL,
                cost REAL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (filament_id) REFERENCES filaments(id) ON DELETE SET NULL
            )
        `, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    // Create print_filaments table (for multicolor support)
    await new Promise((resolve, reject) => {
        db.run(`
            CREATE TABLE IF NOT EXISTS print_filaments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                print_id INTEGER NOT NULL,
                filament_id INTEGER,
                material TEXT NOT NULL,
                brand TEXT NOT NULL,
                color_name TEXT NOT NULL,
                color TEXT NOT NULL,
                weight_used REAL NOT NULL,
                cost REAL DEFAULT 0,
                FOREIGN KEY (print_id) REFERENCES print_history(id) ON DELETE CASCADE,
                FOREIGN KEY (filament_id) REFERENCES filaments(id) ON DELETE SET NULL
            )
        `, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    // Insert default brands for demo user (if we create one)
    console.log('Database initialized successfully!');
    db.close();
};

initDatabase().catch(err => {
    console.error('Database initialization failed:', err);
    db.close();
    process.exit(1);
});
