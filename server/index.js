const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const { sendLowFilamentAlert } = require('./email-service');
const QRCode = require('qrcode');

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
            'INSERT INTO users (username, email, password, alert_email) VALUES (?, ?, ?, ?)',
            [username, email, hashedPassword, email],
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
                user: { id: user.id, username: user.username, email: user.email, alertEmail: user.alert_email }
            });
        }
    );
});

// User Settings Routes
app.get('/api/user/settings', authenticateToken, (req, res) => {
    db.get('SELECT alert_email FROM users WHERE id = ?', [req.user.userId], (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to fetch settings' });
        }
        res.json({ alertEmail: row.alert_email });
    });
});

app.put('/api/user/settings', authenticateToken, (req, res) => {
    const { alertEmail } = req.body;
    if (!alertEmail) {
        return res.status(400).json({ error: 'Alert email is required' });
    }

    db.run('UPDATE users SET alert_email = ? WHERE id = ?', [alertEmail, req.user.userId], function (err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to update settings' });
        }
        res.json({ success: true, message: 'Settings updated' });
    });
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
    const { material, color_name, color, brand, total_weight, remaining_weight, price, supplier_id } = req.body;

    if (!material || !color_name || !color || !brand || !total_weight) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    db.run(
        `INSERT INTO filaments (user_id, material, color_name, color, brand, total_weight, remaining_weight, price, supplier_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.userId, material, color_name, color, brand, total_weight, remaining_weight || total_weight, price || 0, supplier_id || null],
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
    const { remaining_weight, material, color_name, color, brand, total_weight, price, supplier_id } = req.body;
    const filamentId = req.params.id;

    // Build dynamic update
    const fields = [];
    const values = [];

    if (remaining_weight !== undefined) { fields.push('remaining_weight = ?'); values.push(remaining_weight); }
    if (material !== undefined) { fields.push('material = ?'); values.push(material); }
    if (color_name !== undefined) { fields.push('color_name = ?'); values.push(color_name); }
    if (color !== undefined) { fields.push('color = ?'); values.push(color); }
    if (brand !== undefined) { fields.push('brand = ?'); values.push(brand); }
    if (total_weight !== undefined) { fields.push('total_weight = ?'); values.push(total_weight); }
    if (price !== undefined) { fields.push('price = ?'); values.push(price); }
    if (supplier_id !== undefined) { fields.push('supplier_id = ?'); values.push(supplier_id || null); }

    if (fields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(filamentId, req.user.userId);

    db.run(
        `UPDATE filaments SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
        values,
        function (err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to update filament' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Filament not found' });
            }

            db.get('SELECT f.*, u.alert_email FROM filaments f JOIN users u ON f.user_id = u.id WHERE f.id = ?', [filamentId], (err, row) => {
                if (!err && row) {
                    const threshold = parseInt(process.env.LOW_FILAMENT_THRESHOLD) || 200;
                    if (row.remaining_weight <= threshold) {
                        sendLowFilamentAlert(row, row.remaining_weight, row.alert_email);
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
    const { name, filaments: usedFilaments, printer_id } = req.body;

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
                        db.get('SELECT alert_email FROM users WHERE id = ?', [req.user.userId], (err, user) => {
                            if (!err && user) {
                                sendLowFilamentAlert(filament, newWeight, user.alert_email);
                            } else {
                                sendLowFilamentAlert(filament, newWeight);
                            }
                        });
                    }
                }
            };

            processFilaments().then(() => {
                // Primary filament for backward compatibility (the first one)
                const main = processedFilaments[0];

                db.run(
                    `INSERT INTO print_history (user_id, name, filament_id, material, brand, color_name, color, weight_used, cost, printer_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [req.user.userId, name, main.filament_id, main.material, main.brand, main.color_name, main.color, totalWeight, totalCost, printer_id || null],
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

app.delete('/api/prints/:id', authenticateToken, (req, res) => {
    const printId = req.params.id;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // 1. Get filaments used in this print
        db.all('SELECT filament_id, weight_used FROM print_filaments WHERE print_id = ?', [printId], (err, usedFilaments) => {
            if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Failed to find print details' });
            }

            try {
                // 2. Restore weights to each filament
                const updatePromises = usedFilaments.map(item => {
                    return new Promise((resolve, reject) => {
                        db.run(
                            'UPDATE filaments SET remaining_weight = remaining_weight + ? WHERE id = ? AND user_id = ?',
                            [item.weight_used, item.filament_id, req.user.userId],
                            function (err) {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });
                });

                Promise.all(updatePromises)
                    .then(() => {
                        // 3. Delete from print_filaments and print_history
                        db.run('DELETE FROM print_filaments WHERE print_id = ?', [printId], (err) => {
                            if (err) {
                                db.run('ROLLBACK');
                                return res.status(500).json({ error: 'Failed to delete print filaments' });
                            }

                            db.run('DELETE FROM print_history WHERE id = ? AND user_id = ?', [printId, req.user.userId], (err) => {
                                if (err) {
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ error: 'Failed to delete print record' });
                                }

                                db.run('COMMIT');
                                res.json({ success: true, message: 'Print deleted and weight restored' });
                            });
                        });
                    })
                    .catch(err => {
                        db.run('ROLLBACK');
                        res.status(500).json({ error: 'Failed to restore weights' });
                    });
            } catch (err) {
                db.run('ROLLBACK');
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    });
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

// Printer Routes
app.get('/api/printers', authenticateToken, (req, res) => {
    db.all('SELECT * FROM printers WHERE user_id = ? ORDER BY name', [req.user.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch printers' });
        res.json(rows);
    });
});

app.post('/api/printers', authenticateToken, (req, res) => {
    const { name, model, type } = req.body;
    if (!name) return res.status(400).json({ error: 'Printer name required' });

    db.run('INSERT INTO printers (user_id, name, model, type) VALUES (?, ?, ?, ?)',
        [req.user.userId, name, model || '', type || 'FDM'],
        function (err) {
            if (err) return res.status(500).json({ error: 'Failed to add printer' });
            db.get('SELECT * FROM printers WHERE id = ?', [this.lastID], (err, row) => {
                res.status(201).json(row);
            });
        }
    );
});

app.delete('/api/printers/:id', authenticateToken, (req, res) => {
    db.run('DELETE FROM printers WHERE id = ? AND user_id = ?', [req.params.id, req.user.userId], function (err) {
        if (err) return res.status(500).json({ error: 'Failed to delete printer' });
        res.json({ message: 'Printer deleted' });
    });
});

// Supplier Routes
app.get('/api/suppliers', authenticateToken, (req, res) => {
    db.all('SELECT * FROM suppliers WHERE user_id = ? ORDER BY name', [req.user.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch suppliers' });
        res.json(rows);
    });
});

app.post('/api/suppliers', authenticateToken, (req, res) => {
    const { name, url, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Supplier name required' });

    db.run('INSERT INTO suppliers (user_id, name, url, notes) VALUES (?, ?, ?, ?)',
        [req.user.userId, name, url || '', notes || ''],
        function (err) {
            if (err) return res.status(500).json({ error: 'Failed to add supplier' });
            db.get('SELECT * FROM suppliers WHERE id = ?', [this.lastID], (err, row) => {
                res.status(201).json(row);
            });
        }
    );
});

app.put('/api/suppliers/:id', authenticateToken, (req, res) => {
    const { name, url, notes } = req.body;
    db.run('UPDATE suppliers SET name = ?, url = ?, notes = ? WHERE id = ? AND user_id = ?',
        [name, url, notes, req.params.id, req.user.userId],
        function (err) {
            if (err) return res.status(500).json({ error: 'Failed to update supplier' });
            db.get('SELECT * FROM suppliers WHERE id = ?', [req.params.id], (err, row) => {
                res.json(row);
            });
        }
    );
});

app.delete('/api/suppliers/:id', authenticateToken, (req, res) => {
    db.run('DELETE FROM suppliers WHERE id = ? AND user_id = ?', [req.params.id, req.user.userId], function (err) {
        if (err) return res.status(500).json({ error: 'Failed to delete supplier' });
        res.json({ message: 'Supplier deleted' });
    });
});

// Push Subscription Routes
app.post('/api/push/subscribe', authenticateToken, (req, res) => {
    const subscription = JSON.stringify(req.body.subscription);
    db.run('UPDATE users SET push_subscription = ? WHERE id = ?', [subscription, req.user.userId], function (err) {
        if (err) return res.status(500).json({ error: 'Failed to save subscription' });
        res.json({ success: true });
    });
});

app.post('/api/push/unsubscribe', authenticateToken, (req, res) => {
    db.run('UPDATE users SET push_subscription = NULL WHERE id = ?', [req.user.userId], function (err) {
        if (err) return res.status(500).json({ error: 'Failed to unsubscribe' });
        res.json({ success: true });
    });
});

// VAPID public key endpoint
app.get('/api/push/vapid-key', (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
});

// Analytics Route
app.get('/api/analytics', authenticateToken, (req, res) => {
    const userId = req.user.userId;
    const results = {};

    db.serialize(() => {
        // Monthly consumption (last 12 months)
        db.all(`SELECT strftime('%Y-%m', created_at) as month, 
                        SUM(weight_used) as total_weight, 
                        SUM(cost) as total_cost,
                        COUNT(*) as print_count
                 FROM print_history 
                 WHERE user_id = ? AND created_at >= date('now', '-12 months')
                 GROUP BY month ORDER BY month`, [userId], (err, monthly) => {
            results.monthly = monthly || [];

            // Top materials
            db.all(`SELECT material, COUNT(*) as count, SUM(weight_used) as total_weight
                     FROM print_history WHERE user_id = ?
                     GROUP BY material ORDER BY total_weight DESC LIMIT 10`, [userId], (err, materials) => {
                results.topMaterials = materials || [];

                // Top brands
                db.all(`SELECT brand, COUNT(*) as count, SUM(weight_used) as total_weight
                         FROM print_history WHERE user_id = ?
                         GROUP BY brand ORDER BY total_weight DESC LIMIT 10`, [userId], (err, brands) => {
                    results.topBrands = brands || [];

                    // Prints per printer
                    db.all(`SELECT p.name as printer_name, COUNT(ph.id) as print_count, 
                                   SUM(ph.weight_used) as total_weight
                             FROM print_history ph
                             LEFT JOIN printers p ON ph.printer_id = p.id
                             WHERE ph.user_id = ? AND ph.printer_id IS NOT NULL
                             GROUP BY ph.printer_id ORDER BY print_count DESC`, [userId], (err, printers) => {
                        results.printerStats = printers || [];

                        // Filament by color
                        db.all(`SELECT color_name, color, SUM(remaining_weight) as remaining, 
                                        COUNT(*) as spool_count
                                 FROM filaments WHERE user_id = ?
                                 GROUP BY color ORDER BY remaining DESC LIMIT 10`, [userId], (err, colors) => {
                            results.topColors = colors || [];

                            res.json(results);
                        });
                    });
                });
            });
        });
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// QR Code endpoint
app.get('/api/qr/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM filaments WHERE id = ?', [id], async (err, filament) => {
        if (err) {
            return res.status(500).json({ error: 'Server error' });
        }
        if (!filament) {
            return res.status(404).json({ error: 'Filament not found' });
        }
        try {
            // Generate QR code with the spool URL
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const qrUrl = `${baseUrl}/spool/${filament.id}`;
            const qrBuffer = await QRCode.toBuffer(qrUrl, {
                type: 'png',
                width: 256,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                }
            });
            res.writeHead(200, {
                'Content-Type': 'image/png',
                'Content-Length': qrBuffer.length,
                'Cache-Control': 'public, max-age=3600'
            });
            res.end(qrBuffer);
        } catch (error) {
            console.error('QR generation error:', error);
            res.status(500).json({ error: 'Failed to generate QR code' });
        }
    });
});

// Spool page (public view for QR code scanning)
app.get('/spool/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM filaments WHERE id = ?', [id], (err, filament) => {
        if (err || !filament) {
            return res.status(404).send('<html><body style="background:#1a1a2e;color:#e0e0e0;font-family:monospace;display:flex;justify-content:center;align-items:center;height:100vh;"><div style="text-align:center;"><h2>Spool not found</h2><p>The spool you are looking for does not exist.</p><a href="/" style="color:#00d4aa;">Go to Dashboard</a></div></body></html>');
        }
        res.send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${filament.brand} ${filament.material} - ${filament.color_name} | SPOOL</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #0f0f1a; color: #e0e0e0; font-family: 'Space Mono', monospace; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; }
        .card { background: rgba(255,255,255,0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 2rem; max-width: 400px; width: 100%; text-align: center; }
        .color-badge { width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 1rem; border: 3px solid rgba(255,255,255,0.2); }
        h1 { font-size: 1.2rem; margin-bottom: 0.5rem; }
        .meta { color: #888; font-size: 0.8rem; margin-bottom: 1.5rem; }
        .weight-bar { background: rgba(255,255,255,0.1); border-radius: 8px; height: 12px; overflow: hidden; margin-bottom: 0.5rem; }
        .weight-fill { height: 100%; background: linear-gradient(90deg, #00d4aa, #00ff88); border-radius: 8px; transition: width 0.3s; }
        .weight-text { font-size: 0.9rem; margin-bottom: 1rem; }
        .details { text-align: left; font-size: 0.8rem; line-height: 1.8; }
        .details span { color: #00d4aa; }
        .btn { display: inline-block; margin-top: 1.5rem; padding: 0.6rem 1.2rem; background: rgba(0,212,170,0.15); border: 1px solid rgba(0,212,170,0.3); border-radius: 8px; color: #00d4aa; text-decoration: none; font-size: 0.8rem; transition: all 0.2s; }
        .btn:hover { background: rgba(0,212,170,0.25); }
    </style>
</head>
<body>
    <div class="card">
        <div class="color-badge" style="background: ${filament.color_hex || '#888'};"></div>
        <h1>${filament.brand} ${filament.material}</h1>
        <div class="meta">${filament.color_name} — Spool #${filament.id}</div>
        <div class="weight-bar"><div class="weight-fill" style="width: ${Math.round((filament.remaining_weight / filament.total_weight) * 100)}%;"></div></div>
        <div class="weight-text">${Number(filament.remaining_weight).toFixed(0)}g / ${Number(filament.total_weight).toFixed(0)}g remaining</div>
        <div class="details">
            <strong>Details:</strong><br>
            Material: <span>${filament.material}</span><br>
            Color: <span>${filament.color_name}</span><br>
            Diameter: <span>${filament.diameter || '1.75'}mm</span><br>
            ${filament.price ? `Price: <span>€${Number(filament.price).toFixed(2)}</span><br>` : ''}
            ${filament.location ? `Location: <span>${filament.location}</span><br>` : ''}
        </div>
        <a href="/" class="btn">Open Dashboard</a>
    </div>
</body>
</html>`);
    });
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
