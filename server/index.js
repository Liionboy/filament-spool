const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const { sendLowFilamentAlert } = require('./email-service');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Database connection
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../db/inventory.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error connecting to database:', err);
    } else {
        console.log('Connected to SQLite database');
    }
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(
            'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
            [username, email, hashedPassword],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ error: 'Username or email already exists' });
                    }
                    return res.status(500).json({ error: 'Failed to create user' });
                }

                // Add default quick brands for new user
                const defaultBrands = ['Prusament', 'Hatchbox', 'eSUN', 'Polymaker', 'Overture'];
                const userId = this.lastID;

                defaultBrands.forEach(brand => {
                    db.run('INSERT INTO quick_brands (user_id, brand) VALUES (?, ?)', [userId, brand]);
                });

                const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '7d' });
                res.status(201).json({ token, user: { id: userId, username, email } });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    db.get(
        'SELECT * FROM users WHERE username = ? OR email = ?',
        [username, username],
        async (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Server error' });
            }

            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const token = jwt.sign(
                { userId: user.id, username: user.username },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            res.json({
                token,
                user: { id: user.id, username: user.username, email: user.email }
            });
        }
    );
});

// Filament Routes
app.get('/api/filaments', authenticateToken, (req, res) => {
    db.all(
        'SELECT * FROM filaments WHERE user_id = ? ORDER BY created_at DESC',
        [req.user.userId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch filaments' });
            }
            res.json(rows);
        }
    );
});

app.post('/api/filaments', authenticateToken, (req, res) => {
    const { material, color_name, color, brand, total_weight, remaining_weight, price } = req.body;

    if (!material || !color_name || !color || !brand || !total_weight) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    db.run(
        `INSERT INTO filaments (user_id, material, color_name, color, brand, total_weight, remaining_weight, price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.userId, material, color_name, color, brand, total_weight, remaining_weight || total_weight, price || 0],
        function (err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to add filament' });
            }

            // Add brand to quick brands if not exists
            db.run(
                'INSERT OR IGNORE INTO quick_brands (user_id, brand) VALUES (?, ?)',
                [req.user.userId, brand]
            );

            db.get('SELECT * FROM filaments WHERE id = ?', [this.lastID], (err, row) => {
                if (err) {
                    return res.status(500).json({ error: 'Failed to fetch created filament' });
                }
                res.status(201).json(row);
            });
        }
    );
});

app.put('/api/filaments/:id', authenticateToken, (req, res) => {
    const { remaining_weight } = req.body;
    const filamentId = req.params.id;

    db.run(
        'UPDATE filaments SET remaining_weight = ? WHERE id = ? AND user_id = ?',
        [remaining_weight, filamentId, req.user.userId],
        function (err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to update filament' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Filament not found' });
            }

            db.get('SELECT * FROM filaments WHERE id = ?', [filamentId], (err, row) => {
                if (!err && row) {
                    // Check for low filament alert on manual update too
                    const threshold = parseInt(process.env.LOW_FILAMENT_THRESHOLD) || 200;
                    if (row.remaining_weight <= threshold) {
                        sendLowFilamentAlert(row, row.remaining_weight);
                    }
                }
                res.json(row);
            });
        }
    );
});

app.delete('/api/filaments/:id', authenticateToken, (req, res) => {
    const filamentId = req.params.id;

    db.run(
        'DELETE FROM filaments WHERE id = ? AND user_id = ?',
        [filamentId, req.user.userId],
        function (err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to delete filament' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Filament not found' });
            }
            res.json({ message: 'Filament deleted' });
        }
    );
});

// Quick Brands Routes
app.get('/api/brands', authenticateToken, (req, res) => {
    db.all(
        'SELECT brand FROM quick_brands WHERE user_id = ? ORDER BY brand',
        [req.user.userId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch brands' });
            }
            res.json(rows.map(r => r.brand));
        }
    );
});

app.post('/api/brands', authenticateToken, (req, res) => {
    const { brand } = req.body;

    if (!brand) {
        return res.status(400).json({ error: 'Brand name required' });
    }

    db.run(
        'INSERT OR IGNORE INTO quick_brands (user_id, brand) VALUES (?, ?)',
        [req.user.userId, brand],
        function (err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to add brand' });
            }
            res.status(201).json({ brand });
        }
    );
});

app.delete('/api/brands/:brand', authenticateToken, (req, res) => {
    const brand = decodeURIComponent(req.params.brand);

    db.run(
        'DELETE FROM quick_brands WHERE user_id = ? AND brand = ?',
        [req.user.userId, brand],
        function (err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to remove brand' });
            }
            res.json({ message: 'Brand removed' });
        }
    );
});

// Print History Routes
app.get('/api/prints', authenticateToken, (req, res) => {
    db.all(
        `SELECT ph.*, f.remaining_weight as current_remaining
         FROM print_history ph
         LEFT JOIN filaments f ON ph.filament_id = f.id
         WHERE ph.user_id = ?
         ORDER BY ph.created_at DESC`,
        [req.user.userId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch print history' });
            }

            // Fetch details for each print's filaments
            const printIds = rows.map(r => r.id);
            if (printIds.length === 0) return res.json([]);

            const placeholders = printIds.map(() => '?').join(',');
            db.all(
                `SELECT * FROM print_filaments WHERE print_id IN (${placeholders})`,
                printIds,
                (err, filaments) => {
                    if (err) {
                        return res.status(500).json({ error: 'Failed to fetch print filaments' });
                    }

                    const printsWithFilaments = rows.map(print => {
                        const usedFilaments = filaments.filter(f => f.print_id === print.id);
                        return { ...print, filaments: usedFilaments };
                    });

                    res.json(printsWithFilaments);
                }
            );
        }
    );
});

app.post('/api/prints', authenticateToken, async (req, res) => {
    const { name, filaments: usedFilaments } = req.body;

    if (!name || !usedFilaments || !Array.isArray(usedFilaments) || usedFilaments.length === 0) {
        return res.status(400).json({ error: 'Missing required fields or invalid filaments data' });
    }

    try {
        // Use a transaction for consistency
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            let totalWeight = 0;
            let totalCost = 0;
            const processedFilaments = [];

            // Helper to process filaments sequentially
            const processFilaments = async () => {
                for (const item of usedFilaments) {
                    const filament = await new Promise((resolve, reject) => {
                        db.get('SELECT * FROM filaments WHERE id = ? AND user_id = ?', [item.filament_id, req.user.userId], (err, row) => {
                            if (err) reject(err);
                            else resolve(row);
                        });
                    });

                    if (!filament) throw new Error(`Filament ${item.filament_id} not found`);
                    if (item.weight_used > filament.remaining_weight) throw new Error(`Not enough filament remaining in ${filament.brand} ${filament.color_name}`);

                    const newWeight = filament.remaining_weight - item.weight_used;
                    let printCost = (filament.price / filament.total_weight) * item.weight_used;

                    db.run('UPDATE filaments SET remaining_weight = ? WHERE id = ?', [newWeight, item.filament_id]);

                    totalWeight += item.weight_used;
                    totalCost += printCost;
                    processedFilaments.push({
                        filament_id: item.filament_id,
                        material: filament.material,
                        brand: filament.brand,
                        color_name: filament.color_name,
                        color: filament.color,
                        weight_used: item.weight_used,
                        cost: printCost
                    });

                    // Check for low filament
                    const threshold = parseInt(process.env.LOW_FILAMENT_THRESHOLD) || 200;
                    if (newWeight <= threshold) {
                        sendLowFilamentAlert(filament, newWeight);
                    }
                }
            };

            processFilaments().then(() => {
                // Primary filament for backward compatibility (the first one)
                const main = processedFilaments[0];

                db.run(
                    `INSERT INTO print_history (user_id, name, filament_id, material, brand, color_name, color, weight_used, cost)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [req.user.userId, name, main.filament_id, main.material, main.brand, main.color_name, main.color, totalWeight, totalCost],
                    function (err) {
                        if (err) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Failed to log print' });
                        }

                        const printId = this.lastID;
                        const stmt = db.prepare(`INSERT INTO print_filaments (print_id, filament_id, material, brand, color_name, color, weight_used, cost)
                                               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

                        processedFilaments.forEach(f => {
                            stmt.run([printId, f.filament_id, f.material, f.brand, f.color_name, f.color, f.weight_used, f.cost]);
                        });

                        stmt.finalize();
                        db.run('COMMIT');

                        db.get('SELECT * FROM print_history WHERE id = ?', [printId], (err, row) => {
                            res.status(201).json({ ...row, filaments: processedFilaments });
                        });
                    }
                );
            }).catch(err => {
                db.run('ROLLBACK');
                res.status(400).json({ error: err.message });
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Stats Route
app.get('/api/stats', authenticateToken, (req, res) => {
    db.get(
        `SELECT COUNT(*) as total_spools,
                SUM(remaining_weight) as total_weight,
                COUNT(DISTINCT material) as material_types,
                SUM((remaining_weight * 1.0 / total_weight) * price) as total_value,
                SUM(price) as total_spent
         FROM filaments WHERE user_id = ?`,
        [req.user.userId],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch stats' });
            }
            res.json({
                totalSpools: row.total_spools || 0,
                totalWeight: row.total_weight || 0,
                materialTypes: row.material_types || 0,
                totalValue: row.total_value || 0,
                totalSpent: row.total_spent || 0
            });
        }
    );
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API available at http://localhost:${PORT}/api`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('Database connection closed');
        process.exit(0);
    });
});
