const express = require('express');
const { body, validationResult } = require('express-validator');
const database = require('../utils/database');
const { authenticateToken, requireAdmin, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Get all products with optional filtering
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { category, search, minPrice, maxPrice, sort = 'created_at', order = 'DESC' } = req.query;
    
    let sql = 'SELECT * FROM products WHERE is_active = 1';
    const params = [];

    // Add filters
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    if (search) {
      sql += ' AND (title LIKE ? OR description LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    if (minPrice) {
      sql += ' AND price >= ?';
      params.push(parseFloat(minPrice));
    }

    if (maxPrice) {
      sql += ' AND price <= ?';
      params.push(parseFloat(maxPrice));
    }

    // Add sorting
    const allowedSortFields = ['title', 'price', 'created_at', 'category'];
    const allowedOrders = ['ASC', 'DESC'];
    
    if (allowedSortFields.includes(sort) && allowedOrders.includes(order.toUpperCase())) {
      sql += ` ORDER BY ${sort} ${order.toUpperCase()}`;
    } else {
      sql += ' ORDER BY created_at DESC';
    }

    const products = await database.query(sql, params);
    res.json({ products });
  } catch (error) {
    console.error('Products fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get product categories
router.get('/categories/list', async (req, res) => {
  try {
    const categories = await database.query(
      'SELECT DISTINCT category FROM products WHERE is_active = 1 ORDER BY category'
    );
    
    res.json({ 
      categories: categories.map(cat => cat.category) 
    });
  } catch (error) {
    console.error('Categories fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});



// Get product by ID
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const product = await database.get('SELECT * FROM products WHERE id = ? AND is_active = 1', [req.params.id]);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ product });
  } catch (error) {
    console.error('Product fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Create new product
router.post('/', authenticateToken, requireAdmin, [
  body('title').trim().isLength({ min: 1 }).withMessage('Title is required'),
  body('description').trim().isLength({ min: 1 }).withMessage('Description is required'),
  body('price').isFloat({ min: 0 }).withMessage('Valid price is required'),
  body('category').trim().isLength({ min: 1 }).withMessage('Category is required'),
  body('file_path').trim().isLength({ min: 1 }).withMessage('File path is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, description, price, category, image, file_path } = req.body;

    const result = await database.run(
      'INSERT INTO products (title, description, price, category, image, file_path) VALUES (?, ?, ?, ?, ?, ?)',
      [title, description, price, category, image || null, file_path]
    );

    const product = await database.get('SELECT * FROM products WHERE id = ?', [result.id]);

    res.status(201).json({
      message: 'Product created successfully',
      product
    });
  } catch (error) {
    console.error('Product creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Update product
router.put('/:id', authenticateToken, requireAdmin, [
  body('title').optional().trim().isLength({ min: 1 }).withMessage('Title cannot be empty'),
  body('description').optional().trim().isLength({ min: 1 }).withMessage('Description cannot be empty'),
  body('price').optional().isFloat({ min: 0 }).withMessage('Valid price is required'),
  body('category').optional().trim().isLength({ min: 1 }).withMessage('Category cannot be empty')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, description, price, category, image, file_path } = req.body;
    const productId = req.params.id;

    // Check if product exists
    const existingProduct = await database.get('SELECT id FROM products WHERE id = ?', [productId]);
    if (!existingProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const updates = [];
    const params = [];

    if (title) {
      updates.push('title = ?');
      params.push(title);
    }

    if (description) {
      updates.push('description = ?');
      params.push(description);
    }

    if (price !== undefined) {
      updates.push('price = ?');
      params.push(price);
    }

    if (category) {
      updates.push('category = ?');
      params.push(category);
    }

    if (image !== undefined) {
      updates.push('image = ?');
      params.push(image);
    }

    if (file_path) {
      updates.push('file_path = ?');
      params.push(file_path);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(productId);

    await database.run(
      `UPDATE products SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const product = await database.get('SELECT * FROM products WHERE id = ?', [productId]);

    res.json({
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    console.error('Product update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Delete product (soft delete)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const productId = req.params.id;

    // Check if product exists
    const existingProduct = await database.get('SELECT id FROM products WHERE id = ?', [productId]);
    if (!existingProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Soft delete by setting is_active to 0
    await database.run(
      'UPDATE products SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [productId]
    );

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Product deletion error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Get all products (including inactive)
router.get('/admin/all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const products = await database.query('SELECT * FROM products ORDER BY created_at DESC');
    res.json({ products });
  } catch (error) {
    console.error('Admin products fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 