const { pool } = require('../config/db');
const { isValidQuantity } = require('../utils/validators');

const cartController = {
  getCart: async (req, res) => {
    try {
      let items = [];
      try {
        [items] = await pool.query(
          `SELECT c.*, p.name, p.current_price, p.old_price, p.image_url, p.discount_percentage, p.is_in_stock, p.stock_quantity, p.points_reward, p.is_cod_allowed, p.cod_advance_amount, comp.company_name, comp.company_logo,
          COALESCE(c.negotiated_price, p.current_price) as unit_price,
          (COALESCE(c.negotiated_price, p.current_price) * c.quantity) as total_price
          FROM cart c JOIN products p ON c.product_id = p.id JOIN companies comp ON p.company_id = comp.id
          WHERE c.user_id = ? AND p.status = 'active' ORDER BY c.created_at DESC`, [req.user.id]
        );
      } catch (_colErr) {
        // Fallback: missing optional columns (negotiated_price, cod, discount, points)
        [items] = await pool.query(
          `SELECT c.id, c.user_id, c.product_id, c.quantity, c.created_at,
                  p.name, p.current_price, p.old_price, p.image_url, p.is_in_stock, p.stock_quantity,
                  comp.company_name, comp.company_logo,
                  p.current_price as unit_price,
                  (p.current_price * c.quantity) as total_price,
                  NULL as negotiated_price, NULL as discount_percentage,
                  0 as is_cod_allowed, NULL as cod_advance_amount, 0 as points_reward
           FROM cart c JOIN products p ON c.product_id = p.id JOIN companies comp ON p.company_id = comp.id
           WHERE c.user_id = ? AND p.status = 'active' ORDER BY c.created_at DESC`,
          [req.user.id]
        );
      }

      const cartTotal = items.reduce((sum, item) => sum + parseFloat(item.total_price), 0);
      const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
      const codAdvanceTotal = items.reduce((sum, item) => {
        if (item.is_cod_allowed && item.cod_advance_amount != null && parseFloat(item.cod_advance_amount) > 0) {
          return sum + parseFloat(item.cod_advance_amount) * item.quantity;
        }
        return sum;
      }, 0);
      res.json({ success: true, data: { items, cartTotal: parseFloat(cartTotal.toFixed(2)), totalItems, codAdvanceTotal: parseFloat(codAdvanceTotal.toFixed(2)) } });
    } catch (error) {
      console.error('Get Cart Error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  addToCart: async (req, res) => {
    try {
      const { product_id, quantity = 1, negotiated_price } = req.body;
      const newQty = parseInt(quantity, 10) || 1;

      if (!Number.isInteger(newQty) || newQty < 1 || newQty > 999) {
        return res.status(400).json({ success: false, message: 'Quantity must be an integer between 1 and 999' });
      }

      const [products] = await pool.query(
        `SELECT p.*, c.user_id AS company_owner_id
         FROM products p
         JOIN companies c ON p.company_id = c.id
         WHERE p.id = ? AND p.status = 'active'`,
        [product_id]
      );
      if (products.length === 0) return res.status(404).json({ success: false, message: 'Product not found' });
      if (Number(products[0].company_owner_id) === Number(req.user.id)) {
        return res.status(403).json({ success: false, message: 'You cannot buy your own product' });
      }

      // Check existing cart qty so total doesn't exceed stock
      const [existing] = await pool.query(
        'SELECT quantity FROM cart WHERE user_id = ? AND product_id = ?',
        [req.user.id, product_id]
      );
      const existingQty = existing.length > 0 ? parseInt(existing[0].quantity, 10) : 0;
      const totalQty = existingQty + newQty;
      const stockQty = parseInt(products[0].stock_quantity, 10);

      if (!products[0].is_in_stock || stockQty < totalQty) {
        const msg = existingQty > 0
          ? `Only ${stockQty} available (you already have ${existingQty} in cart)`
          : `Only ${stockQty} units available`;
        return res.status(400).json({ success: false, message: msg });
      }

      const negPrice = negotiated_price ? parseFloat(negotiated_price) : null;
      if (negPrice !== null) {
        if (isNaN(negPrice) || negPrice <= 0 || negPrice > parseFloat(products[0].current_price)) {
          return res.status(400).json({ success: false, message: 'Negotiated price must be a positive number not exceeding the listed price' });
        }
        // Verify the negotiated price is backed by an accepted AI negotiation for this user+product
        const [acceptedNeg] = await pool.query(
          `SELECT id FROM ai_negotiations
           WHERE user_id = ? AND product_id = ? AND status = 'accepted'
             AND final_price IS NOT NULL AND ABS(final_price - ?) < 0.01
           LIMIT 1`,
          [req.user.id, product_id, negPrice]
        );
        if (acceptedNeg.length === 0) {
          return res.status(400).json({ success: false, message: 'No accepted negotiation found for this price. Please negotiate the price through the AI negotiator first.' });
        }
      }

      await pool.query(
        `INSERT INTO cart (user_id, product_id, quantity, negotiated_price) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity, negotiated_price = COALESCE(EXCLUDED.negotiated_price, cart.negotiated_price), updated_at = NOW()`,
        [req.user.id, product_id, totalQty, negPrice]
      );

      const [cartCount] = await pool.query('SELECT SUM(quantity) as count FROM cart WHERE user_id = ?', [req.user.id]);
      res.json({ success: true, message: 'Product added to cart', data: { cartCount: cartCount[0].count || 0 } });
    } catch (error) {
      console.error('Add to Cart Error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  updateCartItem: async (req, res) => {
    try {
      const { id } = req.params;
      const { quantity } = req.body;
      const qty = parseInt(quantity, 10);
      if (!Number.isInteger(qty) || qty < 0 || qty > 999) {
        return res.status(400).json({ success: false, message: 'Quantity must be an integer between 0 and 999' });
      }
      if (qty <= 0) { await pool.query('DELETE FROM cart WHERE id = ? AND user_id = ?', [id, req.user.id]); return res.json({ success: true, message: 'Item removed' }); }
      // Enforce stock limit
      const [rows] = await pool.query(
        `SELECT p.stock_quantity FROM cart c JOIN products p ON c.product_id = p.id WHERE c.id = ? AND c.user_id = ?`,
        [id, req.user.id]
      );
      if (rows.length > 0 && qty > rows[0].stock_quantity) {
        return res.status(400).json({ success: false, message: `Only ${rows[0].stock_quantity} in stock` });
      }
      await pool.query('UPDATE cart SET quantity = ?, updated_at = NOW() WHERE id = ? AND user_id = ?', [qty, id, req.user.id]);
      res.json({ success: true, message: 'Cart updated' });
    } catch (error) {
      console.error('Update Cart Error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  removeFromCart: async (req, res) => {
    try {
      await pool.query('DELETE FROM cart WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      res.json({ success: true, message: 'Item removed from cart' });
    } catch (error) {
      console.error('Remove from Cart Error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  clearCart: async (req, res) => {
    try {
      await pool.query('DELETE FROM cart WHERE user_id = ?', [req.user.id]);
      res.json({ success: true, message: 'Cart cleared' });
    } catch (error) {
      console.error('Clear Cart Error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
};

module.exports = cartController;