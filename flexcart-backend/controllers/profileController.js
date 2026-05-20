const { pool } = require('../config/db');

const profileController = {
  getProfile: async (req, res) => {
    try {
      const [users] = await pool.query(
        `SELECT id, username, email, phone, address, city, country, zip_code, profile_image, description, date_of_birth, gender, points, stars, theme, background_image, appearance_color, role, assigned_branch_id, is_approved, salary, is_seller, is_verified, status, created_at
         FROM users WHERE id = ?`,
        [req.user.id]
      );
      if (users.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

      const [settings] = await pool.query('SELECT * FROM user_settings WHERE user_id = ?', [req.user.id]);
      res.json({ success: true, data: { ...users[0], settings: settings[0] || {} } });
    } catch (error) { console.error(error); res.status(500).json({ success: false, message: 'Server error' }); }
  },

  updateProfile: async (req, res) => {
    try {
      const allowedFields = ['username', 'phone', 'address', 'city', 'country', 'zip_code', 'description', 'date_of_birth', 'gender'];
      const setClause = [];
      const values = [];

      for (const field of allowedFields) {
        if (req.body[field] !== undefined) { setClause.push(`${field} = ?`); values.push(req.body[field]); }
      }
      if (req.file) { setClause.push('profile_image = ?'); values.push(req.file.path); }
      if (setClause.length === 0) return res.status(400).json({ success: false, message: 'No fields to update' });

      values.push(req.user.id);
      await pool.query(`UPDATE users SET ${setClause.join(', ')} WHERE id = ?`, values);

      const [updated] = await pool.query(
        `SELECT id, username, email, phone, address, city, country, zip_code, profile_image, description, date_of_birth, gender, points, stars, theme, background_image, appearance_color, role, assigned_branch_id, is_approved, salary, is_seller, status
         FROM users WHERE id = ?`,
        [req.user.id]
      );

      res.json({ success: true, message: 'Profile updated', data: updated[0] });
    } catch (error) { console.error(error); res.status(500).json({ success: false, message: 'Server error' }); }
  },

  uploadProfileImage: async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, message: 'No image provided' });
      const imageUrl = req.file.path;
      await pool.query('UPDATE users SET profile_image = ? WHERE id = ?', [imageUrl, req.user.id]);
      res.json({ success: true, message: 'Profile image updated', data: { profile_image: imageUrl } });
    } catch (error) { console.error(error); res.status(500).json({ success: false, message: 'Server error' }); }
  }
};

module.exports = profileController;