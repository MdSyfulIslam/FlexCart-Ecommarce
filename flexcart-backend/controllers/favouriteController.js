const { pool } = require('../config/db');

const favouriteController = {
  getFavourites: async (req, res) => {
    try {
      const [favourites] = await pool.query(
        `SELECT f.id as favourite_id, p.*, c.company_name, c.company_logo FROM favourites f JOIN products p ON f.product_id = p.id JOIN companies c ON p.company_id = c.id WHERE f.user_id = ? AND p.status = 'active' ORDER BY f.created_at DESC`, [req.user.id]
      );
      res.json({ success: true, data: favourites });
    } catch (error) { console.error(error); res.status(500).json({ success: false, message: 'Server error' }); }
  },

  toggleFavourite: async (req, res) => {
    try {
      const { product_id } = req.body;
      const [existing] = await pool.query('SELECT id FROM favourites WHERE user_id = ? AND product_id = ?', [req.user.id, product_id]);
      if (existing.length > 0) {
        await pool.query('DELETE FROM favourites WHERE id = ?', [existing[0].id]);
        res.json({ success: true, message: 'Removed', data: { isFavourite: false } });
      } else {
        await pool.query('INSERT INTO favourites (user_id, product_id) VALUES (?, ?)', [req.user.id, product_id]);
        res.json({ success: true, message: 'Added', data: { isFavourite: true } });
      }
    } catch (error) { console.error(error); res.status(500).json({ success: false, message: 'Server error' }); }
  },

  checkFavourite: async (req, res) => {
    try {
      const [result] = await pool.query('SELECT id FROM favourites WHERE user_id = ? AND product_id = ?', [req.user.id, req.params.product_id]);
      res.json({ success: true, data: { isFavourite: result.length > 0 } });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  }
};

module.exports = favouriteController;