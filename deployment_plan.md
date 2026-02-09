# Deployment Plan - Linux Server (Docker + Nginx)

This plan outlines the steps to move the Filament Inventory application from your local machine to a remote Linux server (e.g., Ubuntu, Debian) and host it securely.

## 📋 Prerequisites

- A Linux server with SSH access.
- Docker and Docker Compose installed.
- Nginx installed (as a reverse proxy).
- A domain name (optional but recommended for SSL).

---

## 🛠️ Phase 1: Server Preparation

### 1. Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Install Docker & Docker Compose

```bash
sudo apt install docker.io docker-compose -y
sudo systemctl enable --now docker
sudo usermod -aG docker $USER  # Log out and back in after this
```

### 3. Install Nginx

```bash
sudo apt install nginx -y
```

---

## 📂 Phase 2: Code Transfer (Using Git)

#### 1. Locally (on your computer)

Initialize the repository and push your code to GitHub.

```bash
git add .
git commit -m "Initial commit: Filament Inventory App"
git push origin main
```

#### 2. On the server

Download the code and enter the directory:

```bash
git clone <your-repo-url>
cd filament-inventory-api
```

---

## 🚀 Phase 3: Deployment

### 1. Configure Environment Variables

1. Create a `.env` file from the example:

   ```bash
   cp .env.example .env
   nano .env
   ```

2. **Key configurations**:
   - `JWT_SECRET`: Set a long random string.
   - `SMTP_HOST`: e.g., `smtp.gmail.com` or your Postfix host.
   - `SMTP_PORT`: `465` (SSL) or `587` (STARTTLS).
   - `SMTP_USER`: Your email address.
   - `SMTP_FROM_EMAIL`: Identical to `SMTP_USER`.
   - `ALERT_EMAIL`: Where you want to receive notifications.

### 2. Build and Start Containers

```bash
mkdir -p db
docker-compose up -d --build
```

### 3. Configure Nginx Reverse Proxy

1. Create a new Nginx config file:

   ```bash
   sudo nano /etc/nginx/sites-available/filament-inventory
   ```

2. Paste the provided `nginx.conf` content (adjusting `server_name` to your IP or domain).
3. Enable the site and restart Nginx:

   ```bash
   sudo ln -s /etc/nginx/sites-available/filament-inventory /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

---

## 🔒 Phase 4: Security (SSL)

Use Certbot to set up free SSL:

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

---

## 🔧 Maintenance

- **View logs**: `docker-compose logs -f`
- **Update app**: `git pull && docker-compose up -d --build`
- **Check SMTP**: `docker-compose logs -f | grep SMTP`
