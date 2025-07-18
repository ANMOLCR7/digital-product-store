const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'store.db');
const db = new sqlite3.Database(dbPath);

console.log('Setting up database...');

// Create tables
db.serialize(() => {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Products table
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      image TEXT,
      file_path TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Orders table
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      stripe_payment_intent TEXT,
      total_amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  // Order items table
  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders (id),
      FOREIGN KEY (product_id) REFERENCES products (id)
    )
  `);

  // Cart table
  db.run(`
    CREATE TABLE IF NOT EXISTS cart (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (product_id) REFERENCES products (id)
    )
  `);

  // Insert sample data with realistic Indian pricing
  db.run(`
    INSERT OR IGNORE INTO products (title, description, price, image, file_path, category) VALUES
    ('Complete Class 12 Physics Notes', 'Comprehensive physics notes covering all chapters with solved examples, formulas, and important questions for CBSE Class 12.', 299, '/assets/physics-notes.png', 'downloads/class12-physics-notes.pdf', 'education'),
    ('Class 12 Chemistry Complete Guide', 'Detailed chemistry notes with organic chemistry reactions, inorganic chemistry concepts, and physical chemistry formulas.', 349, '/assets/chemistry-guide.png', 'downloads/class12-chemistry-guide.pdf', 'education'),
    ('JEE Main Mathematics Formula Book', 'Complete mathematics formula book with 500+ formulas, shortcuts, and solved examples for JEE Main preparation.', 199, '/assets/jee-math-formulas.png', 'downloads/jee-mathematics-formulas.pdf', 'education'),
    ('Professional Resume Template Pack', 'Collection of 10 professional resume templates in Word format suitable for IT, Marketing, Finance, and other industries.', 149, '/assets/resume-templates.png', 'downloads/professional-resume-templates.zip', 'templates'),
    ('Business Plan Template Bundle', 'Complete business plan templates with financial projections, market analysis, and executive summary formats.', 399, '/assets/business-plan.png', 'downloads/business-plan-templates.pdf', 'templates'),
    ('Python Programming for Beginners', 'Complete Python programming guide with 50+ coding exercises, projects, and real-world examples.', 249, '/assets/python-guide.png', 'downloads/python-programming-guide.pdf', 'education'),
    ('Digital Marketing Strategy Guide', 'Comprehensive digital marketing guide covering SEO, social media, email marketing, and content strategy.', 199, '/assets/digital-marketing.png', 'downloads/digital-marketing-guide.pdf', 'business'),
    ('Web Development Project Templates', '10 responsive website templates with HTML, CSS, and JavaScript code for portfolio, business, and e-commerce sites.', 299, '/assets/web-templates.png', 'downloads/web-development-templates.zip', 'templates'),
    ('Financial Accounting Notes', 'Complete accounting notes with journal entries, ledger accounts, trial balance, and financial statements.', 179, '/assets/accounting-notes.png', 'downloads/financial-accounting-notes.pdf', 'education'),
    ('Data Science Fundamentals', 'Introduction to data science with Python, including data analysis, visualization, and machine learning basics.', 449, '/assets/data-science.png', 'downloads/data-science-fundamentals.pdf', 'education'),
    ('IELTS Speaking Practice Material', 'Complete IELTS speaking practice with 100+ sample questions, model answers, and pronunciation tips.', 129, '/assets/ielts-speaking.png', 'downloads/ielts-speaking-practice.pdf', 'education'),
    ('UPSC Civil Services Notes', 'Comprehensive notes covering Indian Polity, History, Geography, Economics, and Current Affairs for UPSC preparation.', 599, '/assets/upsc-notes.png', 'downloads/upsc-civil-services-notes.pdf', 'education'),
    ('Stock Market Trading Guide', 'Complete guide to stock market trading with technical analysis, fundamental analysis, and risk management strategies.', 349, '/assets/stock-trading.png', 'downloads/stock-market-trading-guide.pdf', 'business'),
    ('Content Writing Masterclass', 'Professional content writing course covering blog writing, copywriting, SEO content, and social media content.', 199, '/assets/content-writing.png', 'downloads/content-writing-masterclass.pdf', 'business'),
    ('Mobile App Development Guide', 'Complete guide to mobile app development using React Native with 5 complete app projects and source code.', 399, '/assets/mobile-app.png', 'downloads/mobile-app-development-guide.pdf', 'education')
  `);

  // Insert admin user
  db.run(`
    INSERT OR IGNORE INTO users (email, password, name, role) VALUES
    ('admin@store.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Admin User', 'admin')
  `, (err) => {
    if (err) {
      console.error('Error inserting admin user:', err);
    } else {
      console.log('Admin user created: admin@store.com / password');
    }
  });

  console.log('Database setup completed!');
});

db.close(); 