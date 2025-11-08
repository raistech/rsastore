# 🛍️ RSA Store - E-Commerce Platform with Bot Integration

Modern e-commerce platform with **WhatsApp & Telegram bot integration**, **dynamic QRIS payment**, and **automated notifications**.

![Node.js](https://img.shields.io/badge/Node.js-16+-green)
![License](https://img.shields.io/badge/license-MIT-blue)
![Status](https://img.shields.io/badge/status-production--ready-brightgreen)

---

## DEMO
**Go to** 
araii.id
araii.id/admin/login
- username : demo
- Password : demo123!

## ✨ Features

### 🛒 E-Commerce Core
- **Product Management** - Categories, variants, stock tracking
- **Shopping Cart** - Session-based cart system
- **Order Processing** - Invoice generation, order tracking
- **Admin Panel** - Complete dashboard for store management
- **Blog System** - Built-in CMS for content marketing
- **SEO Optimized** - Meta tags, sitemap, structured data

### 💳 Payment System
- **Dynamic QRIS** - Real-time QR code generation with unique amounts
- **Payment Webhook** - Auto-detect payment completion
- **Multiple Payment Methods** - Ready for expansion
- **Automated Invoicing** - Email & WhatsApp notifications

### 🤖 Bot Integration (Multi-Channel Sales)
- **WhatsApp Bot** - Browse, search, checkout via WhatsApp
- **Telegram Bot** - Interactive inline keyboard interface
- **QRIS Direct Sending** - QR code sent directly in chat
- **24/7 Automation** - Auto-response, order tracking
- **Payment Notifications** - Instant WhatsApp alerts on successful payment

### 📧 Notification System
- **Email Notifications** - SMTP integration (Gmail, SendGrid, etc.)
- **WhatsApp Notifications** - Auto-send on payment success
- **Admin Alerts** - New order, low stock notifications
- **Customer Engagement** - Order updates, download links

### 🔒 Security & Performance
- **Rate Limiting** - DDoS protection, API throttling
- **CSRF Protection** - Secure forms and AJAX requests
- **IP Whitelist** - Admin access control
- **Session Management** - Secure encrypted sessions
- **Input Sanitization** - SQL injection & XSS prevention
- **PM2 Process Management** - Auto-restart, monitoring, clustering

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** v16+ and npm
- **Python** 3.8+ (for QRIS service)
- **PM2** (for production deployment)
- **SQLite3** (included)
- **Chromium** (for WhatsApp bot)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/raistech/rsastore.git
   cd rsastore
   ```

2. **Install Node.js dependencies**
   ```bash
   npm install
   ```

3. **Install Python dependencies**
   ```bash
   pip3 install -r requirements.txt
   ```

4. **Configure environment**
   ```bash
   cp .env.example .env
   nano .env  # Edit with your configuration
   ```

5. **Initialize database**
   ```bash
   node database.js
   ```

6. **Create uploads directory**
   ```bash
   mkdir -p uploads/products
   mkdir -p uploads/blog
   mkdir -p logs
   ```

7. **Start development server**
   ```bash
   # Development mode
   npm start

   # Production mode with PM2
   pm2 start ecosystem.config.js
   pm2 save
   ```

8. **Access the application**
   - **Website**: http://localhost:3000
   - **Admin Panel**: http://localhost:3000/admin/login
   - **Default Credentials**: Check `.env` file

---

## 📋 Configuration Guide

### 1. Basic Configuration

Edit `.env` file with your settings:

```env
PORT=3000
NODE_ENV=production
BASE_URL=http://yourdomain.com
SESSION_SECRET=generate-random-string-here
```

**Generate secure secrets:**
```bash
# For SESSION_SECRET
openssl rand -base64 32

# For WEBHOOK_API_KEY
openssl rand -hex 32
```

### 2. Email Configuration (SMTP)

**For Gmail:**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password  # Not your regular password!
```

**How to get Gmail App Password:**
1. Go to Google Account Settings
2. Security → 2-Step Verification (enable if not enabled)
3. App passwords → Generate new
4. Copy the 16-character password

**For SendGrid:**
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```

### 3. QRIS Payment Configuration

**Get QRIS Base String from your payment provider:**
- Bank Indonesia
- DANA
- OVO
- GoPay
- LinkAja
- Or any QRIS-supporting provider

```env
QRIS_BASE_STRING=00020101021126680016COM.NOBU...
QRIS_SERVICE_URL=http://localhost:3001
```

### 4. WhatsApp Bot Setup

**Install Chromium (required):**
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install -y chromium-browser

# Or use snap
sudo snap install chromium
```

**Enable in Admin Panel:**
1. Login to admin panel
2. Go to **Bot Settings**
3. Enable WhatsApp Bot
4. Scan QR code with WhatsApp app
5. Done! Bot is now active

### 5. Telegram Bot Setup

**Get Bot Token:**
1. Open Telegram, search `@BotFather`
2. Send `/newbot` command
3. Follow instructions
4. Copy the token

**Configure:**
```env
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

Or configure via Admin Panel → Bot Settings

---

## 🏗️ Architecture

### System Components

```
┌─────────────────────────────────────────────┐
│           RSA Store Platform                │
└─────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
   Main Server           QRIS Service
   (Node.js)             (Python)
   Port 3000             Port 3001
        │                       │
        ├───────────────────────┤
        │                       │
   Bot Services          Database
        │                 (SQLite)
    ┌───┴────┐
    │        │
WhatsApp  Telegram
  Bot       Bot
Port 3002  Built-in
```

### Tech Stack

**Backend:**
- Node.js + Express.js
- SQLite3 (database)
- Python (QRIS service)
- PM2 (process manager)

**Bots:**
- whatsapp-web.js (WhatsApp)
- node-telegram-bot-api (Telegram)

**Frontend:**
- EJS (templating)
- Vanilla JavaScript
- CSS3

**Libraries:**
- axios (HTTP client)
- qrcode (QR generation)
- nodemailer (email)
- express-rate-limit (security)
- winston (logging)

---

## 📁 Project Structure

```
rsastore/
├── server.js                 # Main server entry point
├── database.js               # Database schema & initialization
├── ecosystem.config.js       # PM2 process configuration
├── package.json             # Node.js dependencies
├── requirements.txt         # Python dependencies
│
├── routes/
│   ├── routes-admin.js      # Admin panel routes
│   ├── routes-products.js   # Product & shop routes
│   └── routes-blog.js       # Blog/CMS routes
│
├── bot-whatsapp.js          # WhatsApp bot implementation
├── bot-telegram.js          # Telegram bot implementation
├── bot-controller.js        # Shared bot logic
│
├── qris-service.py          # QRIS QR code generator
│
├── auth.js                  # Authentication middleware
├── email.js                 # Email service
├── logger.js                # Winston logger configuration
├── sanitize.js              # Input sanitization
├── utils.js                 # Utility functions
│
├── views/                   # EJS templates
│   ├── partials/           # Reusable components
│   ├── admin/              # Admin panel views
│   ├── shop/               # Shop pages
│   └── blog/               # Blog pages
│
├── public/                  # Static assets
│   ├── css/
│   ├── js/
│   └── images/
│
├── uploads/                 # User uploaded files
│   ├── products/           # Product images & files
│   └── blog/               # Blog images
│
├── logs/                    # Application logs
│
├── docs/                    # Documentation
│   ├── BOT_SETUP.md
│   ├── WHATSAPP_NOTIFICATION.md
│   └── PM2_MANAGEMENT.md
│
└── .env                     # Environment configuration (not in repo)
```

---

## 🔧 PM2 Process Management

### Start All Services

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### View Status

```bash
pm2 list
pm2 monit
```

### View Logs

```bash
# All logs
pm2 logs

# Specific service
pm2 logs rsastore-main
pm2 logs rsastore-whatsapp-bot
pm2 logs rsastore-telegram-bot
```

### Restart Services

```bash
# Restart all
pm2 restart ecosystem.config.js

# Restart specific
pm2 restart rsastore-main
```

### Stop Services

```bash
pm2 stop ecosystem.config.js
pm2 delete ecosystem.config.js
```

---

## 🧪 Testing

### Test Email Configuration

```bash
node -e "
const {sendTestEmail} = require('./email');
sendTestEmail('your-email@gmail.com')
  .then(() => console.log('✅ Email sent!'))
  .catch(err => console.error('❌ Error:', err));
"
```

### Test QRIS Service

```bash
curl -X POST http://localhost:3001/generate-qris \
  -H "Content-Type: application/json" \
  -d '{"base_string":"YOUR_BASE_STRING","amount":50000}'
```

### Test WhatsApp Bot

Admin Panel → Bot Settings → Test WhatsApp Notification

### Test Payment Webhook

```bash
curl -X POST http://localhost:3000/webhook/payment \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-webhook-key" \
  -d '{"amountDetected":50123}'
```

---

## 📱 Bot Usage Guide

### WhatsApp Bot Commands

```
menu          - Show main menu
1             - View catalog
2             - Search products
3             - Check order
4             - Help
```

**Customer Flow:**
1. Customer sends "menu" to WhatsApp
2. Bot shows product catalog
3. Customer browses and selects product
4. Bot sends QRIS QR code in chat
5. Customer scans and pays
6. Auto-notification on payment success

### Telegram Bot

All interactions via inline keyboard buttons:
- 🛍️ View Catalog
- 🔍 Search Products
- 📦 Check Order
- ❓ Help

---

## 🔐 Security Best Practices

### Production Checklist

- [✅] Change default admin password
- [✅] Use strong SESSION_SECRET
- [✅] Enable HTTPS/SSL
- [✅] Configure firewall (UFW/iptables)
- [✅] Set up rate limiting
- [✅] Enable CSRF protection
- [✅] Regular database backups
- [✅] Keep dependencies updated
- [✅] Monitor logs regularly
- [✅] Use environment variables (never hardcode secrets)

### Backup Strategy

```bash
# Database backup
cp rsastore.db rsastore.db.backup-$(date +%Y%m%d)

# Full backup
tar -czf rsastore-backup-$(date +%Y%m%d).tar.gz \
  --exclude='node_modules' \
  --exclude='whatsapp-session' \
  --exclude='logs' \
  .
```

---

## 🐛 Troubleshooting

### Common Issues

**1. Port already in use**
```bash
# Find process using port
lsof -ti:3000
# Kill process
kill -9 $(lsof -ti:3000)
```

**2. WhatsApp bot not connecting**
```bash
# Check chromium installation
which chromium-browser
# Install if missing
sudo apt install chromium-browser
# Restart bot
pm2 restart rsastore-whatsapp-bot
```

**3. Email not sending**
- Check SMTP credentials
- Verify app password (not regular password)
- Check firewall allows SMTP port (587/465)
- Test with `npm run test-email`

**4. QRIS not generating**
```bash
# Check Python service
pm2 logs rsastore-qris
# Restart service
pm2 restart rsastore-qris
```

**5. Database locked**
```bash
# Check for processes using database
lsof rsastore.db
# Restart application
pm2 restart rsastore-main
```

### Logs Location

```
logs/main-out.log           # Main server output
logs/main-error.log         # Main server errors
logs/qris-out.log          # QRIS service
logs/whatsapp-bot-out.log  # WhatsApp bot
logs/telegram-bot-out.log  # Telegram bot
```

---

## 📊 Performance Optimization

### Production Tips

1. **Enable PM2 Cluster Mode**
   ```javascript
   // ecosystem.config.js
   instances: 'max',
   exec_mode: 'cluster'
   ```

2. **Database Optimization**
   ```bash
   node create-indexes.js
   ```

3. **Enable Compression**
   ```javascript
   const compression = require('compression');
   app.use(compression());
   ```

4. **CDN for Static Assets**
   - Use Cloudflare, AWS CloudFront, or similar
   - Offload images, CSS, JS

5. **Monitor Performance**
   ```bash
   pm2 monit
   pm2 install pm2-logrotate
   ```

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

### Development Guidelines

- Follow existing code style
- Write meaningful commit messages
- Test before submitting PR
- Update documentation if needed

---

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

---

## 👨‍💻 Author

**RSA Store Team**

---

## 🙏 Acknowledgments

- **whatsapp-web.js** - WhatsApp bot library
- **node-telegram-bot-api** - Telegram bot library
- **Express.js** - Web framework
- **PM2** - Process management

---

## 📞 Support

- **Documentation**: Check `docs/` folder
- **Issues**: Open GitHub issue
- **Email**: support@araii.id

---

## 📈 Changelog

### v2.0.0 (2025-11-08)
- ✨ Added WhatsApp bot integration
- ✨ Added Telegram bot integration
- ✨ Added QRIS direct sending in chat
- ✨ Added payment notification system
- ✨ Added bot test feature with HTTP API
- 🐛 Fixed category delete bug
- 🐛 Fixed markdown parsing in Telegram
- 📚 Comprehensive documentation

### v1.0.0 (2025-11-07)
- 🎉 Initial release
- ✨ E-commerce core features
- ✨ QRIS payment integration
- ✨ Admin panel
- ✨ Email notifications

---

**Made with ❤️ for modern e-commerce**
