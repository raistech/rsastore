// WhatsApp Bot using whatsapp-web.js
require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { getDB } = require('./database');
const logger = require('./logger');
const botController = require('./bot-controller');
const { generateInvoiceNumber, generateUniqueCode } = require('./utils');

const QR_CODE_FILE = path.join(__dirname, 'public', 'whatsapp-qr.png');
const QRIS_SERVICE_URL = process.env.QRIS_SERVICE_URL || 'http://localhost:33416';

let client = null;
let qrCodeData = null;
let userSessions = new Map();

// Update bot status in database
function updateBotStatus(status, phoneNumber = null, qrCode = null) {
    const db = getDB();
    const updates = ['whatsapp_session_status = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const params = [status];
    
    if (phoneNumber) {
        updates.push('whatsapp_phone_number = ?');
        params.push(phoneNumber);
    }
    
    if (qrCode) {
        updates.push('whatsapp_qr_code = ?', 'whatsapp_qr_updated_at = CURRENT_TIMESTAMP');
        params.push(qrCode);
    }
    
    db.run(
        `UPDATE bot_settings SET ${updates.join(', ')} WHERE id = 1`,
        params,
        (err) => {
            db.close();
            if (err) {
                logger.error('Error updating WhatsApp bot status', { error: err.message });
            }
        }
    );
}

// Check if bot is enabled
function isBotEnabled() {
    return new Promise((resolve, reject) => {
        const db = getDB();
        db.get('SELECT whatsapp_enabled FROM bot_settings WHERE id = 1', [], (err, row) => {
            db.close();
            if (err) reject(err);
            else resolve(row && row.whatsapp_enabled === 1);
        });
    });
}

// Get user session
function getUserSession(userId) {
    if (!userSessions.has(userId)) {
        userSessions.set(userId, {
            state: 'menu',
            data: {},
            lastActivity: Date.now()
        });
    }
    return userSessions.get(userId);
}

// Update user session
function updateUserSession(userId, updates) {
    const session = getUserSession(userId);
    Object.assign(session, updates, { lastActivity: Date.now() });
    userSessions.set(userId, session);
}

// Clear old sessions
setInterval(() => {
    const now = Date.now();
    const timeout = 30 * 60 * 1000;
    
    for (const [userId, session] of userSessions.entries()) {
        if (now - session.lastActivity > timeout) {
            userSessions.delete(userId);
        }
    }
}, 5 * 60 * 1000);

// Generate QRIS image from string
async function generateQRISImage(qrisString, amount) {
    try {
        // Generate QR code sebagai buffer
        const qrBuffer = await qrcode.toBuffer(qrisString, {
            errorCorrectionLevel: 'M',
            type: 'png',
            width: 400,
            margin: 2
        });
        
        return qrBuffer;
    } catch (error) {
        logger.error('Error generating QRIS image', { error: error.message });
        throw error;
    }
}

// Create order and generate QRIS
async function createOrder(product, customerEmail, customerWhatsapp) {
    const db = getDB();
    
    try {
        // Get settings for QRIS
        const settings = await new Promise((resolve, reject) => {
            const { getSettings } = require('./database');
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
            logger.error('QRIS generation error', { error: qrisError.message });
            qrisString = settings.qris_base_string;
        }
        
        // Create order in database
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO orders (invoice_number, product_id, product_name, product_price, unique_code, total_amount, 
                 customer_email, customer_whatsapp, qris_string, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
                [invoiceNumber, product.id, product.name, product.price, uniqueCode, totalAmount, 
                 customerEmail || null, customerWhatsapp || null, qrisString],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
        
        db.close();
        
        return {
            invoice_number: invoiceNumber,
            product_name: product.name,
            product_price: product.price,
            unique_code: uniqueCode,
            total_amount: totalAmount,
            qris_string: qrisString
        };
        
    } catch (error) {
        db.close();
        throw error;
    }
}

// Handle messages
async function handleMessage(msg) {
    try {
        const messageText = msg.body.trim();
        const userId = msg.from;
        const session = getUserSession(userId);
        
        logger.info('WhatsApp message received', { from: userId, message: messageText });
        
        // Handle commands
        const lowerText = messageText.toLowerCase();
        
        // Reset to menu
        if (lowerText === 'menu' || lowerText === 'start' || lowerText === '/start') {
            updateUserSession(userId, { state: 'menu', data: {} });
            const welcomeMsg = await botController.getWelcomeMessage();
            await client.sendMessage(userId, welcomeMsg);
            return;
        }
        
        // Help
        if (lowerText === 'bantuan' || lowerText === 'help' || lowerText === '4') {
            const helpMsg = await botController.getHelpMessage();
            await client.sendMessage(userId, helpMsg);
            return;
        }
        
        // Check order
        if (lowerText.startsWith('cek ') || lowerText.startsWith('inv-')) {
            const invoiceNumber = lowerText.replace('cek ', '').trim().toUpperCase();
            const order = await botController.checkOrderStatus(invoiceNumber);
            
            if (order) {
                const orderMsg = botController.formatOrderMessage(order);
                await client.sendMessage(userId, orderMsg);
            } else {
                await client.sendMessage(userId, '❌ Pesanan tidak ditemukan.');
            }
            return;
        }
        
        // State machine
        switch (session.state) {
            case 'menu':
                await handleMenuState(userId, messageText);
                break;
                
            case 'category_list':
                await handleCategorySelection(userId, messageText);
                break;
                
            case 'product_list':
                await handleProductSelection(userId, messageText);
                break;
                
            case 'product_detail':
                await handleProductAction(userId, messageText);
                break;
                
            case 'checkout':
                await handleCheckout(userId, messageText);
                break;
                
            case 'search':
                await handleSearch(userId, messageText);
                break;
                
            default:
                const welcomeMsg = await botController.getWelcomeMessage();
                await client.sendMessage(userId, welcomeMsg);
                updateUserSession(userId, { state: 'menu', data: {} });
        }
        
    } catch (error) {
        logger.error('Error handling WhatsApp message', { error: error.message });
    }
}

// Handle menu state
async function handleMenuState(userId, text) {
    const choice = text.trim();
    
    switch (choice) {
        case '1':
        case 'katalog':
            const categories = await botController.getCategories();
            const categoryMsg = botController.formatCategoriesList(categories);
            await client.sendMessage(userId, categoryMsg);
            updateUserSession(userId, { 
                state: 'category_list', 
                data: { categories } 
            });
            break;
            
        case '2':
        case 'cari':
            await client.sendMessage(userId, '🔍 *CARI PRODUK*\n\nKetik nama produk yang Anda cari:');
            updateUserSession(userId, { state: 'search', data: {} });
            break;
            
        case '3':
            await client.sendMessage(userId, '🔍 *CEK PESANAN*\n\nKetik nomor invoice Anda (contoh: INV-20250108-001):');
            break;
            
        default:
            const welcomeMsg = await botController.getWelcomeMessage();
            await client.sendMessage(userId, welcomeMsg);
    }
}

// Handle category selection
async function handleCategorySelection(userId, text) {
    const session = getUserSession(userId);
    const categories = session.data.categories || [];
    const choice = parseInt(text.trim()) - 1;
    
    if (choice >= 0 && choice < categories.length) {
        const selectedCategory = categories[choice];
        const products = await botController.getProductsByCategory(selectedCategory.id);
        const productMsg = botController.formatProductsList(products, selectedCategory.name);
        
        await client.sendMessage(userId, productMsg);
        updateUserSession(userId, {
            state: 'product_list',
            data: { 
                category: selectedCategory,
                products 
            }
        });
    } else {
        await client.sendMessage(userId, '❌ Pilihan tidak valid. Ketik "menu" untuk kembali.');
    }
}

// Handle product selection
async function handleProductSelection(userId, text) {
    const session = getUserSession(userId);
    const products = session.data.products || [];
    const choice = parseInt(text.trim()) - 1;
    
    if (choice >= 0 && choice < products.length) {
        const selectedProduct = products[choice];
        const productMsg = botController.formatProductMessage(selectedProduct);
        
        await client.sendMessage(userId, productMsg);
        
        if (selectedProduct.stock > 0) {
            await client.sendMessage(userId, '💳 Ketik "BELI" untuk melanjutkan pembelian.');
            updateUserSession(userId, {
                state: 'product_detail',
                data: { product: selectedProduct }
            });
        } else {
            await client.sendMessage(userId, '❌ Maaf, produk habis. Ketik "menu" untuk kembali.');
        }
    } else {
        await client.sendMessage(userId, '❌ Pilihan tidak valid. Ketik "menu" untuk kembali.');
    }
}

// Handle product action
async function handleProductAction(userId, text) {
    const lowerText = text.toLowerCase().trim();
    
    if (lowerText === 'beli' || lowerText === 'buy') {
        await client.sendMessage(userId, '📧 *CHECKOUT*\n\nSilakan masukkan email Anda:');
        updateUserSession(userId, { state: 'checkout', data: getUserSession(userId).data });
    } else {
        await client.sendMessage(userId, '❌ Ketik "BELI" untuk melanjutkan atau "MENU" untuk kembali.');
    }
}

// Handle checkout
async function handleCheckout(userId, text) {
    const email = text.trim();
    
    if (!email.includes('@') || !email.includes('.')) {
        await client.sendMessage(userId, '❌ Format email tidak valid. Silakan coba lagi:');
        return;
    }
    
    const session = getUserSession(userId);
    const product = session.data.product;
    
    if (!product) {
        await client.sendMessage(userId, '❌ Sesi checkout kedaluwarsa. Ketik "menu" untuk mulai lagi.');
        updateUserSession(userId, { state: 'menu', data: {} });
        return;
    }
    
    const whatsappNumber = userId.split('@')[0];
    
    try {
        await client.sendMessage(userId, '⏳ Memproses pesanan Anda...');
        
        // Create order and generate QRIS
        const order = await createOrder(product, email, whatsappNumber);
        
        // Generate QRIS image
        const qrBuffer = await generateQRISImage(order.qris_string, order.total_amount);
        const media = new MessageMedia('image/png', qrBuffer.toString('base64'), 'qris.png');
        
        // Send invoice message
        let invoiceMsg = `✅ *PESANAN DIBUAT*\n\n`;
        invoiceMsg += `🧾 Invoice: *${order.invoice_number}*\n`;
        invoiceMsg += `📦 Produk: ${order.product_name}\n`;
        invoiceMsg += `💵 Harga: ${botController.formatCurrency(order.product_price)}\n`;
        invoiceMsg += `🔢 Kode Unik: ${botController.formatCurrency(order.unique_code)}\n`;
        invoiceMsg += `💰 *Total Bayar: ${botController.formatCurrency(order.total_amount)}*\n\n`;
        invoiceMsg += `📱 *CARA PEMBAYARAN:*\n`;
        invoiceMsg += `1. Scan QR Code di bawah dengan app e-wallet\n`;
        invoiceMsg += `2. Pastikan nominal: *${botController.formatCurrency(order.total_amount)}*\n`;
        invoiceMsg += `3. Selesaikan pembayaran\n`;
        invoiceMsg += `4. Invoice akan dikirim ke email Anda\n\n`;
        invoiceMsg += `⏰ Bayar dalam 1 jam atau pesanan dibatalkan otomatis.\n\n`;
        invoiceMsg += `💡 Simpan nomor invoice untuk tracking!`;
        
        await client.sendMessage(userId, invoiceMsg);
        
        // Send QRIS image
        await client.sendMessage(userId, media, { caption: `QR Code Pembayaran - ${order.invoice_number}` });
        
        updateUserSession(userId, { state: 'menu', data: {} });
        
        logger.info('Order created via WhatsApp', { invoice: order.invoice_number, userId });
        
    } catch (error) {
        logger.error('Error creating order from WhatsApp', { error: error.message });
        await client.sendMessage(userId, '❌ Terjadi kesalahan. Silakan coba lagi atau hubungi admin.');
    }
}

// Handle search
async function handleSearch(userId, text) {
    const query = text.trim();
    
    if (query.length < 3) {
        await client.sendMessage(userId, '❌ Masukkan minimal 3 karakter untuk pencarian.');
        return;
    }
    
    const products = await botController.searchProducts(query);
    
    if (products.length === 0) {
        await client.sendMessage(userId, `❌ Tidak ada produk yang cocok dengan "${query}".\n\nKetik "menu" untuk kembali.`);
        return;
    }
    
    let message = `🔍 *HASIL PENCARIAN "${query}"*\n\nDitemukan ${products.length} produk:\n\n`;
    products.forEach((product, index) => {
        message += `${index + 1}. ${product.name}\n`;
        message += `   💰 ${botController.formatCurrency(product.price)}\n`;
        message += `   📦 Stok: ${product.stock > 0 ? product.stock : 'Habis'}\n\n`;
    });
    message += `Ketik angka untuk lihat detail produk`;
    
    await client.sendMessage(userId, message);
    updateUserSession(userId, {
        state: 'product_list',
        data: { products }
    });
}

// Initialize WhatsApp client
async function initializeWhatsApp() {
    try {
        const enabled = await isBotEnabled();
        if (!enabled) {
            logger.info('WhatsApp bot is disabled in settings');
            return;
        }
        
        client = new Client({
            authStrategy: new LocalAuth({
                dataPath: path.join(__dirname, 'whatsapp-session')
            }),
            puppeteer: {
                headless: true,
                executablePath: '/snap/bin/chromium',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            }
        });
        
        // QR Code event
        client.on('qr', async (qr) => {
            qrCodeData = qr;
            logger.info('WhatsApp QR Code generated');
            
            try {
                await qrcode.toFile(QR_CODE_FILE, qr);
                const qrDataUrl = await qrcode.toDataURL(qr);
                updateBotStatus('waiting_qr', null, qrDataUrl);
                logger.info('WhatsApp QR code saved');
            } catch (err) {
                logger.error('Error saving QR code', { error: err.message });
            }
        });
        
        // Ready event
        client.on('ready', () => {
            const phoneNumber = client.info.wid.user;
            logger.info('WhatsApp bot ready', { phone: phoneNumber });
            updateBotStatus('connected', phoneNumber);
            qrCodeData = null;
            
            if (fs.existsSync(QR_CODE_FILE)) {
                fs.unlinkSync(QR_CODE_FILE);
            }
        });
        
        // Authenticated event
        client.on('authenticated', () => {
            logger.info('WhatsApp bot authenticated');
            updateBotStatus('authenticated');
        });
        
        // Disconnected event
        client.on('disconnected', (reason) => {
            logger.warn('WhatsApp bot disconnected', { reason });
            updateBotStatus('disconnected');
        });
        
        // Message event
        client.on('message', async (msg) => {
            console.log('[WhatsApp Bot] Message received:', msg.from, '->', msg.body);
            logger.info('WhatsApp message received (raw)', { 
                from: msg.from, 
                body: msg.body,
                isGroupMsg: msg.from.includes('@g.us'),
                type: msg.type
            });
            
            // Ignore group messages
            if (msg.from.includes('@g.us')) {
                console.log('[WhatsApp Bot] Ignoring group message');
                return;
            }
            
            // Ignore broadcast messages
            if (msg.from === 'status@broadcast') {
                console.log('[WhatsApp Bot] Ignoring status broadcast');
                return;
            }
            
            // Handle the message
            await handleMessage(msg);
        });
        
        // Initialize
        await client.initialize();
        
        logger.info('WhatsApp bot initialized');
        
    } catch (error) {
        logger.error('Error initializing WhatsApp bot', { error: error.message });
        updateBotStatus('error');
    }
}

// Disconnect WhatsApp
async function disconnectWhatsApp() {
    if (client) {
        await client.destroy();
        client = null;
        updateBotStatus('disconnected');
        logger.info('WhatsApp bot disconnected');
    }
}

// Get or initialize client
async function getClient() {
    if (client && client.info) {
        return client;
    }
    
    // Try to initialize if not already
    const enabled = await isBotEnabled();
    if (!enabled) {
        logger.warn('WhatsApp bot is disabled');
        return null;
    }
    
    // If not connected, try to initialize (will use existing session)
    if (!client) {
        logger.info('Auto-initializing WhatsApp client...');
        try {
            await initializeWhatsApp();
            // Wait a bit for connection
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (err) {
            logger.error('Failed to auto-initialize WhatsApp', { error: err.message });
            return null;
        }
    }
    
    return client && client.info ? client : null;
}

// Send payment success notification to customer
async function sendPaymentNotification(order, downloadLink) {
    const whatsappClient = await getClient();
    
    if (!whatsappClient || !whatsappClient.info) {
        logger.warn('Cannot send WhatsApp notification: Bot not connected');
        return false;
    }
    
    if (!order.customer_whatsapp) {
        logger.info('No WhatsApp number provided for order', { invoice: order.invoice_number });
        return false;
    }
    
    try {
        // Format phone number
        let phoneNumber = order.customer_whatsapp.replace(/\D/g, '');
        
        // Convert 08xxx to 628xxx
        if (phoneNumber.startsWith('0')) {
            phoneNumber = '62' + phoneNumber.substring(1);
        }
        // Add 62 if not present
        if (!phoneNumber.startsWith('62')) {
            phoneNumber = '62' + phoneNumber;
        }
        
        const chatId = phoneNumber + '@c.us';
        
        // Try to check if number is registered (but don't block if check fails)
        try {
            const isRegistered = await whatsappClient.isRegisteredUser(chatId);
            if (!isRegistered) {
                logger.warn('WhatsApp number may not be registered, but will attempt to send', { 
                    phone: order.customer_whatsapp,
                    invoice: order.invoice_number 
                });
                // Don't return false, still try to send
            }
        } catch (checkError) {
            logger.warn('Could not verify WhatsApp registration, will attempt to send anyway', { 
                error: checkError.message,
                phone: order.customer_whatsapp 
            });
            // Continue anyway
        }
        
        // Format message
        let message = `🎉 *PEMBAYARAN BERHASIL!*\n\n`;
        message += `✅ Pesanan Anda telah dikonfirmasi\n\n`;
        message += `📋 *DETAIL PESANAN*\n`;
        message += `🧾 Invoice: *${order.invoice_number}*\n`;
        message += `📦 Produk: ${order.product_name}\n`;
        message += `💰 Total: ${botController.formatCurrency(order.total_amount)}\n\n`;
        message += `📥 *LINK DOWNLOAD:*\n`;
        message += `${downloadLink}\n\n`;
        message += `⏰ Link berlaku selama 1 jam.\n`;
        message += `📧 Invoice juga telah dikirim ke email Anda.\n\n`;
        message += `Terima kasih telah berbelanja! 🙏`;
        
        await whatsappClient.sendMessage(chatId, message);
        
        logger.info('WhatsApp notification sent', {
            invoice: order.invoice_number,
            phone: phoneNumber
        });
        
        return true;
        
    } catch (error) {
        logger.error('Error sending WhatsApp notification', {
            error: error.message,
            invoice: order.invoice_number,
            phone: order.customer_whatsapp
        });
        return false;
    }
}

// Export functions
module.exports = {
    initializeWhatsApp,
    disconnectWhatsApp,
    isBotEnabled,
    sendPaymentNotification
};

// HTTP API for test notifications (inter-process communication)
function startHttpApi() {
    const express = require('express');
    const app = express();
    const PORT = 33418; // Internal API port (changed from 33417 to avoid conflicts)
    
    app.use(express.json());
    
    // Health check
    app.get('/health', (req, res) => {
        const status = client && client.info ? 'connected' : 'disconnected';
        res.json({ 
            status,
            ready: !!(client && client.info),
            timestamp: new Date().toISOString()
        });
    });
    
    // Test notification endpoint
    app.post('/test-notification', async (req, res) => {
        try {
            const { phone_number } = req.body;
            
            if (!phone_number) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Phone number required' 
                });
            }
            
            // Create dummy order
            const dummyOrder = {
                invoice_number: 'TEST-' + Date.now(),
                product_name: 'Test Product (Dummy)',
                product_price: 50000,
                unique_code: 123,
                total_amount: 50123,
                customer_whatsapp: phone_number
            };
            
            const dummyLink = 'https://example.com/download/test-token-' + Date.now();
            
            console.log('[HTTP API] Test notification request for:', phone_number);
            
            // Send notification
            const result = await sendPaymentNotification(dummyOrder, dummyLink);
            
            if (result) {
                // Format number for response
                let formattedNumber = phone_number.replace(/\D/g, '');
                if (formattedNumber.startsWith('0')) {
                    formattedNumber = '62' + formattedNumber.substring(1);
                }
                if (!formattedNumber.startsWith('62')) {
                    formattedNumber = '62' + formattedNumber;
                }
                
                res.json({ 
                    success: true,
                    message: 'Test notification sent successfully',
                    formatted_number: formattedNumber
                });
            } else {
                res.json({ 
                    success: false, 
                    error: 'Failed to send notification. Check if bot is connected and number is registered on WhatsApp.' 
                });
            }
        } catch (error) {
            console.error('[HTTP API] Error:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    });
    
    app.listen(PORT, '127.0.0.1', () => {
        console.log(`[HTTP API] WhatsApp bot API listening on port ${PORT}`);
        logger.info('WhatsApp bot HTTP API started', { port: PORT });
    });
}

// Start bot if enabled
if (require.main === module) {
    console.log('[WhatsApp Bot] Starting...');
    logger.info('Starting WhatsApp bot...');
    
    // Start HTTP API for inter-process communication
    startHttpApi();
    
    setTimeout(() => {
        console.log('[WhatsApp Bot] Initializing WhatsApp client...');
        initializeWhatsApp().catch(err => {
            console.error('[WhatsApp Bot] Failed to start:', err.message);
            logger.error('Failed to start WhatsApp bot', { error: err.message });
            setTimeout(() => {
                console.log('[WhatsApp Bot] Retrying initialization...');
                initializeWhatsApp().catch(console.error);
            }, 5000);
        });
    }, 2000);
}
