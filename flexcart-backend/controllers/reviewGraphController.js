const { pool } = require('../config/db');

const reviewGraphController = {
  getGraphData: async (req, res) => {
    try {
      const { month, year } = req.query;
      const targetMonth = parseInt(month) || new Date().getMonth() + 1;
      const targetYear = parseInt(year) || new Date().getFullYear();

      const [dailyData] = await pool.query(
        `SELECT EXTRACT(DAY FROM o.created_at)::int AS day, o.created_at::date AS date, SUM(o.total_amount) AS total_spent, COUNT(o.id) AS order_count
        FROM orders o WHERE o.user_id = ? AND EXTRACT(MONTH FROM o.created_at) = ? AND EXTRACT(YEAR FROM o.created_at) = ? AND o.payment_status = 'paid'
        GROUP BY EXTRACT(DAY FROM o.created_at)::int, o.created_at::date ORDER BY day ASC`,
        [req.user.id, targetMonth, targetYear]
      );

      const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
      const dailyMap = new Map(dailyData.map(d => [d.day, d]));
      const graphData = [];

      for (let day = 1; day <= daysInMonth; day++) {
        const data = dailyMap.get(day);
        graphData.push({
          day,
          date: `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          totalSpent: data ? parseFloat(data.total_spent) : 0,
          orderCount: data ? data.order_count : 0
        });
      }

      const totalSpent = graphData.reduce((sum, d) => sum + d.totalSpent, 0);
      const totalOrders = graphData.reduce((sum, d) => sum + d.orderCount, 0);

      res.json({
        success: true,
        data: {
          graphData,
          summary: { month: targetMonth, year: targetYear, totalSpent: parseFloat(totalSpent.toFixed(2)), totalOrders, averageDaily: parseFloat((totalSpent / daysInMonth).toFixed(2)), daysInMonth },
          availableMonths: []
        }
      });
    } catch (error) { console.error(error); res.status(500).json({ success: false, message: 'Server error' }); }
  }
};

module.exports = reviewGraphController;