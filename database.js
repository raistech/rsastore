const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'rsastore.db');

// Database connection helper
function getDB() {
    return new sqlite3.Database(DB_PATH);
}

// Initialize database with all required tables
function initDatabase() {
    const db = getDB();
    
    db.serialize(() => {
        // Settings table
        db.run(`CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Initialize default settings
        const defaultSettings = [
            ['store_name', 'RSA Store'],
            ['store_description', 'Toko Digital Terpercaya'],
            ['store_whatsapp', '6281234567890'],
            ['store_email', 'admin@rsastore.com'],
            ['store_telegram', '@RSAStore'],
            ['operating_hours_weekday', 'Senin - Jumat: 09:00 - 21:00 WIB'],
            ['operating_hours_weekend', 'Sabtu - Minggu: 10:00 - 18:00 WIB'],
            ['operating_hours_support', 'Support Email: 24/7'],
            ['qris_base_string', '00020101021126570011ID.DANA.WWW011893600915366813362702096681336270303UMI51440014ID.CO.QRIS.WWW0215ID10243259493930303UMI5204481453033605802ID5909RSA Store6015Kota Yogyakarta610555161'],
            ['qris_merchant_name', 'RSA Store'],
            ['webhook_api_key', 'CHANGE_THIS_SECRET_KEY'],
            ['smtp_host', 'smtp.gmail.com'],
            ['smtp_port', '587'],
            ['smtp_username', ''],
            ['smtp_password', ''],
            ['smtp_from_name', 'RSA Store'],
            ['smtp_active', '0'],
            ['token_expiry_minutes', '60']
        ];

        const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
        defaultSettings.forEach(([key, value]) => {
            insertSetting.run(key, value);
        });
        insertSetting.finalize();

        // Bot settings table
        db.run(`CREATE TABLE IF NOT EXISTS bot_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            telegram_bot_token TEXT,
            telegram_bot_enabled INTEGER DEFAULT 0,
            whatsapp_enabled INTEGER DEFAULT 0,
            whatsapp_session_status TEXT DEFAULT 'disconnected',
            whatsapp_phone_number TEXT,
            whatsapp_qr_code TEXT,
            whatsapp_qr_updated_at DATETIME,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Initialize default bot settings
        db.run(`INSERT OR IGNORE INTO bot_settings (id) VALUES (1)`);

        // Categories table
        db.run(`CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            slug TEXT NOT NULL UNIQUE,
            description TEXT,
            icon TEXT,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Insert default categories
        const defaultCategories = [
            ['E-Book', 'ebook', 'Koleksi buku digital premium', '📚'],
            ['Video Course', 'video', 'Kursus video pembelajaran', '🎬'],
            ['Akun Premium', 'account', 'Akun premium berbagai platform', '🔐'],
            ['Template', 'template', 'Template design profesional', '🎨'],
            ['Software', 'software', 'Software dan tools digital', '💻']
        ];

        const insertCategory = db.prepare('INSERT OR IGNORE INTO categories (name, slug, description, icon) VALUES (?, ?, ?, ?)');
        defaultCategories.forEach(cat => {
            insertCategory.run(...cat);
        });
        insertCategory.finalize();

        // Products table
        db.run(`CREATE TABLE IF NOT EXISTS products (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            description TEXT,
            price INTEGER NOT NULL,
            category_id INTEGER,
            stock INTEGER DEFAULT 0,
            is_digital BOOLEAN DEFAULT 1,
            file_type TEXT,
            file_path TEXT,
            download_link TEXT,
            image_url TEXT,
            features TEXT,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES categories(id)
        )`);

        // Orders table
        db.run(`CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_number TEXT NOT NULL UNIQUE,
            product_id TEXT NOT NULL,
            product_name TEXT NOT NULL,
            product_price INTEGER NOT NULL,
            unique_code INTEGER NOT NULL,
            total_amount INTEGER NOT NULL,
            customer_email TEXT,
            customer_whatsapp TEXT,
            customer_telegram TEXT,
            status TEXT DEFAULT 'pending',
            payment_method TEXT DEFAULT 'qris',
            qris_string TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            paid_at DATETIME,
            FOREIGN KEY (product_id) REFERENCES products(id)
        )`);

        // Download tokens table
        db.run(`CREATE TABLE IF NOT EXISTS download_tokens (
            token TEXT PRIMARY KEY,
            invoice_number TEXT NOT NULL,
            product_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            is_used BOOLEAN DEFAULT 0,
            download_count INTEGER DEFAULT 0,
            last_download_at DATETIME,
            FOREIGN KEY (invoice_number) REFERENCES orders(invoice_number),
            FOREIGN KEY (product_id) REFERENCES products(id)
        )`);

        // Admin users table
        db.run(`CREATE TABLE IF NOT EXISTS admin_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            email TEXT,
            two_fa_secret TEXT,
            two_fa_enabled INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME
        )`);

        // Admin logs table
        db.run(`CREATE TABLE IF NOT EXISTS admin_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT NOT NULL,
            description TEXT,
            ip_address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES admin_users(id)
        )`);

        // Blog categories table
        db.run(`CREATE TABLE IF NOT EXISTS blog_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            slug TEXT NOT NULL UNIQUE,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Insert default blog categories
        const defaultBlogCategories = [
            ['Tutorial', 'tutorial', 'Panduan dan tutorial lengkap'],
            ['Tips & Tricks', 'tips-tricks', 'Tips dan trik berguna'],
            ['News', 'news', 'Berita dan update terbaru'],
            ['Review', 'review', 'Review produk dan layanan']
        ];

        const insertBlogCategory = db.prepare('INSERT OR IGNORE INTO blog_categories (name, slug, description) VALUES (?, ?, ?)');
        defaultBlogCategories.forEach(cat => {
            insertBlogCategory.run(...cat);
        });
        insertBlogCategory.finalize();

        // Blog posts table
        db.run(`CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            excerpt TEXT,
            content TEXT NOT NULL,
            featured_image TEXT,
            category_id INTEGER,
            author_id INTEGER,
            status TEXT DEFAULT 'draft',
            published_at DATETIME,
            views INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES blog_categories(id),
            FOREIGN KEY (author_id) REFERENCES admin_users(id)
        )`);

        // Blog post downloads table
        db.run(`CREATE TABLE IF NOT EXISTS post_downloads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            file_path TEXT,
            file_url TEXT,
            file_size INTEGER,
            download_count INTEGER DEFAULT 0,
            requires_token BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
        )`);

        // Blog download tokens table
        db.run(`CREATE TABLE IF NOT EXISTS blog_download_tokens (
            token TEXT PRIMARY KEY,
            post_download_id INTEGER NOT NULL,
            email TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            is_used BOOLEAN DEFAULT 0,
            download_count INTEGER DEFAULT 0,
            FOREIGN KEY (post_download_id) REFERENCES post_downloads(id) ON DELETE CASCADE
        )`);

        // FAQ table
        db.run(`CREATE TABLE IF NOT EXISTS faqs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Insert default FAQs (only if table is empty)
        db.get('SELECT COUNT(*) as count FROM faqs', [], (err, result) => {
            if (!err && result.count === 0) {
                const defaultFAQs = [
                    ['Bagaimana cara melakukan pembayaran?', 'Kami menerima pembayaran melalui QRIS (DANA, OVO, GoPay, ShopeePay, dan semua e-wallet Indonesia). Setelah checkout, Anda akan mendapatkan QR Code yang bisa di-scan dengan aplikasi e-wallet Anda.', 1],
                    ['Berapa lama proses pengiriman produk digital?', 'Untuk produk digital, link download akan dikirim otomatis ke email Anda dalam 1-3 menit setelah pembayaran berhasil terdeteksi oleh sistem.', 2],
                    ['Bagaimana jika link download kedaluwarsa?', 'Anda bisa request link download baru kapan saja melalui halaman Invoice Recovery. Cukup masukkan nomor invoice dan salah satu kontak yang Anda gunakan saat checkout.', 3],
                    ['Apakah transaksi aman?', 'Ya, sangat aman. Kami menggunakan sistem pembayaran QRIS resmi yang terenkripsi. Data Anda dilindungi dengan teknologi keamanan terkini.', 4],
                    ['Bagaimana cara melacak pesanan saya?', 'Simpan nomor invoice yang dikirim ke email Anda. Nomor ini bisa digunakan untuk melacak status pesanan atau menghubungi customer support.', 5]
                ];

                const insertFAQ = db.prepare('INSERT INTO faqs (question, answer, sort_order) VALUES (?, ?, ?)');
                defaultFAQs.forEach(faq => {
                    insertFAQ.run(...faq);
                });
                insertFAQ.finalize();
            }
        });

        // Information pages table
        db.run(`CREATE TABLE IF NOT EXISTS pages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            content TEXT NOT NULL,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Expired link page content table
        db.run(`CREATE TABLE IF NOT EXISTS expired_page_content (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            title TEXT DEFAULT 'Link Download Telah Kedaluwarsa',
            subtitle TEXT DEFAULT 'Maaf, link download yang Anda akses sudah tidak berlaku lagi.',
            main_message TEXT DEFAULT 'Link download memiliki masa berlaku terbatas untuk keamanan transaksi Anda.',
            cta_text TEXT DEFAULT 'Request Link Download Baru',
            info_title TEXT DEFAULT 'Informasi Penting',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, function(err) {
            if (err) {
                console.error('Error creating expired_page_content table:', err);
                return;
            }
            
            // Insert default expired page content
            db.run(`INSERT OR IGNORE INTO expired_page_content (id, title, subtitle, main_message, cta_text, info_title) 
                    VALUES (1, 'Link Download Telah Kedaluwarsa', 
                            'Maaf, link download yang Anda akses sudah tidak berlaku lagi.',
                            'Link download memiliki masa berlaku terbatas untuk keamanan transaksi Anda.',
                            'Request Link Download Baru',
                            'Informasi Penting')`);
        });

        // Expired page FAQ table
        db.run(`CREATE TABLE IF NOT EXISTS expired_page_faqs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, function(err) {
            if (err) {
                console.error('Error creating expired_page_faqs table:', err);
                return;
            }
            
            // Insert default expired page FAQs
            db.get('SELECT COUNT(*) as count FROM expired_page_faqs', [], (err, result) => {
                if (!err && result.count === 0) {
                    const defaultExpiredFAQs = [
                        ['Kenapa link download ada batasannya?', 'Untuk melindungi file digital Anda dari penyalahgunaan dan pembajakan. Sistem ini memastikan hanya pembeli sah yang dapat mengunduh produk.', 1],
                        ['Berapa kali saya bisa request link baru?', 'Anda bisa request link download baru sebanyak yang Anda perlukan tanpa batasan, selama pesanan Anda sudah dibayar.', 2],
                        ['Saya lupa nomor invoice, bagaimana?', 'Nomor invoice dikirim ke email Anda saat checkout. Cek folder inbox atau spam. Jika masih tidak ketemu, hubungi customer support kami.', 3]
                    ];

                    const insertExpiredFAQ = db.prepare('INSERT INTO expired_page_faqs (question, answer, sort_order) VALUES (?, ?, ?)');
                    defaultExpiredFAQs.forEach(faq => {
                        insertExpiredFAQ.run(...faq);
                    });
                    insertExpiredFAQ.finalize();
                }
            });
        });

        // Insert default pages
        const defaultPages = [
            ['About Us', 'about-us', '<h2>Tentang Kami</h2><p>Selamat datang di toko kami. Kami adalah platform terpercaya yang menyediakan berbagai produk digital berkualitas tinggi.</p>'],
            ['Privacy Policy', 'privacy-policy', '<h2>Kebijakan Privasi</h2><p>Kami menghargai privasi Anda dan berkomitmen untuk melindungi data pribadi Anda.</p>'],
            ['Terms of Service', 'terms-of-service', '<h2>Syarat & Ketentuan</h2><p>Dengan menggunakan layanan kami, Anda setuju dengan syarat dan ketentuan berikut.</p>'],
            ['Refund Policy', 'refund-policy', '<h2>Kebijakan Pengembalian</h2><p>Informasi tentang kebijakan pengembalian dana kami.</p>']
        ];

        const insertPage = db.prepare('INSERT OR IGNORE INTO pages (title, slug, content) VALUES (?, ?, ?)');
        defaultPages.forEach(page => {
            insertPage.run(...page);
        });
        insertPage.finalize(() => {
            console.log('✅ Database initialized successfully');
            db.close();
        });
    });
}

// Helper function to get all settings as object
function getSettings(callback) {
    const db = getDB();
    db.all('SELECT key, value FROM settings', [], (err, rows) => {
        db.close();
        if (err) {
            return callback(err, null);
        }
        const settings = {};
        rows.forEach(row => {
            settings[row.key] = row.value;
        });
        callback(null, settings);
    });
}

// Helper function to update setting
function updateSetting(key, value, callback) {
    const db = getDB();
    db.run(
        'UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
        [value, key],
        function(err) {
            db.close();
            callback(err);
        }
    );
}

// Helper function to get single setting
function getSetting(key, callback) {
    const db = getDB();
    db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
        db.close();
        if (err || !row) {
            return callback(err, null);
        }
        callback(null, row.value);
    });
}

module.exports = {
    getDB,
    initDatabase,
    getSettings,
    getSetting,
    updateSetting
};
