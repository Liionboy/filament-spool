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
                alert_email TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    // Migration: Add alert_email to users table if it doesn't exist
    await new Promise((resolve) => {
        db.run('ALTER TABLE users ADD COLUMN alert_email TEXT', (err) => {
            if (err) {
                if (err.message.includes('duplicate column name')) {
                    console.log('alert_email column already exists.');
                } else {
                    console.error('Migration error (alert_email):', err.message);
                }
            } else {
                console.log('Added alert_email column to users table.');
            }
            resolve();
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

    // Create printers table
    await new Promise((resolve, reject) => {
        db.run(`
            CREATE TABLE IF NOT EXISTS printers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                model TEXT,
                type TEXT DEFAULT 'FDM',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    // Create suppliers table
    await new Promise((resolve, reject) => {
        db.run(`
            CREATE TABLE IF NOT EXISTS suppliers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                url TEXT,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    // Add supplier_id to filaments if it doesn't exist
    await new Promise((resolve) => {
        db.run('ALTER TABLE filaments ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL', (err) => {
            if (err) {
                if (err.message.includes('duplicate column name')) {
                    console.log('supplier_id column already exists.');
                } else {
                    console.error('Migration error (supplier_id):', err.message);
                }
            } else {
                console.log('Added supplier_id column to filaments.');
            }
            resolve();
        });
    });

    // Add push_subscription to users if it doesn't exist
    await new Promise((resolve) => {
        db.run('ALTER TABLE users ADD COLUMN push_subscription TEXT', (err) => {
            if (err) {
                if (err.message.includes('duplicate column name')) {
                    console.log('push_subscription column already exists.');
                } else {
                    console.error('Migration error (push_subscription):', err.message);
                }
            } else {
                console.log('Added push_subscription column to users.');
            }
            resolve();
        });
    });

    // Add printer_id to print_history if it doesn't exist
    await new Promise((resolve) => {
        db.run('ALTER TABLE print_history ADD COLUMN printer_id INTEGER REFERENCES printers(id) ON DELETE SET NULL', (err) => {
            if (err) {
                if (err.message.includes('duplicate column name')) {
                    console.log('printer_id column already exists.');
                } else {
                    console.error('Migration error (printer_id):', err.message);
                }
            } else {
                console.log('Added printer_id column to print_history.');
            }
            resolve();
        });
    });

    // FEATURE 1: Add location column to filaments table
    await new Promise((resolve) => {
        db.run('ALTER TABLE filaments ADD COLUMN location TEXT', (err) => {
            if (err) {
                if (err.message.includes('duplicate column name')) {
                    console.log('location column already exists.');
                } else {
                    console.error('Migration error (location):', err.message);
                }
            } else {
                console.log('Added location column to filaments.');
            }
            resolve();
        });
    });

    // FEATURE 2: Add notes column to filaments table
    await new Promise((resolve) => {
        db.run('ALTER TABLE filaments ADD COLUMN notes TEXT', (err) => {
            if (err) {
                if (err.message.includes('duplicate column name')) {
                    console.log('notes column already exists.');
                } else {
                    console.error('Migration error (notes):', err.message);
                }
            } else {
                console.log('Added notes column to filaments.');
            }
            resolve();
        });
    });

    // FEATURE 4: Add currency and exchange_rate to users table
    await new Promise((resolve) => {
        db.run('ALTER TABLE users ADD COLUMN currency TEXT DEFAULT "EUR"', (err) => {
            if (err) {
                if (err.message.includes('duplicate column name')) {
                    console.log('currency column already exists.');
                } else {
                    console.error('Migration error (currency):', err.message);
                }
            } else {
                console.log('Added currency column to users.');
            }
            resolve();
        });
    });

    await new Promise((resolve) => {
        db.run('ALTER TABLE users ADD COLUMN exchange_rate REAL DEFAULT 5.0', (err) => {
            if (err) {
                if (err.message.includes('duplicate column name')) {
                    console.log('exchange_rate column already exists.');
                } else {
                    console.error('Migration error (exchange_rate):', err.message);
                }
            } else {
                console.log('Added exchange_rate column to users.');
            }
            resolve();
        });
    });

    // FEATURE 5: Add low_stock_threshold to users table
    await new Promise((resolve) => {
        db.run('ALTER TABLE users ADD COLUMN low_stock_threshold INTEGER DEFAULT 200', (err) => {
            if (err) {
                if (err.message.includes('duplicate column name')) {
                    console.log('low_stock_threshold column already exists.');
                } else {
                    console.error('Migration error (low_stock_threshold):', err.message);
                }
            } else {
                console.log('Added low_stock_threshold column to users.');
            }
            resolve();
        });
    });

    // FEATURE 7: Add tare_weight column to filaments table
    await new Promise((resolve) => {
        db.run('ALTER TABLE filaments ADD COLUMN tare_weight REAL DEFAULT 0', (err) => {
            if (err) {
                if (err.message.includes('duplicate column name')) {
                    console.log('tare_weight column already exists.');
                } else {
                    console.error('Migration error (tare_weight):', err.message);
                }
            } else {
                console.log('Added tare_weight column to filaments.');
            }
            resolve();
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
