# 📦 RSA Store - Complete Installation Guide

Detailed step-by-step installation guide for RSA Store e-commerce platform.

---

## 📋 Table of Contents

1. [System Requirements](#system-requirements)
2. [Server Setup](#server-setup)
3. [Installation Steps](#installation-steps)
4. [Configuration](#configuration)
5. [Bot Setup](#bot-setup)
6. [Production Deployment](#production-deployment)
7. [Post-Installation](#post-installation)

---

## 💻 System Requirements

### Minimum Requirements
- **OS**: Ubuntu 20.04+ / Debian 10+ / CentOS 7+
- **RAM**: 1GB minimum, 2GB recommended
- **Storage**: 5GB free space
- **CPU**: 1 core minimum, 2+ cores recommended

### Software Requirements
- **Node.js**: v16.0.0 or higher
- **Python**: 3.8 or higher
- **npm**: 7.0.0 or higher
- **pip3**: Latest version
- **PM2**: Latest version (for production)
- **Chromium**: Latest version (for WhatsApp bot)

---

## 🖥️ Server Setup

### 1. Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Install Node.js (v16+)

```bash
# Using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should be v16+
npm --version
```

### 3. Install Python 3.8+

```bash
# Usually pre-installed on Ubuntu 20.04+
python3 --version

# Install pip
sudo apt install -y python3-pip
pip3 --version
```

### 4. Install PM2

```bash
sudo npm install -g pm2

# Verify
pm2 --version
```

### 5. Install Chromium (for WhatsApp bot)

```bash
sudo apt install -y chromium-browser

# Or via snap
sudo snap install chromium

# Verify
chromium-browser --version
```

---

## 📥 Installation Steps

### Step 1: Clone Repository

```bash
# Create directory
mkdir -p ~/projects
cd ~/projects

# Clone from GitHub
git clone https://github.com/raistech/rsastore.git
cd rsastore
```

### Step 2: Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install Python dependencies
pip3 install -r requirements.txt

# Verify installations
npm list --depth=0
pip3 list | grep qrcode
```

### Step 3: Create Required Directories

```bash
# Create directories
mkdir -p uploads/products
mkdir -p uploads/blog
mkdir -p logs

# Set permissions
chmod 755 uploads
chmod 755 logs
```

### Step 4: Configure Environment

```bash
# Copy example file
cp .env.example .env

# Edit configuration
nano .env
```

**Required fields to configure:**
- `SESSION_SECRET` - Generate: `openssl rand -base64 32`
- `ADMIN_PASSWORD` - Choose strong password
- `SMTP_*` - Your email provider settings
- `QRIS_BASE_STRING` - From payment provider
- `WEBHOOK_API_KEY` - Generate: `openssl rand -hex 32`

### Step 5: Initialize Database

```bash
# Run database initialization
node database.js

# Verify database created
ls -lh rsastore.db

# Check tables
sqlite3 rsastore.db "SELECT name FROM sqlite_master WHERE type='table';"
```

### Step 6: Create Indexes (Performance)

```bash
node create-indexes.js
```

---

## ⚙️ Configuration

### Basic Configuration

Edit `.env` file:

```env
# Server
PORT=3000
BASE_URL=http://yourdomain.com
SESSION_SECRET=your-generated-secret

# Admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD=YourStrongPassword123!

# Database
DATABASE_PATH=./rsastore.db
```

### SMTP Email Setup

**Gmail Example:**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=xxxx-xxxx-xxxx-xxxx  # App password from Google
SMTP_FROM_NAME=RSA Store
SMTP_FROM_EMAIL=your-email@gmail.com
```

**Get Gmail App Password:**
1. Google Account → Security
2. Enable 2-Step Verification
3. App passwords → Generate
4. Select "Mail" and device
5. Copy 16-character password

### QRIS Payment Setup

Contact your bank or payment provider for QRIS base string.

**Supported Providers:**
- Bank BRI
- Bank Mandiri
- BCA
- BNI
- DANA
- OVO
- GoPay
- LinkAja
- ShopeePay

```env
QRIS_BASE_STRING=00020101021126680016COM.NOBUBANK.WWW...
QRIS_SERVICE_URL=http://localhost:3001
```

---

## 🤖 Bot Setup

### WhatsApp Bot

**1. Install Chromium (if not yet):**
```bash
sudo apt install -y chromium-browser
```

**2. Enable in Admin Panel:**
1. Start server: `pm2 start ecosystem.config.js`
2. Login: http://localhost:3000/admin/login
3. Go to: Bot Settings
4. Enable WhatsApp Bot
5. Wait for QR code (refresh page)
6. Open WhatsApp → Settings → Linked Devices
7. Scan QR code
8. Wait for "Connected" status

**3. Test:**
- Send "menu" to your WhatsApp (from bot number)
- Bot should reply with menu

### Telegram Bot

**1. Create Bot:**
```
1. Telegram → Search @BotFather
2. Send: /newbot
3. Follow instructions
4. Copy bot token
```

**2. Configure:**

**Option A: Via .env**
```env
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

**Option B: Via Admin Panel**
1. Admin Panel → Bot Settings
2. Paste token
3. Enable Telegram Bot
4. Save

**3. Test:**
- Search your bot on Telegram
- Send: /start
- Bot should reply with menu

---

## 🚀 Production Deployment

### 1. Firewall Configuration

```bash
# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow SSH (if needed)
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw enable
```

### 2. Reverse Proxy (Nginx)

```nginx
# /etc/nginx/sites-available/rsastore
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/rsastore /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 3. SSL Certificate (Let's Encrypt)

```bash
# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal
sudo systemctl enable certbot.timer
```

### 4. PM2 Startup Script

```bash
# Generate startup script
pm2 startup

# Run the command it outputs (with sudo)
# Example: sudo env PATH=...

# Save current process list
pm2 save

# Test reboot
sudo reboot
# After reboot, check: pm2 list
```

### 5. Log Rotation

```bash
# Install PM2 log rotate module
pm2 install pm2-logrotate

# Configure
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## 🔍 Post-Installation

### 1. Verify All Services

```bash
pm2 list

# Expected output:
# ✅ rsastore-main
# ✅ rsastore-qris
# ✅ rsastore-whatsapp-bot
# ✅ rsastore-telegram-bot
```

### 2. Test Web Access

```bash
curl http://localhost:3000
# Should return HTML

# Test admin
curl http://localhost:3000/admin/login
# Should return admin login page
```

### 3. Test QRIS Service

```bash
curl http://localhost:3001/health
# Should return: {"status":"ok"}
```

### 4. Test Bot APIs

```bash
# WhatsApp bot API
curl http://127.0.0.1:33418/health
# Should return bot status

# Test notification (if bot connected)
curl -X POST http://127.0.0.1:33418/test-notification \
  -H "Content-Type: application/json" \
  -d '{"phone_number":"08123456789"}'
```

### 5. Initial Admin Setup

1. Login: http://yourdomain.com/admin/login
2. Change default password
3. Configure settings:
   - Store info (name, description, logo)
   - SMTP settings (enable email)
   - QRIS settings (base string)
   - Payment webhook (API key)
4. Add categories
5. Add products
6. Configure bots (optional)

---

## 📊 Monitoring

### Health Checks

```bash
# All services
pm2 status

# Detailed monitoring
pm2 monit

# Resource usage
pm2 describe rsastore-main
```

### Set Up Monitoring Alerts

```bash
# Install PM2 monitoring module
pm2 install pm2-server-monit

# Or use external services:
# - UptimeRobot
# - Pingdom
# - New Relic
# - DataDog
```

### Database Maintenance

```bash
# Backup script (add to crontab)
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
cp ~/projects/rsastore/rsastore.db ~/backups/rsastore-$DATE.db
# Keep only last 7 days
find ~/backups -name "rsastore-*.db" -mtime +7 -delete

# Add to crontab
crontab -e
# Add line: 0 2 * * * /path/to/backup-script.sh
```

---

## 🔧 Maintenance

### Update Application

```bash
cd ~/projects/rsastore

# Pull latest changes
git pull

# Install new dependencies
npm install
pip3 install -r requirements.txt

# Restart services
pm2 restart ecosystem.config.js
```

### Database Migration

```bash
# Backup first!
cp rsastore.db rsastore.db.backup

# Run migration
node migrate.js  # If migration script exists

# Or manual:
sqlite3 rsastore.db < migrations/001-add-column.sql
```

---

## ❓ FAQ

**Q: Can I run without bots?**  
A: Yes! Bots are optional. Disable in admin panel.

**Q: Can I use MySQL/PostgreSQL instead of SQLite?**  
A: Currently SQLite only. Can be migrated with code changes.

**Q: How to add more payment methods?**  
A: Extend webhook handler in `server.js` and add payment integration.

**Q: Can I customize the design?**  
A: Yes! Edit templates in `views/` and CSS in `public/css/`

**Q: How to backup and restore?**  
A: Backup: `cp rsastore.db backup.db`  
   Restore: `cp backup.db rsastore.db` then restart services

**Q: How many products can it handle?**  
A: SQLite can handle 100K+ products. For more, consider PostgreSQL.

**Q: Is it mobile responsive?**  
A: Yes! All pages are mobile-optimized.

---

## 🆘 Need Help?

1. **Check Logs** - `pm2 logs`
2. **GitHub Issues** - Open an issue
3. email support@araii.id

---

## ⚡ Quick Commands Reference

```bash
# Start
pm2 start ecosystem.config.js

# Stop
pm2 stop ecosystem.config.js

# Restart
pm2 restart ecosystem.config.js

# Logs
pm2 logs

# Monitor
pm2 monit

# Status
pm2 list

# Save
pm2 save
```

---

**Installation complete! Happy selling! 🎉🛍️💰**
