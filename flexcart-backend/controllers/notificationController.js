const { pool } = require('../config/db');

const notificationController = {
  getNotifications: async (req, res) => {
    try {
      const { page = 1, limit = 20, unread_only } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);
      let whereClause = 'WHERE n.user_id = ?';
      const params = [req.user.id];
      if (unread_only === 'true') { whereClause += ' AND n.is_read = 0'; }

      const [notifications] = await pool.query(`SELECT n.* FROM notifications n ${whereClause} ORDER BY n.created_at DESC LIMIT ? OFFSET ?`, [...params, parseInt(limit), offset]);
      const [unreadCount] = await pool.query('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);

      res.json({ success: true, data: { notifications, unreadCount: unreadCount[0].count } });
    } catch (error) { console.error(error); res.status(500).json({ success: false, message: 'Server error' }); }
  },

  markAsRead: async (req, res) => {
    try {
      const { id } = req.params;
      if (id === 'all') { await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]); }
      else { await pool.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [id, req.user.id]); }
      res.json({ success: true, message: 'Marked as read' });
    } catch (error) { console.error(error); res.status(500).json({ success: false, message: 'Server error' }); }
  },

  deleteNotification: async (req, res) => {
    try {
      await pool.query('DELETE FROM notifications WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      res.json({ success: true, message: 'Deleted' });
    } catch (error) { console.error(error); res.status(500).json({ success: false, message: 'Server error' }); }
  }
};

module.exports = notificationController;