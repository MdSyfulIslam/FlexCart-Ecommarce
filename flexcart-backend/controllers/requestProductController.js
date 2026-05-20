const { pool } = require('../config/db');

const requestProductController = {
  getRequestedProducts: async (req, res) => {
    try {
      const [requests] = await pool.query(
        `SELECT pr.*, p.name, p.image_url, p.current_price, p.is_in_stock, c.company_name FROM product_requests pr JOIN products p ON pr.product_id = p.id JOIN companies c ON p.company_id = c.id WHERE pr.user_id = ? ORDER BY pr.created_at DESC`, [req.user.id]
      );
      res.json({ success: true, data: requests });
    } catch (error) { console.error(error); res.status(500).json({ success: false, message: 'Server error' }); }
  },

  requestProduct: async (req, res) => {
    try {
      const { product_id } = req.body;
      const [products] = await pool.query("SELECT p.*, c.id as cid FROM products p JOIN companies c ON p.company_id = c.id WHERE p.id = ? AND p.status = 'active'", [product_id]);
      if (products.length === 0) return res.status(404).json({ success: false, message: 'Product not found' });
      if (products[0].is_in_stock) return res.status(400).json({ success: false, message: 'Product is already in stock' });

      const [existing] = await pool.query('SELECT id FROM product_requests WHERE user_id = ? AND product_id = ?', [req.user.id, product_id]);
      if (existing.length > 0) return res.json({ success: true, message: 'You already requested this product.' });

      await pool.query('INSERT INTO product_requests (user_id, product_id) VALUES (?, ?)', [req.user.id, product_id]);

      // Count total requests for this product
      const [countRows] = await pool.query('SELECT COUNT(*) as cnt FROM product_requests WHERE product_id = ?', [product_id]);
      const count = countRows[0].cnt;

      // Notify the company
      await pool.query(
        `INSERT INTO company_notifications (company_id, type, title, message, reference_id, reference_type)
         VALUES (?, 'system', 'Product Request', ?, ?, 'product')`,
        [products[0].cid,
         `A customer requested "${products[0].name}". ${count} customer${count !== 1 ? 's' : ''} waiting.`,
         product_id]
      );

      res.json({ success: true, message: 'Request added. You will be notified when available.' });
    } catch (error) { console.error(error); res.status(500).json({ success: false, message: 'Server error' }); }
  },

  removeRequest: async (req, res) => {
    try {
      await pool.query('DELETE FROM product_requests WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      res.json({ success: true, message: 'Request removed' });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  }
};

module.exports = requestProductController;