const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_your_stripe_secret_key_here');
const database = require('../utils/database');
const { authenticateToken } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Create payment intent
router.post('/create-payment-intent', authenticateToken, async (req, res) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items are required' });
    }

    // Get cart items for the user
    const cartItems = await database.query(`
      SELECT c.quantity, p.id, p.title, p.price
      FROM cart c
      JOIN products p ON c.product_id = p.id
      WHERE c.user_id = ? AND p.is_active = 1
    `, [req.user.id]);

    if (cartItems.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // Calculate total amount (in paise for Stripe - 1 INR = 100 paise)
    const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const amountInPaise = Math.round(totalAmount * 100); // Convert to paise

    // Create payment intent with INR currency
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInPaise,
      currency: 'inr',
      metadata: {
        user_id: req.user.id.toString(),
        user_email: req.user.email
      },
      description: `Digital Product Store - Order for ${req.user.name}`,
      receipt_email: req.user.email
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      amount: totalAmount,
      amountInPaise: amountInPaise,
      currency: 'inr'
    });
  } catch (error) {
    console.error('Payment intent creation error:', error);
    res.status(500).json({ error: 'Payment setup failed' });
  }
});

// Confirm payment and create order
router.post('/confirm-payment', authenticateToken, async (req, res) => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ error: 'Payment intent ID is required' });
    }

    // Verify payment intent
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    // Get cart items
    const cartItems = await database.query(`
      SELECT c.quantity, p.id, p.title, p.price, p.file_path
      FROM cart c
      JOIN products p ON c.product_id = p.id
      WHERE c.user_id = ? AND p.is_active = 1
    `, [req.user.id]);

    if (cartItems.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    // Calculate total
    const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Create order
    const orderResult = await database.run(`
      INSERT INTO orders (user_id, stripe_payment_intent, total_amount, status)
      VALUES (?, ?, ?, 'completed')
    `, [req.user.id, paymentIntentId, totalAmount]);

    const orderId = orderResult.id;

    // Create order items
    for (const item of cartItems) {
      await database.run(`
        INSERT INTO order_items (order_id, product_id, price)
        VALUES (?, ?, ?)
      `, [orderId, item.id, item.price]);
    }

    // Clear cart
    await database.run('DELETE FROM cart WHERE user_id = ?', [req.user.id]);

    // Get order details
    const order = await database.get(`
      SELECT o.*, u.name as user_name, u.email
      FROM orders o
      JOIN users u ON o.user_id = u.id
      WHERE o.id = ?
    `, [orderId]);

    const orderItems = await database.query(`
      SELECT oi.*, p.title, p.file_path
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `, [orderId]);

    res.json({
      message: 'Payment confirmed and order created successfully',
      order: {
        ...order,
        items: orderItems
      }
    });

  } catch (error) {
    console.error('Payment confirmation error:', error);
    res.status(500).json({ error: 'Payment confirmation failed' });
  }
});

// Get user's orders
router.get('/orders', authenticateToken, async (req, res) => {
  try {
    const orders = await database.query(`
      SELECT o.*, COUNT(oi.id) as item_count
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.user_id = ?
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `, [req.user.id]);

    res.json({ orders });
  } catch (error) {
    console.error('Orders fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download purchased product
router.get('/download/:orderId/:productId', authenticateToken, async (req, res) => {
  try {
    const { orderId, productId } = req.params;

    // Verify user owns this order and product
    const orderItem = await database.get(`
      SELECT oi.*, p.title, p.file_path, o.user_id
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      WHERE oi.order_id = ? AND oi.product_id = ? AND o.user_id = ?
    `, [orderId, productId, req.user.id]);

    if (!orderItem) {
      return res.status(404).json({ error: 'Product not found in your orders' });
    }

    // Check if file exists
    const filePath = path.join(__dirname, '..', orderItem.file_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Download file
    res.download(filePath, `${orderItem.title}.pdf`);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

// Get order details
router.get('/orders/:orderId', authenticateToken, async (req, res) => {
  try {
    const orderId = req.params.orderId;

    // Get order
    const order = await database.get(`
      SELECT o.*, u.name as user_name, u.email
      FROM orders o
      JOIN users u ON o.user_id = u.id
      WHERE o.id = ? AND o.user_id = ?
    `, [orderId, req.user.id]);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Get order items
    const orderItems = await database.query(`
      SELECT oi.*, p.title, p.description, p.image, p.file_path
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `, [orderId]);

    res.json({
      order: {
        ...order,
        items: orderItems
      }
    });
  } catch (error) {
    console.error('Order details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Webhook for Stripe events (for production)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      console.log('Payment succeeded:', event.data.object.id);
      break;
    case 'payment_intent.payment_failed':
      console.log('Payment failed:', event.data.object.id);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

module.exports = router;
