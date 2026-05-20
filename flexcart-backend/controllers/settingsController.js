const { pool } = require('../config/db');

const settingsController = {
  getSettings: async (req, res) => {
    try {
      const [settings] = await pool.query(
        'SELECT * FROM user_settings WHERE user_id = ?',
        [req.user.id]
      );

      if (settings.length === 0) {
        await pool.query('INSERT INTO user_settings (user_id) VALUES (?)', [req.user.id]);
        const [newSettings] = await pool.query(
          'SELECT * FROM user_settings WHERE user_id = ?',
          [req.user.id]
        );
        return res.json({ success: true, data: newSettings[0] });
      }

      res.json({ success: true, data: settings[0] });
    } catch (error) {
      console.error('Get Settings Error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  updateSettings: async (req, res) => {
    try {
      const allowedFields = [
        'language', 'currency', 'email_notifications', 'push_notifications',
        'order_updates', 'promotional_emails', 'two_factor_auth', 'privacy_profile',
        'auto_play_animations', 'data_sharing'
      ];

      const setClause = [];
      const values = [];

      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          setClause.push(`${field} = ?`);
          values.push(req.body[field]);
        }
      }

      if (setClause.length === 0) {
        return res.status(400).json({ success: false, message: 'No settings to update' });
      }

      values.push(req.user.id);

      await pool.query(
        `UPDATE user_settings SET ${setClause.join(', ')} WHERE user_id = ?`,
        values
      );

      res.json({ success: true, message: 'Settings updated' });
    } catch (error) {
      console.error('Update Settings Error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  updateTheme: async (req, res) => {
    try {
      const { theme } = req.body;
      if (!['light', 'dark'].includes(theme)) {
        return res.status(400).json({ success: false, message: 'Invalid theme' });
      }

      await pool.query('UPDATE users SET theme = ? WHERE id = ?', [theme, req.user.id]);
      res.json({ success: true, message: 'Theme updated', data: { theme } });
    } catch (error) {
      console.error('Update Theme Error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  updateAppearanceColor: async (req, res) => {
    try {
      const { color } = req.body;
      await pool.query('UPDATE users SET appearance_color = ? WHERE id = ?', [color, req.user.id]);
      res.json({ success: true, message: 'Appearance updated', data: { appearance_color: color } });
    } catch (error) {
      console.error('Update Appearance Error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  updateBackground: async (req, res) => {
    try {
      const { background_image } = req.body;
      // Reject javascript:/data: URLs and other unsafe schemes
      if (background_image && !/^https?:\/\//i.test(background_image)) {
        return res.status(400).json({ success: false, message: 'Background image must be a valid http/https URL' });
      }
      await pool.query('UPDATE users SET background_image = ? WHERE id = ?', [background_image || null, req.user.id]);
      res.json({ success: true, message: 'Background updated' });
    } catch (error) {
      console.error('Update Background Error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  getBackgroundThemes: async (req, res) => {
    try {
      const [themes] = await pool.query(
        'SELECT * FROM background_themes WHERE is_active = 1 ORDER BY sort_order ASC'
      );
      res.json({ success: true, data: themes });
    } catch (error) {
      console.error('Get Background Themes Error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  changePassword: async (req, res) => {
    try {
      const bcrypt = require('bcryptjs');
      const { old_password, new_password } = req.body;

      if (!old_password || !new_password) {
        return res.status(400).json({ success: false, message: 'Current and new password are required' });
      }
      if (new_password.length < 6) {
        return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
      }
      if (old_password === new_password) {
        return res.status(400).json({ success: false, message: 'New password must be different from the current password' });
      }

      const [users] = await pool.query('SELECT password_hash, role FROM users WHERE id = ?', [req.user.id]);
      if (users.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

      const isMatch = await bcrypt.compare(old_password, users[0].password_hash);
      if (!isMatch) return res.status(401).json({ success: false, message: 'Current password is incorrect' });

      const hash = await bcrypt.hash(new_password, 12);

      await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);

      res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
};

module.exports = settingsController;