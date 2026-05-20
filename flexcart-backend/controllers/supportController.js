const { pool } = require('../config/db');

const supportController = {
  getSupportInfo: async (req, res) => {
    try {
      const [info] = await pool.query('SELECT * FROM support_info WHERE is_active = 1 ORDER BY sort_order ASC');
      const grouped = {
        phone: info.filter(i => i.type === 'phone'),
        email: info.filter(i => i.type === 'email'),
        address: info.filter(i => i.type === 'address'),
        hours: info.filter(i => i.type === 'hours'),
        social: info.filter(i => i.type === 'social'),
        faq: info.filter(i => i.type === 'faq')
      };
      res.json({ success: true, data: grouped });
    } catch (error) { console.error(error); res.status(500).json({ success: false, message: 'Server error' }); }
  }
};

module.exports = supportController;