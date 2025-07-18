const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const database = require('../utils/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx', '.txt', '.zip', '.rar'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, DOCX, TXT, ZIP, RAR files are allowed.'));
    }
  }
});

// Apply admin middleware to all routes
router.use(authenticateToken, requireAdmin);

// Dashboard analytics
router.get('/dashboard', async (req, res) => {
  try {
    // Get total sales
    const totalSales = await database.get(`
      SELECT COUNT(*) as total_orders, SUM(total_amount) as total_revenue
      FROM orders WHERE status = 'completed'
    `);

    // Get recent orders
    const recentOrders = await database.query(`
      SELECT o.*, u.name as user_name, u.email
      FROM orders o
      JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
      LIMIT 10
    `);

    // Get top products
    const topProducts = await database.query(`
      SELECT p.title, COUNT(oi.id) as sales_count, SUM(oi.price) as total_revenue
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status = 'completed'
      GROUP BY p.id
      ORDER BY sales_count DESC
      LIMIT 5
    `);

    // Get user count
    const userCount = await database.get('SELECT COUNT(*) as count FROM users WHERE role = "user"');

    res.json({
      analytics: {
        totalOrders: totalSales.total_orders || 0,
        totalRevenue: parseFloat((totalSales.total_revenue || 0).toFixed(2)),
        totalUsers: userCount.count || 0
      },
      recentOrders,
      topProducts
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all users
router.get('/users', async (req, res) => {
  try {
    const users = await database.query(`
      SELECT id, name, email, role, created_at, updated_at
      FROM users
      ORDER BY created_at DESC
    `);

    res.json({ users });
  } catch (error) {
    console.error('Users fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user role
router.put('/users/:userId/role', [
  body('role').isIn(['user', 'admin']).withMessage('Role must be user or admin')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { role } = req.body;
    const userId = req.params.userId;

    // Prevent admin from removing their own admin role
    if (userId == req.user.id) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    await database.run('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [role, userId]);

    res.json({ message: 'User role updated successfully' });
  } catch (error) {
    console.error('User role update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all orders
router.get('/orders', async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let sql = `
      SELECT o.*, u.name as user_name, u.email, COUNT(oi.id) as item_count
      FROM orders o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
    `;

    const params = [];
    if (status) {
      sql += ' WHERE o.status = ?';
      params.push(status);
    }

    sql += ' GROUP BY o.id ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const orders = await database.query(sql, params);

    res.json({ orders });
  } catch (error) {
    console.error('Orders fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update order status
router.put('/orders/:orderId/status', [
  body('status').isIn(['pending', 'completed', 'cancelled']).withMessage('Invalid status')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { status } = req.body;
    const orderId = req.params.orderId;

    await database.run('UPDATE orders SET status = ? WHERE id = ?', [status, orderId]);

    res.json({ message: 'Order status updated successfully' });
  } catch (error) {
    console.error('Order status update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload product file
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = `uploads/${req.file.filename}`;
    
    res.json({
      message: 'File uploaded successfully',
      filePath,
      fileName: req.file.originalname,
      fileSize: req.file.size
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: 'File upload failed' });
  }
});

// Create product with file upload
router.post('/products', upload.single('file'), [
  body('title').trim().isLength({ min: 1 }).withMessage('Title is required'),
  body('description').trim().isLength({ min: 1 }).withMessage('Description is required'),
  body('price').isFloat({ min: 0 }).withMessage('Valid price is required'),
  body('category').trim().isLength({ min: 1 }).withMessage('Category is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Product file is required' });
    }

    const { title, description, price, category } = req.body;
    const filePath = `uploads/${req.file.filename}`;

    const result = await database.run(
      'INSERT INTO products (title, description, price, category, file_path) VALUES (?, ?, ?, ?, ?)',
      [title, description, price, category, filePath]
    );

    const product = await database.get('SELECT * FROM products WHERE id = ?', [result.id]);

    res.status(201).json({
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    console.error('Product creation error:', error);
    res.status(500).json({ error: 'Product creation failed' });
  }
});

// Get sales analytics
router.get('/analytics/sales', async (req, res) => {
  try {
    const { period = '30' } = req.query; // days

    const salesData = await database.query(`
      SELECT 
        DATE(o.created_at) as date,
        COUNT(*) as orders,
        SUM(o.total_amount) as revenue
      FROM orders o
      WHERE o.status = 'completed' 
        AND o.created_at >= DATE('now', '-${period} days')
      GROUP BY DATE(o.created_at)
      ORDER BY date DESC
    `);

    res.json({ salesData });
  } catch (error) {
    console.error('Sales analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get product analytics
router.get('/analytics/products', async (req, res) => {
  try {
    const productAnalytics = await database.query(`
      SELECT 
        p.id,
        p.title,
        p.category,
        COUNT(oi.id) as sales_count,
        SUM(oi.price) as total_revenue,
        AVG(oi.price) as avg_price
      FROM products p
      LEFT JOIN order_items oi ON p.id = oi.product_id
      LEFT JOIN orders o ON oi.order_id = o.id AND o.status = 'completed'
      WHERE p.is_active = 1
      GROUP BY p.id
      ORDER BY sales_count DESC
    `);

    res.json({ productAnalytics });
  } catch (error) {
    console.error('Product analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 