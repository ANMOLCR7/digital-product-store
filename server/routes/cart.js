const express = require('express');
const { body, validationResult } = require('express-validator');
const database = require('../utils/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get user's cart
router.get('/', authenticateToken, async (req, res) => {
  try {
    const cartItems = await database.query(`
      SELECT c.id, c.quantity, c.created_at,
             p.id as product_id, p.title, p.description, p.price, p.image, p.category
      FROM cart c
      JOIN products p ON c.product_id = p.id
      WHERE c.user_id = ? AND p.is_active = 1
      ORDER BY c.created_at DESC
    `, [req.user.id]);

    // Calculate totals
    const total = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

    res.json({
      items: cartItems,
      total: parseFloat(total.toFixed(2)),
      itemCount
    });
  } catch (error) {
    console.error('Cart fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add item to cart
router.post('/add', authenticateToken, [
  body('productId').isInt().withMessage('Valid product ID is required'),
  body('quantity').optional().isInt({ min: 1 }).withMessage('Quantity must be at least 1')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { productId, quantity = 1 } = req.body;

    // Check if product exists and is active
    const product = await database.get('SELECT id, price FROM products WHERE id = ? AND is_active = 1', [productId]);
    if (!product) {
      return res.status(404).json({ error: 'Product not found or unavailable' });
    }

    // Check if item already exists in cart
    const existingItem = await database.get('SELECT id, quantity FROM cart WHERE user_id = ? AND product_id = ?', [req.user.id, productId]);

    if (existingItem) {
      // Update quantity
      const newQuantity = existingItem.quantity + quantity;
      await database.run('UPDATE cart SET quantity = ? WHERE id = ?', [newQuantity, existingItem.id]);
      
      res.json({ 
        message: 'Cart updated successfully',
        quantity: newQuantity
      });
    } else {
      // Add new item
      await database.run('INSERT INTO cart (user_id, product_id, quantity) VALUES (?, ?, ?)', [req.user.id, productId, quantity]);
      
      res.status(201).json({ 
        message: 'Item added to cart successfully',
        quantity
      });
    }
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update cart item quantity
router.put('/update/:itemId', authenticateToken, [
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { quantity } = req.body;
    const itemId = req.params.itemId;

    // Check if cart item exists and belongs to user
    const cartItem = await database.get('SELECT id FROM cart WHERE id = ? AND user_id = ?', [itemId, req.user.id]);
    if (!cartItem) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    await database.run('UPDATE cart SET quantity = ? WHERE id = ?', [quantity, itemId]);

    res.json({ 
      message: 'Cart updated successfully',
      quantity
    });
  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove item from cart
router.delete('/remove/:itemId', authenticateToken, async (req, res) => {
  try {
    const itemId = req.params.itemId;

    // Check if cart item exists and belongs to user
    const cartItem = await database.get('SELECT id FROM cart WHERE id = ? AND user_id = ?', [itemId, req.user.id]);
    if (!cartItem) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    await database.run('DELETE FROM cart WHERE id = ?', [itemId]);

    res.json({ message: 'Item removed from cart successfully' });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear entire cart
router.delete('/clear', authenticateToken, async (req, res) => {
  try {
    await database.run('DELETE FROM cart WHERE user_id = ?', [req.user.id]);

    res.json({ message: 'Cart cleared successfully' });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get cart summary (for header display)
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const result = await database.get(`
      SELECT COUNT(*) as itemCount, SUM(c.quantity * p.price) as total
      FROM cart c
      JOIN products p ON c.product_id = p.id
      WHERE c.user_id = ? AND p.is_active = 1
    `, [req.user.id]);

    res.json({
      itemCount: result.itemCount || 0,
      total: parseFloat((result.total || 0).toFixed(2))
    });
  } catch (error) {
    console.error('Cart summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 