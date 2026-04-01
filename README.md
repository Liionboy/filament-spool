# 🧶 SPOOL - Filament Inventory Manager

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v20+-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-ready-blue.svg)](https://www.docker.com/)
[![API Docs](https://img.shields.io/badge/API-Swagger-blueviolet.svg)](/api/docs)

A sleek, self-hosted web application to track your 3D printing filament inventory, monitor usage, calculate printing costs, and generate QR codes for your spool rack.

<img width="1674" height="1031" alt="SPOOL Dashboard" src="https://github.com/user-attachments/assets/449d32b8-4047-4fab-bc21-ebd7047330a6" />

> **Note**: Dashboard screenshot shows the dark theme. A light theme toggle is also available.

---

## ✨ Features

### 📦 Inventory Management
- **Inventory Dashboard**: Overview of total spools, weight, and inventory value at a glance
- **Multicolor Support**: Log multiple filaments for a single print with real-time cost calculation
- **Smart Tracking**: Add filaments with material types, custom colors, and precise price tracking (€/lei)
- **Precision Logging**: Weights support 2 decimal places for accurate inventory management
- **Location Tracking**: Record where each spool is stored (shelf, box, room)
- **Spool Notes**: Add optional notes to each filament (e.g., "bought from eSun", "used for vase test")
- **Quick Brands**: Save your favorite brands for fast inventory entry

### 🖨️ Print Logging
- **Multi-Filament Prints**: Log complex prints that use multiple filament colors
- **Weight Restoration**: Delete print history logs to automatically restore subtracted weight to spools
- **Print Cost Calculation**: Real-time cost per print based on filament price and weight used
- **Printer Management**: Track which printer was used for each print job
- **Supplier Management**: Keep track of where you buy your filament

### 📊 Analytics & Insights
- **Monthly Cost Graph**: Visual bar chart showing printing costs over the last 12 months
- **Analytics Panel**: Top materials, top brands, printer usage stats, and color distribution
- **Multi-Currency Support**: Toggle between EUR (€) and RON (lei) with configurable exchange rate

### 🔍 Search, Filter & Compare
- **Full-Text Search**: Search across material, brand, color, location, and notes
- **Material Filters**: Quick filter by PLA, PETG, ABS, TPU, and other materials
- **Brand Filter**: Filter inventory by manufacturer
- **Sort Options**: Sort by name, remaining weight, price, percentage remaining, or date added
- **Spool Comparison**: Select 2-4 spools and compare side-by-side (weight %, price, cost/gram)
- **Low Stock Widget**: Prominent dashboard banner showing spools below your threshold

### 📱 QR Codes & Mobile
- **Per-Spool QR Codes**: Generate scannable QR code for each spool
- **Batch QR PDF**: Export all spool QR codes as a printable PDF with spool details
- **Public Spool Pages**: Scanning a QR code opens a mobile-friendly page with spool details
- **Responsive Design**: Works great on phones, tablets, and desktops

### ⚖️ Weight Estimation Helper
- **Scale Calculator**: Input tare weight (empty spool) + current scale weight to estimate remaining filament
- **Save Tare Weight**: Store the empty spool weight per filament for future reference
- **Per-Type Defaults**: Quickly set tare weights when adding new spools from the same brand

### 🎨 UI & Experience
- **Dark & Light Themes**: Toggle between themes, preference saved in localStorage
- **Glassmorphism Design**: Premium UI with frosted glass effects and smooth animations
- **SVG Filament Animations**: Each spool card shows an animated winding pattern in the filament's color
- **Low Stock Indicators**: Cards turn red with a badge when filament is running low
- **CSV Export/Import**: Backup and restore your entire inventory in one click
- **Push Notifications**: Browser push alerts for low filament levels (Web Push API)
- **PWA Ready**: Install as a progressive web app with offline caching

### 🔒 Security
- **JWT Authentication**: Secure multi-user support with encrypted passwords (bcrypt)
- **Per-User Data**: Each user has their own inventory, settings, and suppliers
- **Low Stock Alerts**: Configurable email alerts when filament drops below threshold

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js, Express |
| **Database** | SQLite (Zero-config persistence) |
| **Frontend** | Vanilla JS, Modern CSS (Glassmorphism) |
| **Auth** | JSON Web Tokens (JWT) & Bcrypt |
| **QR Codes** | qrcode (server-side generation) |
| **PDF Export** | PDFKit (batch QR code PDF) |
| **API Docs** | Swagger UI Express / swagger-jsdoc |
| **Notifications** | Web Push API (VAPID) |
| **Infrastructure** | Docker, Docker Compose, Nginx |

---

## 🚀 Quick Start (Local)

### 1. Clone & Install

```bash
git clone https://github.com/Liionboy/filament-spool.git
cd filament-spool
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your settings:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `JWT_SECRET` | Secret key for sessions | `your_random_secret_string` |
| `SMTP_HOST` | Email server for alerts | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `465` (SSL) or `587` (STARTTLS) |
| `SMTP_USER` | Email address | `alerts@example.com` |
| `SMTP_PASS` | Email password / App Password | `xxxx xxxx xxxx xxxx` |
| `SMTP_FROM_EMAIL` | From address | `alerts@example.com` |
| `ALERT_EMAIL` | Where alerts are sent | `your-email@me.com` |
| `LOW_FILAMENT_THRESHOLD` | Alert trigger (grams) | `200` |

> [!TIP]
> For Gmail, you must use an **App Password** instead of your regular password. Enable 2FA first.

### 3. Initialize & Run

```bash
node server/init-db.js
npm start
```

Visit **http://localhost:3000** 🎉

---

## 🐳 Docker Deployment

Perfect for homelab deployment:

```bash
docker-compose up -d --build
```

For full deployment guide (reverse proxy, SSL, Nginx), see [Deployment Plan](deployment_plan.md).

---

## 📡 API Documentation

Interactive Swagger UI is available at:

```
http://localhost:3000/api/docs
```

All endpoints require JWT authentication (except login/register). Use the "Authorize" button in Swagger UI to set your token.

### Quick API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Create a new account |
| `POST` | `/api/auth/login` | Login and get JWT token |
| `GET`  | `/api/filaments` | List all your spools |
| `POST` | `/api/filaments` | Add a new spool |
| `PUT`  | `/api/filaments/:id` | Update a spool |
| `DELETE` | `/api/filaments/:id` | Delete a spool |
| `GET`  | `/api/prints` | Print history |
| `POST` | `/api/prints` | Log a new print |
| `GET`  | `/api/qr/:id` | QR code image (PNG) |
| `GET`  | `/api/qr/batch` | Download all QR codes as PDF |
| `GET`  | `/spool/:id` | Public spool page (QR scan target) |
| `GET`  | `/api/stats` | Dashboard statistics |
| `GET`  | `/api/analytics` | Monthly costs & breakdown |
| `GET`  | `/api/user/settings` | Get user settings |
| `PUT`  | `/api/user/settings` | Update settings (currency, threshold, etc.) |

---

## 📂 Project Structure

```
├── server/
│   ├── index.js           # Express API server (all endpoints + Swagger)
│   ├── init-db.js         # Database initialization & migrations
│   └── email-service.js   # Low filament email alerts
├── public/
│   ├── index.html         # Full frontend (JS, CSS, HTML in one file)
│   ├── service-worker.js  # PWA offline caching
│   ├── manifest.json      # PWA manifest
│   └── icons/             # App icons
├── db/                    # SQLite database (gitignored in prod)
├── Dockerfile
├── docker-compose.yml
├── nginx.conf
├── entrypoint.sh
└── deployment_plan.md
```

---

## 📸 Screenshots

<details>
<summary>🖼️ Click to see what you'll get</summary>

- **Dashboard** — Spool cards with filament wind Animations, weight bars, and quick actions
- **QR Codes** — Per-spool QR modal + batch PDF print (3 columns per page)
- **Filters** — Material chips, brand dropdown, full-text search, sort options
- **Comparison** — Side-by-side panel with weight %, price, cost/gram
- **Analytics** — Monthly cost chart, top materials/brands, printer usage
- **Dark/Light Theme** — Toggle in the sidebar, preference saved locally
- **Weight Helper** — Calculator for estimated remaining from scale measurements
- **Settings** — Email, currency, exchange rate, low stock threshold

</details>

---

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

*Happy Printing! 🛸*
