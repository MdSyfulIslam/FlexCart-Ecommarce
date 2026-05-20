const { pool } = require('../config/db');

const feedbackController = {
  submitFeedback: async (req, res) => {
    try {
      const { subject, message, feedback_type, company_id } = req.body;
      if (!message || message.trim().length === 0)
        return res.status(400).json({ success: false, message: 'Feedback message is required' });

      const userId = req.user ? req.user.id : null;
      const name = req.user ? req.user.username : req.body.name;
      const email = req.user ? req.user.email : req.body.email;
      const type = feedback_type === 'complaint' ? 'complaint' : 'feedback';
      const cid = (type === 'complaint' && company_id) ? company_id : null;

      await pool.query(
        'INSERT INTO feedbacks (user_id, name, email, subject, message, feedback_type, company_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, name || null, email || null, subject || 'General Feedback', message.trim(), type, cid]
      );
      res.status(201).json({ success: true, message: 'Thank you for your feedback!' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  getMyFeedbacks: async (req, res) => {
    try {
      const [feedbacks] = await pool.query(
        'SELECT * FROM feedbacks WHERE user_id = ? ORDER BY created_at DESC',
        [req.user.id]
      );
      res.json({ success: true, data: feedbacks });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
};

module.exports = feedbackController;