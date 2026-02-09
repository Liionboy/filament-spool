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
            res.json(rows);
        }
    );
});

app.post('/api/prints', authenticateToken, (req, res) => {
    const { name, filament_id, weight_used, cost } = req.body;

    if (!name || !filament_id || !weight_used) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get filament details
    db.get(
        'SELECT * FROM filaments WHERE id = ? AND user_id = ?',
        [filament_id, req.user.userId],
        (err, filament) => {
            if (err || !filament) {
                return res.status(404).json({ error: 'Filament not found' });
            }

            if (weight_used > filament.remaining_weight) {
                return res.status(400).json({ error: 'Not enough filament remaining' });
            }

            // Update filament weight
            const newWeight = filament.remaining_weight - weight_used;
            db.run(
                'UPDATE filaments SET remaining_weight = ? WHERE id = ?',
                [newWeight, filament_id]
            );

            // Calculate cost if price exists
            let printCost = cost || 0;
            if (filament.price && !cost) {
                printCost = (filament.price / filament.total_weight) * weight_used;
            }

            // Add to history
            db.run(
                `INSERT INTO print_history (user_id, name, filament_id, material, brand, color_name, color, weight_used, cost)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [req.user.userId, name, filament_id, filament.material, filament.brand,
                filament.color_name, filament.color, weight_used, printCost],
                function (err) {
                    if (err) {
                        return res.status(500).json({ error: 'Failed to log print' });
                    }

                    db.get('SELECT * FROM print_history WHERE id = ?', [this.lastID], (err, row) => {
                        if (err) {
                            return res.status(500).json({ error: 'Failed to fetch created print' });
                        }

                        // Check for low filament
                        const threshold = parseInt(process.env.LOW_FILAMENT_THRESHOLD) || 200;
                        if (newWeight <= threshold) {
                            db.get('SELECT * FROM filaments WHERE id = ?', [filament_id], (err, filament) => {
                                if (!err && filament) {
                                    sendLowFilamentAlert(filament, newWeight);
                                }
                            });
                        }

                        res.status(201).json({ ...row, current_remaining: newWeight });
                    });
                }
            );
        }
    );
});

// Stats Route
app.get('/api/stats', authenticateToken, (req, res) => {
    db.get(
        `SELECT COUNT(*) as total_spools,
                SUM(remaining_weight) as total_weight,
                COUNT(DISTINCT material) as material_types,
                SUM((remaining_weight * 1.0 / total_weight) * price) as total_value
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
                totalValue: row.total_value || 0
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
