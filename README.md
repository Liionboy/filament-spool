# 🧶 SPOOL - Filament Inventory Manager

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-ready-blue.svg)](https://www.docker.com/)

A sleek, self-hosted web application to track your 3D printing filament inventory, monitor usage, and calculate printing costs.

---

## ✨ Features

- **Inventory Dashboard**: Overview of total spools, weight, and inventory value.
- **Smart Tracking**: Add filaments with material types, custom colors, and price tracking.
- **Print History**: Log your prints to automatically deduct used weight and calculate costs.
- **Quick Brands**: Save your favorite brands for fast inventory entry.
- **Authentication**: Secure multi-user support with JWT authentication.
- **Dark Mode UI**: A premium, "Space Mono" inspired aesthetic for your workshop.

## 🛠️ Tech Stack

- **Backend**: Node.js, Express
- **Database**: SQLite (Zero-config persistence)
- **Frontend**: Vanilla JS, Modern CSS (Glassmorphism design)
- **Auth**: JSON Web Tokens (JWT) & Bcrypt
- **Infrastructure**: Docker & Docker Compose support

---

## 🚀 Quick Start (Local)

### 1. Installation

```bash
git clone https://github.com/your-username/filament-spool.git
cd filament-spool
npm install
```

### 2. Configure Environment

Create a `.env` file from the template:

```bash
cp .env.example .env
```

Edit `.env` and configure the following variables:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `JWT_SECRET` | Secure key for password encryption and sessions | `your_random_secret_string` |
| `SMTP_HOST` | Outgoing email server for alerts | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port (usually 587 or 465) | `587` |
| `SMTP_USER` | Your email address | `alerts@gmail.com` |
| `SMTP_PASS` | Your email password or App Password | `xxxx xxxx xxxx xxxx` |
| `SMTP_FROM` | Display name for the sender | `SPOOL Inventory` |
| `NOTIFICATION_EMAIL` | Where alerts should be sent | `your-email@me.com` |

> [!IMPORTANT]
> For Gmail, you must use an **App Password** instead of your regular password. Enable 2FA first in your Google Account.

### 3. Initialize Database

```bash
node server/init-db.js
```

### 4. Run

```bash
npm start
```

Visit `http://localhost:3000`

---

## 🐳 Docker Deployment (Linux Server)

This app is optimized for server deployment using Docker and Nginx.

```bash
# Build and start the containers
docker-compose up -d --build
```

For detailed server setup, reverse proxy configuration, and SSL instructions, see the [Deployment Plan](deployment_plan.md).

---

## 📂 Project Structure

```text
├── server/             # Express API & DB logic
├── public/             # Integrated Frontend (JS/CSS/HTML)
├── db/                 # SQLite database storage (Volumes)
├── Dockerfile          # Production build config
└── docker-compose.yml  # Orchestration
```

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

*Happy Printing! 🛸*
