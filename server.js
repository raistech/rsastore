require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const axios = require('axios');
const { marked } = require('marked');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const compression = require('compression');
const { doubleCsrf } = require('csrf-csrf');
const logger = require('./logger');
const sanitize = require('./sanitize');
const { initDatabase, getDB, getSettings, getSetting, updateSetting } = require('./database');
const { generateInvoiceNumber, generateUniqueCode, generateDownloadToken, formatDateWIB } = require('./utils');
const { sendInvoiceEmail, sendDownloadEmail } = require('./email');
const adminRoutes = require('./routes-admin');
const blogRoutes = require('./routes-blog');
const productsRoutes = require('./routes-products');

const app = express();
const PORT = process.env.PORT || 33415;

// Validate SESSION_SECRET
if (!process.env.SESSION_SECRET) {
    logger.error('SESSION_SECRET environment variable is required for production');
    if (process.env.NODE_ENV === 'production') {
        throw new Error('SESSION_SECRET must be set in production');
    }
    logger.warn('Using default SESSION_SECRET - NOT SAFE FOR PRODUCTION');
}
const SESSION_SECRET = process.env.SESSION_SECRET || 'RSAStore_Change_This_Secret_Dev_Only';
const QRIS_SERVICE_URL = process.env.QRIS_SERVICE_URL || 'http://localhost:33416';

// Security: Helmet middleware with disabled CSP (compatibility issues)
app.use(helmet({
    contentSecurityPolicy: false, // Disabled temporarily for compatibility with inline scripts/styles
    crossOriginEmbedderPolicy: false,
}));

// Compression middleware
app.use(compression());

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Trust proxy - important for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Body parsers and cookie parser
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to false for Cloudflare tunnel compatibility
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// CSRF Protection (after session middleware!)
const CSRF_SECRET = process.env.CSRF_SECRET || 'csrf-secret-change-in-production-' + Date.now();
const {
    generateCsrfToken,
    doubleCsrfProtection,
} = doubleCsrf({
    getSecret: () => CSRF_SECRET,
    cookieName: 'x-csrf-token',
    cookieOptions: {
        sameSite: 'lax', // Changed from 'strict' for better compatibility
        path: '/',
        secure: false, // Set to false for Cloudflare tunnel compatibility (SSL terminated at Cloudflare)
        httpOnly: true
    },
    size: 64,
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
    getSessionIdentifier: (req) => req.session.id || req.sessionID || ''
});

// Make formatDateWIB and CSRF token available to all views
app.use((req, res, next) => {
    res.locals.formatDateWIB = formatDateWIB;
    try {
        res.locals.csrfToken = generateCsrfToken(req, res);
    } catch (err) {
        logger.error('Error generating CSRF token', { error: err.message });
        res.locals.csrfToken = ''; // Fallback to empty string
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Initialize database on startup
initDatabase();

// ==================== RATE LIMITING ====================

// General API rate limiter
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Max 100 requests per IP
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for specific IPs
    skip: (req) => {
        const clientIp = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const whitelistedIPs = ['113.192.29.155', '::ffff:113.192.29.155', '127.0.0.1', '::1'];
        return whitelistedIPs.includes(clientIp);
    }
});

// Strict rate limiter for checkout
const checkoutLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // Max 10 checkout attempts per hour
    message: 'Too many checkout attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

// Recovery endpoint rate limiter
const recoveryLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // Max 3 recovery attempts per hour
    message: 'Too many recovery attempts, please try again after 1 hour',
    standardHeaders: true,
    legacyHeaders: false,
});

// Webhook rate limiter
const webhookLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // Max 100 webhook calls per minute
    message: 'Webhook rate limit exceeded',
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply general rate limiting to all routes
app.use(generalLimiter);

// ==================== AUTO CLEANUP ====================

// Function to delete expired pending orders
function cleanupExpiredOrders() {
    const db = getDB();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    db.run(
        'DELETE FROM orders WHERE status = ? AND created_at < ?',
        ['pending', oneHourAgo],
        function(err) {
            if (err) {
                logger.error('Error cleaning up expired orders', { error: err.message });
            } else if (this.changes > 0) {
                logger.info(`Cleaned up ${this.changes} expired pending order(s)`);
            }
            db.close();
        }
    );
}

// Run cleanup every 30 minutes
setInterval(cleanupExpiredOrders, 30 * 60 * 1000);

// Run cleanup on startup
setTimeout(cleanupExpiredOrders, 5000); // Wait 5 seconds after startup

// ==================== ADMIN ROUTES ====================

// CSRF Protection Strategy:
// - Admin routes: NO CSRF (already protected by authentication)
// - Public routes: NO CSRF (using rate limiting instead for better UX)
// Note: CSRF protection disabled for better user experience and compatibility.
// Security relies on: authentication (admin), rate limiting (public), and secure session management.

const skipCsrf = (req, res, next) => next();

// Mount admin routes WITHOUT CSRF protection (authentication is sufficient)
// IMPORTANT: More specific routes must come BEFORE general routes
app.use('/admin/products', skipCsrf, productsRoutes);
app.use('/admin/blog', skipCsrf, blogRoutes);
app.use('/admin', skipCsrf, adminRoutes);

// ==================== BLOG ROUTES ====================

// Mount blog routes (public)
app.use('/blog', blogRoutes);

// ==================== PUBLIC ROUTES ====================

// Homepage
app.get('/', async (req, res) => {
    try {
        const db = getDB();
        
        getSettings((err, settings) => {
            if (err) {
                logger.error('Error getting settings', { error: err.message });
                return res.status(500).send('Server error');
            }
            
            // Get featured products with category names
            db.all(
                `SELECT p.*, c.name as category_name, c.slug as category_slug 
                 FROM products p 
                 LEFT JOIN categories c ON p.category_id = c.id 
                 WHERE p.is_active = 1 
                 ORDER BY p.created_at DESC 
                 LIMIT 6`,
                [],
                (err, products) => {
                    if (err) {
                        logger.error('Error getting products', { error: err.message });
                        return res.status(500).send('Server error');
                    }
                    
                    // Get latest blog posts
                    db.all(
                        `SELECT p.*, u.username as author_name 
                         FROM posts p 
                         LEFT JOIN admin_users u ON p.author_id = u.id 
                         WHERE p.status = 'published' 
                         ORDER BY p.published_at DESC 
                         LIMIT 3`,
                        [],
                        (err, posts) => {
                            db.close();
                            
                            if (err) {
                                logger.error('Error getting posts', { error: err.message });
                                posts = [];
                            }
                            
                            res.render('index', {
                                settings,
                                products,
                                posts: posts || []
                            });
                        }
                    );
                }
            );
        });
    } catch (error) {
        logger.logError(error, req);
        res.status(500).send('Server error');
    }
});

// API: Real-time Product Search (AJAX)
app.get('/api/products/search', (req, res) => {
    const categorySlug = req.query.category;
    const searchQuery = req.query.search;
    const db = getDB();
    
    // Build products query
    let productsQuery = 'SELECT p.*, c.name as category_name, c.icon as category_icon FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_active = 1';
    const params = [];
    
    if (categorySlug) {
        productsQuery += ' AND c.slug = ?';
        params.push(categorySlug);
    }
    
    if (searchQuery && searchQuery.trim()) {
        productsQuery += ' AND (p.name LIKE ? OR p.description LIKE ?)';
        const searchTerm = `%${searchQuery.trim()}%`;
        params.push(searchTerm, searchTerm);
    }
    
    productsQuery += ' ORDER BY p.created_at DESC LIMIT 50';
    
    db.all(productsQuery, params, (err, products) => {
        db.close();
        
        if (err) {
            logger.error('Error searching products', { error: err.message, query: searchQuery });
            return res.status(500).json({ error: 'Search failed' });
        }
        
        logger.info('Product search', { query: searchQuery, category: categorySlug, results: products.length });
        res.json({ products, total: products.length });
    });
});

// Shop - All Products
app.get('/shop', (req, res) => {
    const categorySlug = req.query.category;
    const searchQuery = req.query.search;
    const db = getDB();
    
    getSettings((err, settings) => {
        if (err) {
            logger.error('Error getting settings', { error: err.message, route: '/shop' });
            return res.status(500).send('Server error');
        }
        
        // Get all categories for filter
        db.all('SELECT * FROM categories ORDER BY sort_order, name', [], (err, categories) => {
            if (err) {
                logger.error('Error getting categories', { error: err.message });
                categories = [];
            }
            
            // Build products query
            let productsQuery = 'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_active = 1';
            const params = [];
            
            if (categorySlug) {
                productsQuery += ' AND c.slug = ?';
                params.push(categorySlug);
            }
            
            if (searchQuery) {
                productsQuery += ' AND (p.name LIKE ? OR p.description LIKE ?)';
                params.push(`%${searchQuery}%`, `%${searchQuery}%`);
            }
            
            productsQuery += ' ORDER BY p.created_at DESC';
            
            db.all(productsQuery, params, (err, products) => {
                db.close();
                
                if (err) {
                    logger.error('Error getting products for shop', { error: err.message, query: productsQuery });
                    return res.status(500).send('Server error');
                }
                
                res.render('shop', {
                    settings,
                    products,
                    categories,
                    selectedCategory: categorySlug || null,
                    searchQuery: searchQuery || ''
                });
            });
        });
    });
});

// Product Detail
app.get('/product/:slug', (req, res) => {
    const slug = req.params.slug;
    const db = getDB();
    
    getSettings((err, settings) => {
        if (err) {
            console.error('Error getting settings:', err);
            return res.status(500).send('Server error');
        }
        
        db.get(
            'SELECT p.*, c.name as category_name, c.slug as category_slug FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.slug = ? AND p.is_active = 1',
            [slug],
            (err, product) => {
                if (err || !product) {
                    db.close();
                    return res.status(404).send('Product not found');
                }
                
                // Get related products from same category
                db.all(
                    'SELECT * FROM products WHERE category_id = ? AND id != ? AND is_active = 1 LIMIT 4',
                    [product.category_id, product.id],
                    (err, relatedProducts) => {
                        db.close();
                        
                        res.render('product-detail', {
                            settings,
                            product,
                            relatedProducts: relatedProducts || []
                        });
                    }
                );
            }
        );
    });
});

// Checkout Page (GET)
app.get('/checkout/:productId', (req, res) => {
    const productId = req.params.productId;
    const db = getDB();
    
    getSettings((err, settings) => {
        if (err) {
            console.error('Error getting settings:', err);
            return res.status(500).send('Server error');
        }
        
        db.get('SELECT * FROM products WHERE id = ? AND is_active = 1', [productId], (err, product) => {
            db.close();
            
            if (err || !product) {
                return res.status(404).send('Product not found');
            }
            
            if (product.stock <= 0) {
                return res.status(400).send('Product out of stock');
            }
            
            res.render('checkout', {
                settings,
                product,
                order: null,
                error: null
            });
        });
    });
});

// Process Checkout (POST)
app.post('/checkout/:productId', checkoutLimiter, skipCsrf, async (req, res) => {
    const productId = req.params.productId;
    let { customer_email, customer_whatsapp, customer_telegram } = req.body;
    
    // Sanitize inputs
    customer_email = sanitize.sanitizeEmail(customer_email);
    customer_whatsapp = sanitize.sanitizePhone(customer_whatsapp);
    customer_telegram = sanitize.sanitizeText(customer_telegram, 100);
    
    // Validation - email is required
    if (!customer_email) {
        return res.status(400).send('Email is required');
    }
    
    const db = getDB();
    
    try {
        const product = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM products WHERE id = ? AND is_active = 1', [productId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!product || product.stock <= 0) {
            db.close();
            return res.status(400).send('Product not available');
        }
        
        const settings = await new Promise((resolve, reject) => {
            getSettings((err, settings) => {
                if (err) reject(err);
                else resolve(settings);
            });
        });
        
        // Generate order details
        const invoiceNumber = generateInvoiceNumber();
        const uniqueCode = generateUniqueCode();
        const totalAmount = product.price + uniqueCode;
        
        // Generate QRIS string via microservice
        let qrisString = '';
        try {
            const qrisResponse = await axios.post(`${QRIS_SERVICE_URL}/generate-qris`, {
                base_string: settings.qris_base_string,
                amount: totalAmount
            });
            qrisString = qrisResponse.data.qris_string;
        } catch (qrisError) {
            logger.error('QRIS generation error', { error: qrisError.message, amount: totalAmount });
            // Fallback to base string if QRIS service fails
            qrisString = settings.qris_base_string;
        }
        
        // Create order
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO orders (invoice_number, product_id, product_name, product_price, unique_code, total_amount, 
                 customer_email, customer_whatsapp, customer_telegram, qris_string, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
                [invoiceNumber, product.id, product.name, product.price, uniqueCode, totalAmount, 
                 customer_email || null, customer_whatsapp || null, customer_telegram || null, qrisString],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
        
        db.close();
        
        const order = {
            invoice_number: invoiceNumber,
            product_name: product.name,
            product_price: product.price,
            unique_code: uniqueCode,
            total_amount: totalAmount,
            customer_email,
            customer_whatsapp,
            customer_telegram,
            qris_string: qrisString
        };
        
        // Render checkout page with payment info
        getSettings((err, settings) => {
            res.render('checkout', {
                settings,
                product,
                order,
                error: null
            });
        });
        
    } catch (error) {
        db.close();
        logger.logError(error, req, { action: 'checkout', productId });
        res.status(500).send('Server error during checkout');
    }
});

// API: Get Bot Info (for checkout page)
app.get('/api/bot-info', (req, res) => {
    const db = getDB();
    
    db.get('SELECT whatsapp_phone_number FROM bot_settings WHERE id = 1', [], (err, row) => {
        db.close();
        
        if (err) {
            return res.json({ whatsapp_phone_number: null });
        }
        
        res.json({ 
            whatsapp_phone_number: row && row.whatsapp_phone_number ? row.whatsapp_phone_number : null 
        });
    });
});

// Check Order Status (API)
app.get('/api/order-status/:invoiceNumber', (req, res) => {
    const invoiceNumber = req.params.invoiceNumber;
    const db = getDB();
    
    db.get('SELECT status FROM orders WHERE invoice_number = ?', [invoiceNumber], (err, row) => {
        db.close();
        
        if (err || !row) {
            return res.status(404).json({ status: 'not_found' });
        }
        
        res.json({ status: row.status });
    });
});

// Thank You Page
app.get('/thank-you/:invoiceNumber', (req, res) => {
    const invoiceNumber = req.params.invoiceNumber;
    const db = getDB();
    
    getSettings((err, settings) => {
        if (err) {
            return res.status(500).send('Server error');
        }
        
        db.get(
            'SELECT * FROM orders WHERE invoice_number = ?',
            [invoiceNumber],
            (err, order) => {
                db.close();
                
                if (err || !order) {
                    return res.status(404).send('Order not found');
                }
                
                res.render('thank-you', {
                    settings,
                    order
                });
            }
        );
    });
});

// Invoice Recovery Page
app.get('/recover', (req, res) => {
    getSettings((err, settings) => {
        res.render('recover', {
            settings,
            order: null,
            error: null
        });
    });
});

// Invoice Recovery Process
app.post('/recover', recoveryLimiter, skipCsrf, (req, res) => {
    let { invoice_number, customer_email, customer_whatsapp, customer_telegram } = req.body;
    
    // Sanitize inputs
    invoice_number = sanitize.sanitizeInvoiceNumber(invoice_number);
    customer_email = sanitize.sanitizeEmail(customer_email);
    customer_whatsapp = sanitize.sanitizePhone(customer_whatsapp);
    customer_telegram = sanitize.sanitizeText(customer_telegram, 100);
    
    if (!invoice_number) {
        getSettings((err, settings) => {
            res.render('recover', {
                settings,
                order: null,
                error: 'Invoice number is required'
            });
        });
        return;
    }
    
    const db = getDB();
    
    getSettings((err, settings) => {
        db.get(
            'SELECT * FROM orders WHERE invoice_number = ?',
            [invoice_number],
            (err, order) => {
                if (err || !order) {
                    db.close();
                    return res.render('recover', {
                        settings,
                        order: null,
                        error: 'Order not found'
                    });
                }
                
                // Verify at least one contact method matches
                let verified = false;
                if (customer_email && order.customer_email && customer_email.toLowerCase() === order.customer_email.toLowerCase()) {
                    verified = true;
                }
                if (customer_whatsapp && order.customer_whatsapp && customer_whatsapp === order.customer_whatsapp) {
                    verified = true;
                }
                if (customer_telegram && order.customer_telegram && customer_telegram.toLowerCase() === order.customer_telegram.toLowerCase()) {
                    verified = true;
                }
                
                if (!verified) {
                    db.close();
                    return res.render('recover', {
                        settings,
                        order: null,
                        error: 'Contact information does not match order records'
                    });
                }
                
                if (order.status !== 'paid') {
                    db.close();
                    return res.render('recover', {
                        settings,
                        order: null,
                        error: 'Order is not paid yet. Please complete payment first.'
                    });
                }
                
                // Generate new download token
                const token = generateDownloadToken();
                const expiryMinutes = parseInt(settings.token_expiry_minutes || '60');
                const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();
                
                db.run(
                    'INSERT INTO download_tokens (token, invoice_number, product_id, expires_at) VALUES (?, ?, ?, ?)',
                    [token, order.invoice_number, order.product_id, expiresAt],
                    (err) => {
                        db.close();
                        
                        if (err) {
                            console.error('Token generation error:', err);
                            return res.render('recover', {
                                settings,
                                order: null,
                                error: 'Error generating download link'
                            });
                        }
                        
                        // Send email with new download link
                        if (order.customer_email) {
                            sendDownloadEmail(settings, order, token).catch(console.error);
                        }
                        
                        order.download_token = token;
                        order.download_url = `/download/${token}`;
                        
                        res.render('recover', {
                            settings,
                            order,
                            error: null
                        });
                    }
                );
            }
        );
    });
});

// Expired Link Page
app.get('/expired-link', (req, res) => {
    const db = getDB();
    
    db.get('SELECT * FROM expired_page_content WHERE id = 1', [], (err, content) => {
        if (err || !content) {
            content = {
                title: 'Link Download Telah Kedaluwarsa',
                subtitle: 'Maaf, link download yang Anda akses sudah tidak berlaku lagi.',
                main_message: 'Link download memiliki masa berlaku terbatas untuk keamanan transaksi Anda.',
                cta_text: 'Request Link Download Baru',
                info_title: 'Informasi Penting'
            };
        }
        
        db.all('SELECT * FROM expired_page_faqs WHERE is_active = 1 ORDER BY sort_order, id', [], (err, faqs) => {
            db.close();
            
            if (err) {
                faqs = [];
            }
            
            getSettings((err, settings) => {
                if (err) {
                    settings = { token_expiry_minutes: '60' };
                }
                res.render('expired-link', { settings, content, faqs });
            });
        });
    });
});

// Download Handler
app.get('/download/:token', (req, res) => {
    const token = req.params.token;
    const db = getDB();
    
    db.get(
        'SELECT dt.*, o.status as order_status, p.file_path, p.download_link, p.name as product_name FROM download_tokens dt JOIN orders o ON dt.invoice_number = o.invoice_number JOIN products p ON dt.product_id = p.id WHERE dt.token = ?',
        [token],
        (err, tokenData) => {
            if (err || !tokenData) {
                db.close();
                return res.redirect('/expired-link');
            }
            
            // Check if token expired
            const now = new Date();
            const expiresAt = new Date(tokenData.expires_at);
            
            if (now > expiresAt) {
                db.close();
                return res.redirect('/expired-link');
            }
            
            // Check if order is paid
            if (tokenData.order_status !== 'paid') {
                db.close();
                return res.status(403).send('Order is not paid yet');
            }
            
            // Update download count
            db.run(
                'UPDATE download_tokens SET download_count = download_count + 1, last_download_at = CURRENT_TIMESTAMP, is_used = 1 WHERE token = ?',
                [token],
                (err) => {
                    db.close();
                    
                    if (err) {
                        logger.error('Error updating download count', { error: err.message, token });
                    }
                    
                    // If external link, redirect
                    if (tokenData.download_link) {
                        return res.redirect(tokenData.download_link);
                    }
                    
                    // If local file, serve it
                    if (tokenData.file_path) {
                        const filePath = path.join(__dirname, tokenData.file_path);
                        
                        // Preserve original file extension
                        const originalExtension = path.extname(tokenData.file_path);
                        let downloadFilename = tokenData.product_name;
                        
                        // Add extension if not already present
                        if (originalExtension && !downloadFilename.toLowerCase().endsWith(originalExtension.toLowerCase())) {
                            downloadFilename += originalExtension;
                        }
                        
                        return res.download(filePath, downloadFilename);
                    }
                    
                    res.status(404).send('Download file not found');
                }
            );
        }
    );
});

// Contact Page
app.get('/contact', (req, res) => {
    const db = getDB();
    
    getSettings((err, settings) => {
        // Get active FAQs
        db.all('SELECT * FROM faqs WHERE is_active = 1 ORDER BY sort_order, id', [], (err, faqs) => {
            db.close();
            
            res.render('contact', { 
                settings,
                faqs: faqs || []
            });
        });
    });
});

// Information Page
app.get('/page/:slug', (req, res) => {
    const slug = req.params.slug;
    const db = getDB();
    
    getSettings((err, settings) => {
        db.get('SELECT * FROM pages WHERE slug = ? AND is_active = 1', [slug], (err, page) => {
            db.close();
            
            if (err || !page) {
                return res.status(404).send('Page not found');
            }
            
            res.render('page', { 
                settings,
                page
            });
        });
    });
});

// ==================== WEBHOOK ====================

app.post('/webhook/payment', webhookLimiter, (req, res) => {
    const apiKey = req.headers['x-api-key'];
    const notification = req.body;
    
    logger.info('Webhook received', { notification });
    
    getSettings((err, settings) => {
        if (err) {
            logger.error('Webhook error: Failed to get settings', { error: err.message });
            return res.status(500).json({ status: 'error', message: 'Internal error' });
        }
        
        // Verify API key
        if (settings.webhook_api_key && apiKey !== settings.webhook_api_key) {
            logger.warn('Webhook rejected: Invalid API key', { ip: req.ip });
            return res.status(401).json({ status: 'error', message: 'Unauthorized' });
        }
        
        // Extract amount from notification
        let amount = 0;
        if (notification.amountDetected) {
            amount = parseInt(notification.amountDetected, 10);
        } else if (notification.amount) {
            amount = parseInt(notification.amount, 10);
        } else if (notification.text) {
            const match = notification.text.match(/Rp\s*([\d\.,]+)/);
            if (match && match[1]) {
                amount = parseInt(match[1].replace(/[.,]/g, ''), 10);
            }
        }
        
        if (amount === 0) {
            logger.info('Webhook: No amount detected', { notification });
            return res.status(200).json({ status: 'success', message: 'No amount detected' });
        }
        
        logger.logPayment('amount_detected', null, amount, 'pending', { source: 'webhook' });
        
        const db = getDB();
        
        // Find pending order with exact amount
        db.get(
            'SELECT * FROM orders WHERE total_amount = ? AND status = \'pending\' ORDER BY created_at DESC LIMIT 1',
            [amount],
            (err, order) => {
                if (err) {
                    logger.error('Webhook error: Database query failed', { error: err.message, amount });
                    db.close();
                    return res.status(500).json({ status: 'error', message: 'Database error' });
                }
                
                if (!order) {
                    logger.info('No pending order found for amount', { amount });
                    db.close();
                    return res.status(200).json({ status: 'success', message: 'No matching order' });
                }
                
                logger.logPayment('order_found', order.invoice_number, amount, 'paid');
                
                // Update order status
                db.run(
                    'UPDATE orders SET status = \'paid\', paid_at = CURRENT_TIMESTAMP WHERE invoice_number = ?',
                    [order.invoice_number],
                    (err) => {
                        if (err) {
                            logger.error('Error updating order status', { error: err.message, invoiceNumber: order.invoice_number });
                        }
                    }
                );
                
                // Decrease stock
                db.run(
                    'UPDATE products SET stock = stock - 1 WHERE id = ? AND stock > 0',
                    [order.product_id],
                    (err) => {
                        if (err) {
                            logger.error('Error decreasing stock', { error: err.message, productId: order.product_id });
                        }
                    }
                );
                
                // Generate download token
                const token = generateDownloadToken();
                const expiryMinutes = parseInt(settings.token_expiry_minutes || '60');
                const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();
                
                db.run(
                    'INSERT INTO download_tokens (token, invoice_number, product_id, expires_at) VALUES (?, ?, ?, ?)',
                    [token, order.invoice_number, order.product_id, expiresAt],
                    (err) => {
                        db.close();
                        
                        if (err) {
                            logger.error('Error generating download token', { error: err.message, invoiceNumber: order.invoice_number });
                        } else {
                            logger.info('Download token generated', { token, invoiceNumber: order.invoice_number });
                            
                            // Generate download link
                            const downloadLink = `${settings.base_url || 'http://localhost:' + PORT}/download/${token}`;
                            
                            // Send email with download link
                            if (order.customer_email && settings.smtp_active === '1') {
                                sendInvoiceEmail(settings, order, token).catch((err) => {
                                    logger.error('Error sending invoice email', { error: err.message, invoiceNumber: order.invoice_number });
                                });
                            }
                            
                            // Send WhatsApp notification if number provided
                            if (order.customer_whatsapp) {
                                try {
                                    const { sendPaymentNotification } = require('./bot-whatsapp');
                                    sendPaymentNotification(order, downloadLink).catch((err) => {
                                        logger.error('Error sending WhatsApp notification', { 
                                            error: err.message, 
                                            invoiceNumber: order.invoice_number 
                                        });
                                    });
                                } catch (err) {
                                    logger.error('Error loading WhatsApp bot', { error: err.message });
                                }
                            }
                        }
                    }
                );
                
                res.status(200).json({ 
                    status: 'success', 
                    message: 'Payment processed',
                    invoice: order.invoice_number
                });
            }
        );
    });
});

// Note: Admin routes are now handled by routes-admin.js and mounted at /admin

// ==================== START SERVER ====================

app.listen(PORT, () => {
    logger.info('========================================');
    logger.info('🚀 RSA Store Server Started');
    logger.info('========================================');
    logger.info(`📡 Server running on: http://localhost:${PORT}`);
    logger.info(`🔧 Admin panel: http://localhost:${PORT}/admin/login`);
    logger.info(`📦 QRIS Service: ${QRIS_SERVICE_URL}`);
    logger.info(`🔒 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info('========================================');
});
