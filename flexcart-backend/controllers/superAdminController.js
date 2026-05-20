const { pool } = require('../config/db');
const { normalizeFilePath } = require('../utils/fileUtils');

// ─── Audit Logger ────────────────────────────────────────────
const logAudit = async (userId, role, action, targetType, targetId, details, ip) => {
  try {
    await pool.query(
      `INSERT INTO admin_audit_log (admin_user_id, admin_role, action, target_type, target_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, role, action, targetType || null, targetId || null,
        details ? JSON.stringify(details) : null, ip || null]
    );
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
};

const superAdminController = {

  // ─── Dashboard Overview ───────────────────────────────────
  getDashboardStats: async (req, res) => {
    const safeCount = async (sql, params = []) => {
      try { const [[row]] = await pool.query(sql, params); return Object.values(row)[0] || 0; } catch { return 0; }
    };
    const safeSum = async (sql, params = []) => {
      try { const [[row]] = await pool.query(sql, params); return Number(Object.values(row)[0]) || 0; } catch { return 0; }
    };
    try {
      const [
        totalCustomers, totalSellers, totalProducts, totalOrders,
        totalRevenue, totalDeliveries, deliveredCount, totalDeliveryCost,
        totalBranches, totalStaff, totalAdProfit, totalDeliveryAdmins, totalDeliveryBoys
      ] = await Promise.all([
        safeCount("SELECT COUNT(*) as c FROM users WHERE role='customer'"),
        safeCount("SELECT COUNT(*) as c FROM users WHERE is_seller=1"),
        safeCount("SELECT COUNT(*) as c FROM products WHERE status='active'"),
        safeCount("SELECT COUNT(*) as c FROM orders"),
        safeSum("SELECT COALESCE(SUM(total_amount),0) as c FROM orders WHERE payment_status='paid'"),
        safeCount("SELECT COUNT(*) as c FROM deliveries"),
        safeCount("SELECT COUNT(*) as c FROM deliveries WHERE status='delivered'"),
        safeSum("SELECT COALESCE(SUM(total_cost),0) as c FROM deliveries"),
        safeCount("SELECT COUNT(*) as c FROM branches"),
        safeCount("SELECT COUNT(*) as c FROM users WHERE role='staff_admin'"),
        safeSum("SELECT COALESCE(SUM(fee_amount),0) as c FROM ad_promotions WHERE is_active=1"),
        safeCount("SELECT COUNT(*) as c FROM users WHERE role='delivery_admin'"),
        safeCount("SELECT COUNT(*) as c FROM users WHERE role='delivery_boy'"),
      ]);

      let settingsMap = {};
      try {
        const [settings] = await pool.query('SELECT setting_key, setting_value FROM platform_settings');
        settings.forEach(s => { settingsMap[s.setting_key] = s.setting_value; });
      } catch {}

      const successRate = totalDeliveries > 0 ? ((deliveredCount / totalDeliveries) * 100).toFixed(1) : 0;

      res.json({
        success: true,
        data: {
          totalCustomers, totalSellers, totalProducts, totalOrders,
          totalRevenue, totalDeliveries, deliveredCount, successRate,
          totalDeliveryCost, totalBranches, totalStaff,
          totalAdProfit, totalDeliveryAdmins, totalDeliveryBoys,
          settings: settingsMap
        }
      });
    } catch (error) {
      console.error('Super admin dashboard error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch dashboard' });
    }
  },

  // ─── Staff Admin CRUD ─────────────────────────────────────
  listStaffAdmins: async (req, res) => {
    try {
      const [staff] = await pool.query(
        `SELECT id, username, email, phone, role, status, is_approved, salary, created_at
         FROM users WHERE role = 'staff_admin' ORDER BY created_at DESC`
      );
      res.json({ success: true, data: staff });
    } catch (error) {
      console.error('List staff admins error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch staff admins' });
    }
  },

  createStaffAdmin: async (req, res) => {
    try {
      const bcrypt = require('bcryptjs');
      const { username, email, password, phone, salary } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ success: false, message: 'username, email, and password are required' });
      }
      if (password.length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
      }

      const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
      if (existing.length > 0) {
        return res.status(409).json({ success: false, message: 'Email already exists' });
      }

      const hash = await bcrypt.hash(password, 12);
      const [result] = await pool.query(
        `INSERT INTO users (username, email, password_hash, plain_password, role, phone, salary, is_verified, is_approved, status)
         VALUES (?, ?, ?, ?, 'staff_admin', ?, ?, 1, 1, 'active')`,
        [username.trim(), email.toLowerCase().trim(), hash, password, phone || null, salary || 0]
      );

      await logAudit(req.user.id, 'super_admin', 'created_staff_admin', 'user', result.insertId,
        { username: username.trim(), email: email.toLowerCase().trim() }, req.ip);

      res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Staff Admin account created' });
    } catch (error) {
      console.error('Create staff admin error:', error);
      res.status(500).json({ success: false, message: 'Failed to create Staff Admin' });
    }
  },

  updateStaffAdmin: async (req, res) => {
    try {
      const bcrypt = require('bcryptjs');
      const { id } = req.params;
      const { username, phone, salary, password } = req.body;

      const [target] = await pool.query("SELECT id FROM users WHERE id = ? AND role = 'staff_admin'", [id]);
      if (target.length === 0) return res.status(404).json({ success: false, message: 'Staff Admin not found' });

      const updates = [];
      const params = [];
      if (username) { updates.push('username = ?'); params.push(username.trim()); }
      if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
      if (salary !== undefined) { updates.push('salary = ?'); params.push(salary); }
      if (password) {
        if (password.length < 8) return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
        const hash = await bcrypt.hash(password, 12);
        updates.push('password_hash = ?');
        params.push(hash);
        updates.push('plain_password = ?');
        params.push(password);
      }
      if (updates.length === 0) return res.status(400).json({ success: false, message: 'No fields to update' });

      params.push(id);
      await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

      await logAudit(req.user.id, 'super_admin', 'updated_staff_admin', 'user', Number(id),
        { fields: updates.map(u => u.split(' ')[0]) }, req.ip);

      res.json({ success: true, message: 'Staff Admin updated' });
    } catch (error) {
      console.error('Update staff admin error:', error);
      res.status(500).json({ success: false, message: 'Failed to update Staff Admin' });
    }
  },

  toggleStaffAdminStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const [rows] = await pool.query("SELECT status FROM users WHERE id = ? AND role = 'staff_admin'", [id]);
      if (rows.length === 0) return res.status(404).json({ success: false, message: 'Staff Admin not found' });

      const newStatus = rows[0].status === 'active' ? 'suspended' : 'active';
      await pool.query('UPDATE users SET status = ? WHERE id = ?', [newStatus, id]);

      await logAudit(req.user.id, 'super_admin',
        newStatus === 'active' ? 'activated_staff_admin' : 'paused_staff_admin',
        'user', Number(id), { newStatus }, req.ip);

      res.json({ success: true, status: newStatus, message: `Staff Admin ${newStatus === 'active' ? 'activated' : 'paused'}` });
    } catch (error) {
      console.error('Toggle staff admin error:', error);
      res.status(500).json({ success: false, message: 'Failed to toggle status' });
    }
  },

  deleteStaffAdmin: async (req, res) => {
    try {
      const { id } = req.params;
      const [rows] = await pool.query("SELECT username, email FROM users WHERE id = ? AND role = 'staff_admin'", [id]);
      if (rows.length === 0) return res.status(404).json({ success: false, message: 'Staff Admin not found' });

      await pool.query("DELETE FROM users WHERE id = ? AND role = 'staff_admin'", [id]);

      await logAudit(req.user.id, 'super_admin', 'deleted_staff_admin', 'user', Number(id),
        { username: rows[0].username, email: rows[0].email }, req.ip);

      res.json({ success: true, message: 'Staff Admin deleted' });
    } catch (error) {
      console.error('Delete staff admin error:', error);
      res.status(500).json({ success: false, message: 'Failed to delete Staff Admin' });
    }
  },

  // ─── User Management ──────────────────────────────────────
  getUsers: async (req, res) => {
    try {
      const { role, status, search, page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      let query = `SELECT id, username, email, phone, role, is_seller, status, is_verified, is_approved,
                          points, stars, created_at
                   FROM users WHERE role NOT IN ('super_admin','staff_admin','delivery_admin','delivery_boy')`;
      const params = [];

      if (role) { query += ' AND role = ?'; params.push(role); }
      if (status) { query += ' AND status = ?'; params.push(status); }
      if (search) { query += ' AND (username LIKE ? OR email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(Number(limit), Number(offset));

      const [users] = await pool.query(query, params);

      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) as total FROM users WHERE role NOT IN ('super_admin','staff_admin','delivery_admin','delivery_boy')`
      );

      res.json({ success: true, data: users, total });
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
  },

  toggleUserStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const [rows] = await pool.query(
        "SELECT status, username FROM users WHERE id = ? AND role NOT IN ('super_admin','staff_admin')", [id]
      );
      if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

      const newStatus = rows[0].status === 'active' ? 'suspended' : 'active';
      await pool.query('UPDATE users SET status = ? WHERE id = ?', [newStatus, id]);

      await logAudit(req.user.id, 'super_admin',
        newStatus === 'active' ? 'activated_user' : 'suspended_user',
        'user', Number(id), { username: rows[0].username }, req.ip);

      res.json({ success: true, status: newStatus, message: `User ${newStatus}` });
    } catch (error) {
      console.error('Toggle user status error:', error);
      res.status(500).json({ success: false, message: 'Failed to toggle user status' });
    }
  },

  // ─── Platform Settings ────────────────────────────────────
  getSettings: async (req, res) => {
    try {
      const [settings] = await pool.query('SELECT * FROM platform_settings ORDER BY setting_key');
      res.json({ success: true, data: settings });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to fetch settings' });
    }
  },

  updateSetting: async (req, res) => {
    try {
      const { key, value } = req.body;
      if (!key || value === undefined) return res.status(400).json({ success: false, message: 'key and value required' });

      const [existing] = await pool.query('SELECT id FROM platform_settings WHERE setting_key = ?', [key]);
      if (existing.length === 0) return res.status(404).json({ success: false, message: 'Setting not found' });

      await pool.query(
        'UPDATE platform_settings SET setting_value = ?, updated_by_user_id = ? WHERE setting_key = ?',
        [String(value), req.user.id, key]
      );

      await logAudit(req.user.id, 'super_admin', 'updated_platform_setting', 'setting', null,
        { key, value }, req.ip);

      res.json({ success: true, message: `Setting '${key}' updated` });
    } catch (error) {
      console.error('Update setting error:', error);
      res.status(500).json({ success: false, message: 'Failed to update setting' });
    }
  },

  // ─── Revenue Analytics ────────────────────────────────────
  getRevenueAnalytics: async (req, res) => {
    try {
      const { period = 'monthly', from_date, to_date } = req.query;

      let rhFmt, ordFmt;
      if (period === 'daily') {
        rhFmt  = "TO_CHAR(sale_date, 'YYYY-MM-DD')";
        ordFmt = "TO_CHAR(created_at, 'YYYY-MM-DD')";
      } else if (period === 'yearly') {
        rhFmt  = "TO_CHAR(sale_date, 'YYYY')";
        ordFmt = "TO_CHAR(created_at, 'YYYY')";
      } else {
        rhFmt  = "TO_CHAR(sale_date, 'YYYY-MM')";
        ordFmt = "TO_CHAR(created_at, 'YYYY-MM')";
      }

      let dateFilter = '';
      const dateParams = [];
      if (period === 'custom' && from_date && to_date) {
        dateFilter = "AND sale_date BETWEEN ? AND ?::date + INTERVAL '1 day'";
        dateParams.push(from_date, to_date);
      }

      const [productRevenue] = await pool.query(
        `SELECT ${rhFmt} as label,
                SUM(product_total - discount_amount) as amount,
                SUM(commission_amount) as commission,
                COUNT(*) as count
         FROM revenue_history WHERE 1=1 ${dateFilter} GROUP BY label ORDER BY label DESC LIMIT 12`,
        [...dateParams]
      ).catch(() => [[]]);

      const [deliveryRevenue] = await pool.query(
        `SELECT ${rhFmt} as label,
                SUM(delivery_revenue) as amount,
                COUNT(*) as count
         FROM revenue_history WHERE 1=1 ${dateFilter} GROUP BY label ORDER BY label DESC LIMIT 12`,
        [...dateParams]
      ).catch(() => [[]]);

      const [orderRevenueFallback] = await pool.query(
        `SELECT ${ordFmt} as label, SUM(total_amount) as amount, COUNT(*) as count
         FROM orders WHERE payment_status='paid' GROUP BY label ORDER BY label DESC LIMIT 12`
      );

      const [adRevenue] = await pool.query(
        `SELECT ${ordFmt} as label, SUM(fee_amount) as amount, COUNT(*) as count
         FROM ad_promotions GROUP BY label ORDER BY label DESC LIMIT 12`
      );

      const orders = productRevenue.length > 0 ? productRevenue.reverse() : orderRevenueFallback.reverse();
      const delivery = deliveryRevenue.length > 0 ? deliveryRevenue.reverse() : [];

      res.json({
        success: true,
        data: { orders, delivery, ads: adRevenue.reverse() }
      });
    } catch (error) {
      console.error('Revenue analytics error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch revenue analytics' });
    }
  },

  // ─── Revenue History (detailed) ───────────────────────────
  getRevenueHistory: async (req, res) => {
    try {
      const { period = 'monthly', type = 'all', page = 1, limit = 20, from_date, to_date } = req.query;
      const offset = (Number(page) - 1) * Number(limit);

      let dateFilter = '';
      const dateParams = [];
      if (period === 'custom' && from_date && to_date) {
        dateFilter = "AND rh.sale_date BETWEEN ? AND ?::date + INTERVAL '1 day'";
        dateParams.push(from_date, to_date);
      } else if (period === 'daily') {
        dateFilter = 'AND rh.sale_date::date = CURRENT_DATE';
      } else if (period === 'monthly') {
        dateFilter = "AND DATE_TRUNC('month', rh.sale_date) = DATE_TRUNC('month', NOW())";
      } else if (period === 'yearly') {
        dateFilter = "AND DATE_TRUNC('year', rh.sale_date) = DATE_TRUNC('year', NOW())";
      }

      let typeFilter = '';
      if (type === 'cart')           typeFilter = "AND rh.source_type = 'cart'";
      else if (type === 'buy_now')   typeFilter = "AND rh.source_type = 'buy_now'";

      let rows = [], total = 0;
      let summary = { net_product_revenue: 0, total_delivery_revenue: 0, total_commission: 0, order_count: 0 };

      try {
        const [queryRows] = await pool.query(
          `SELECT rh.order_number, rh.sale_date, rh.product_total, rh.discount_amount,
                  rh.delivery_charge, rh.commission_amount, rh.delivery_revenue, rh.source_type,
                  o.payment_method, o.receiver_mobile, o.district
           FROM revenue_history rh
           JOIN orders o ON o.id = rh.order_id
           WHERE 1=1 ${dateFilter} ${typeFilter}
           ORDER BY rh.sale_date DESC LIMIT ? OFFSET ?`,
          [...dateParams, Number(limit), Number(offset)]
        );
        rows = queryRows;

        const [[countRow]] = await pool.query(
          `SELECT COUNT(*) as total FROM revenue_history rh WHERE 1=1 ${dateFilter} ${typeFilter}`,
          [...dateParams]
        );
        total = countRow.total || 0;

        const [[summaryRow]] = await pool.query(
          `SELECT
             COALESCE(SUM(rh.product_total - rh.discount_amount), 0) as net_product_revenue,
             COALESCE(SUM(rh.delivery_revenue), 0)                   as total_delivery_revenue,
             COALESCE(SUM(rh.commission_amount), 0)                  as total_commission,
             COUNT(*) as order_count
           FROM revenue_history rh WHERE 1=1 ${dateFilter} ${typeFilter}`,
          [...dateParams]
        );
        if (summaryRow) summary = summaryRow;
      } catch (tableErr) {
        console.warn('revenue_history table not found (run migration):', tableErr.code);
      }

      res.json({ success: true, data: rows, total, summary });
    } catch (error) {
      console.error('Revenue history error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch revenue history' });
    }
  },

  // ─── Category Commissions ─────────────────────────────────
  getCategoryCommissions: async (req, res) => {
    try {
      let defaultRate = 5;
      try {
        const [ds] = await pool.query(
          "SELECT setting_value FROM platform_settings WHERE setting_key = 'commission_rate'"
        );
        defaultRate = parseFloat(ds[0]?.setting_value || 5);
      } catch { /* ignore */ }

      // Show ALL categories — not only ones with products
      const [categories] = await pool.query(
        `SELECT cat.id AS category_id, cat.name AS category_name,
                CAST(COALESCE(cc.commission_rate, ?) AS DECIMAL(5,2)) AS commission_rate,
                (cc.id IS NOT NULL) AS is_custom
         FROM categories cat
         LEFT JOIN category_commissions cc ON cc.category_id = cat.id
         ORDER BY cat.name`,
        [defaultRate]
      ).catch(async () => {
        // Fallback: categories table might be named differently — try from products
        const [cats] = await pool.query(
          `SELECT DISTINCT p.category_id, cat.name AS category_name, ? AS commission_rate, 0 AS is_custom
           FROM products p JOIN categories cat ON cat.id = p.category_id WHERE p.category_id IS NOT NULL`,
          [defaultRate]
        );
        return [cats];
      });

      res.json({ success: true, data: categories, defaultRate });
    } catch (error) {
      console.error('Get category commissions error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch category commissions' });
    }
  },

  updateCategoryCommission: async (req, res) => {
    try {
      const { categoryId } = req.params;
      const { commission_rate, category_name } = req.body;
      if (!categoryId || commission_rate === undefined) {
        return res.status(400).json({ success: false, message: 'categoryId and commission_rate required' });
      }
      const rate = parseFloat(commission_rate);
      if (isNaN(rate) || rate < 0 || rate > 100) {
        return res.status(400).json({ success: false, message: 'commission_rate must be 0–100' });
      }

      // Auto-create table if migration hasn't been run yet
      await pool.query(`
        CREATE TABLE IF NOT EXISTS category_commissions (
          id SERIAL PRIMARY KEY,
          category_id INT NOT NULL,
          category_name VARCHAR(100) NOT NULL DEFAULT '',
          commission_rate DECIMAL(5,2) NOT NULL DEFAULT 5.00,
          updated_by_user_id INT DEFAULT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_category_commission UNIQUE (category_id)
        )
      `);

      // Resolve category name if not provided
      let catName = category_name || '';
      if (!catName) {
        try {
          const [[cat]] = await pool.query('SELECT name FROM categories WHERE id = ?', [categoryId]);
          catName = cat?.name || '';
        } catch { /* ignore */ }
      }

      await pool.query(
        `INSERT INTO category_commissions (category_id, category_name, commission_rate, updated_by_user_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (category_id) DO UPDATE SET
           commission_rate = EXCLUDED.commission_rate,
           updated_by_user_id = EXCLUDED.updated_by_user_id,
           category_name = EXCLUDED.category_name`,
        [categoryId, catName, rate, req.user.id]
      );

      await logAudit(req.user.id, 'super_admin', 'updated_category_commission', 'category',
        Number(categoryId), { category_name: catName, commission_rate: rate }, req.ip);

      res.json({ success: true, message: 'Category commission updated' });
    } catch (error) {
      console.error('Update category commission error:', error);
      res.status(500).json({ success: false, message: 'Failed to update category commission' });
    }
  },

  // ─── Ad Promotions ────────────────────────────────────────
  // Public endpoint — returns currently active ads for all users
  getActiveAds: async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const [ads] = await pool.query(`
        SELECT id, advertiser_name, banner_image, link_url, start_date, end_date
        FROM ad_promotions
        WHERE is_active = 1
          AND start_date <= ?
          AND end_date >= ?
        ORDER BY created_at DESC
      `, [today, today]);
      res.json({ success: true, data: ads });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to fetch ads' });
    }
  },

  getAdPromotions: async (req, res) => {
    try {
      const [ads] = await pool.query(`
        SELECT ap.*, c.company_name
        FROM ad_promotions ap
        LEFT JOIN companies c ON c.id = ap.company_id
        ORDER BY ap.created_at DESC LIMIT 100
      `);
      res.json({ success: true, data: ads });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to fetch ads' });
    }
  },

  createAdPromotion: async (req, res) => {
    try {
      const { advertiserName, bannerUrl, linkUrl, feeAmount, startDate, endDate, companyId } = req.body;

      if (!advertiserName || !startDate || !endDate) {
        return res.status(400).json({ success: false, message: 'advertiserName, startDate, endDate are required' });
      }

      // Handle file upload OR url — normalise so Cloudinary URLs stay as-is
      let bannerImage = bannerUrl || '';
      if (req.file) {
        bannerImage = normalizeFilePath(req.file.path);
      }

      const [result] = await pool.query(
        `INSERT INTO ad_promotions (advertiser_name, company_id, banner_image, link_url, fee_amount, start_date, end_date, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [advertiserName.trim(), companyId || null, bannerImage, linkUrl || null, feeAmount || 0, startDate, endDate]
      );

      await logAudit(req.user.id, 'super_admin', 'created_ad_promotion', 'ad_promotion', result.insertId,
        { advertiserName: advertiserName.trim(), feeAmount }, req.ip);

      res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Ad promotion created' });
    } catch (error) {
      console.error('Create ad error:', error);
      res.status(500).json({ success: false, message: 'Failed to create ad promotion' });
    }
  },

  updateAdPromotion: async (req, res) => {
    try {
      const { id } = req.params;
      const { advertiserName, bannerUrl, linkUrl, feeAmount, startDate, endDate, isActive } = req.body;

      const [existing] = await pool.query('SELECT id FROM ad_promotions WHERE id = ?', [id]);
      if (existing.length === 0) return res.status(404).json({ success: false, message: 'Ad not found' });

      const updates = [];
      const params = [];
      if (advertiserName) { updates.push('advertiser_name = ?'); params.push(advertiserName.trim()); }
      // Prefer a newly uploaded file; fall back to the URL sent from the form
      if (req.file) {
        updates.push('banner_image = ?');
        params.push(normalizeFilePath(req.file.path));
      } else if (bannerUrl) {
        updates.push('banner_image = ?');
        params.push(bannerUrl);
      }
      if (linkUrl !== undefined)  { updates.push('link_url = ?');    params.push(linkUrl); }
      if (feeAmount !== undefined){ updates.push('fee_amount = ?');  params.push(feeAmount); }
      if (startDate)       { updates.push('start_date = ?');      params.push(startDate); }
      if (endDate)         { updates.push('end_date = ?');        params.push(endDate); }
      if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive ? 1 : 0); }

      if (updates.length === 0) return res.status(400).json({ success: false, message: 'No fields to update' });

      params.push(id);
      await pool.query(`UPDATE ad_promotions SET ${updates.join(', ')} WHERE id = ?`, params);

      await logAudit(req.user.id, 'super_admin', 'updated_ad_promotion', 'ad_promotion', Number(id), null, req.ip);

      res.json({ success: true, message: 'Ad promotion updated' });
    } catch (error) {
      console.error('Update ad error:', error);
      res.status(500).json({ success: false, message: 'Failed to update ad promotion' });
    }
  },

  deleteAdPromotion: async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query('DELETE FROM ad_promotions WHERE id = ?', [id]);

      await logAudit(req.user.id, 'super_admin', 'deleted_ad_promotion', 'ad_promotion', Number(id), null, req.ip);

      res.json({ success: true, message: 'Ad promotion deleted' });
    } catch (error) {
      console.error('Delete ad error:', error);
      res.status(500).json({ success: false, message: 'Failed to delete ad promotion' });
    }
  },

  // ─── Audit Log ───────────────────────────────────────────
  getAuditLog: async (req, res) => {
    try {
      const { page = 1, limit = 50, action, adminId } = req.query;
      const offset = (page - 1) * limit;

      let query = `
        SELECT al.*, u.username as admin_username, u.email as admin_email
        FROM admin_audit_log al
        LEFT JOIN users u ON u.id = al.admin_user_id
        WHERE 1=1`;
      const params = [];

      if (action)  { query += ' AND al.action = ?';         params.push(action); }
      if (adminId) { query += ' AND al.admin_user_id = ?';  params.push(adminId); }

      query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
      params.push(Number(limit), Number(offset));

      const [logs] = await pool.query(query, params);
      const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM admin_audit_log');

      res.json({ success: true, data: logs, total });
    } catch (error) {
      console.error('Audit log error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch audit log' });
    }
  },

  // ─── All Staff Management ─────────────────────────────────
  getAllStaff: async (req, res) => {
    try {
      const { search, role } = req.query;
      let query = `
        SELECT u.id, u.username, u.email, u.phone, u.role, u.salary,
               u.status, u.created_at, b.name AS branch_name
        FROM users u
        LEFT JOIN branches b ON b.id = u.assigned_branch_id
        WHERE u.role IN ('staff_admin','delivery_admin','delivery_boy')`;
      const params = [];

      if (role && ['staff_admin','delivery_admin','delivery_boy'].includes(role)) {
        query += ' AND u.role = ?';
        params.push(role);
      }
      if (search) {
        query += ' AND (u.username LIKE ? OR u.email LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }
      query += ' ORDER BY u.role, u.username';

      const [staff] = await pool.query(query, params);
      res.json({ success: true, data: staff });
    } catch (error) {
      // Graceful fallback if plain_password column doesn't exist yet
      if (error.code === 'ER_BAD_FIELD_ERROR' && error.message.includes('plain_password')) {
        try {
          const { search, role } = req.query;
          let fbQuery = `
            SELECT u.id, u.username, u.email, u.phone, u.role, u.salary,
                   u.status, u.created_at, b.name AS branch_name
            FROM users u
            LEFT JOIN branches b ON b.id = u.assigned_branch_id
            WHERE u.role IN ('staff_admin','delivery_admin','delivery_boy')`;
          const fbParams = [];
          if (role && ['staff_admin','delivery_admin','delivery_boy'].includes(role)) {
            fbQuery += ' AND u.role = ?'; fbParams.push(role);
          }
          if (search) {
            fbQuery += ' AND (u.username LIKE ? OR u.email LIKE ?)';
            fbParams.push(`%${search}%`, `%${search}%`);
          }
          fbQuery += ' ORDER BY u.role, u.username';
          const [staff] = await pool.query(fbQuery, fbParams);
          return res.json({ success: true, data: staff });
        } catch (fbError) {
          return res.status(500).json({ success: false, message: 'Failed to fetch staff' });
        }
      }
      console.error('Get all staff error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch staff' });
    }
  },

  updateAnyStaff: async (req, res) => {
    try {
      const bcrypt = require('bcryptjs');
      const { id } = req.params;
      const { username, email, phone, salary, password } = req.body;

      const [target] = await pool.query(
        "SELECT id, role FROM users WHERE id = ? AND role IN ('staff_admin','delivery_admin','delivery_boy')",
        [id]
      );
      if (target.length === 0) return res.status(404).json({ success: false, message: 'Staff member not found' });

      const updates = [];
      const params = [];
      if (username)            { updates.push('username = ?');      params.push(username.trim()); }
      if (email)               { updates.push('email = ?');         params.push(email.toLowerCase().trim()); }
      if (phone !== undefined) { updates.push('phone = ?');         params.push(phone); }
      if (salary !== undefined){ updates.push('salary = ?');        params.push(salary); }
      if (password) {
        if (password.length < 6)
          return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        const hash = await bcrypt.hash(password, 12);
        updates.push('password_hash = ?');
        params.push(hash);
        updates.push('plain_password = ?');
        params.push(password);
      }
      if (updates.length === 0) return res.status(400).json({ success: false, message: 'No fields to update' });

      params.push(id);
      await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);

      await logAudit(req.user.id, 'super_admin', 'updated_staff_member', 'user', Number(id),
        { fields: updates.map(u => u.split(' ')[0]), role: target[0].role }, req.ip);

      res.json({ success: true, message: 'Staff member updated' });
    } catch (error) {
      console.error('Update staff member error:', error);
      res.status(500).json({ success: false, message: 'Failed to update staff member' });
    }
  },

  toggleAnyStaffStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const [rows] = await pool.query(
        "SELECT status, username, role FROM users WHERE id = ? AND role IN ('staff_admin','delivery_admin','delivery_boy')",
        [id]
      );
      if (rows.length === 0) return res.status(404).json({ success: false, message: 'Staff member not found' });

      const newStatus = rows[0].status === 'active' ? 'suspended' : 'active';
      await pool.query('UPDATE users SET status = ? WHERE id = ?', [newStatus, id]);

      await logAudit(req.user.id, 'super_admin',
        newStatus === 'active' ? 'activated_staff_member' : 'suspended_staff_member',
        'user', Number(id), { username: rows[0].username, role: rows[0].role, newStatus }, req.ip);

      res.json({ success: true, status: newStatus, message: `Staff member ${newStatus === 'active' ? 'activated' : 'suspended'}` });
    } catch (error) {
      console.error('Toggle staff status error:', error);
      res.status(500).json({ success: false, message: 'Failed to toggle status' });
    }
  },

  // ─── Branch Details & Analytics ──────────────────────────
  getBranchDetails: async (req, res) => {
    try {
      const { id } = req.params;

      const [[branch]] = await pool.query(
        `SELECT b.id, b.name, b.address, b.created_at,
                COUNT(DISTINCT CASE WHEN d.status = 'delivered' THEN d.id END)  AS completed_deliveries,
                COUNT(DISTINCT CASE WHEN d.status = 'rejected'  THEN d.id END)  AS failed_deliveries,
                COUNT(DISTINCT CASE WHEN o.order_status NOT IN ('delivered','cancelled','returned')
                  AND o.assigned_branch_id = b.id THEN o.id END)                AS pending_deliveries,
                COUNT(DISTINCT CASE WHEN u.role IN ('delivery_admin','delivery_boy')
                  AND u.status = 'active' THEN u.id END)                        AS employee_count
         FROM branches b
         LEFT JOIN deliveries d  ON d.from_branch_id = b.id
         LEFT JOIN orders o      ON o.assigned_branch_id = b.id
         LEFT JOIN users u       ON u.assigned_branch_id = b.id
         WHERE b.id = ?
         GROUP BY b.id`,
        [id]
      );
      if (!branch) return res.status(404).json({ success: false, message: 'Branch not found' });

      const [employees] = await pool.query(
        `SELECT id, username, email, phone, role, salary, status
         FROM users WHERE assigned_branch_id = ? AND role IN ('delivery_admin','delivery_boy')
         ORDER BY role, username`,
        [id]
      );

      res.json({ success: true, data: { branch, employees } });
    } catch (error) {
      console.error('Get branch details error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch branch details' });
    }
  },

  // ─── Legacy: Admin Requests (kept for backward compat) ───
  getPendingRequests: async (req, res) => {
    try {
      const [requests] = await pool.query(
        `SELECT ar.*, u.username as requester_name, u.email as requester_email
         FROM admin_requests ar LEFT JOIN users u ON u.id = ar.requester_user_id
         ORDER BY ar.created_at DESC LIMIT 50`
      );
      res.json({ success: true, data: requests });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to fetch requests' });
    }
  },

  reviewRequest: async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Status must be approved or rejected' });
      }
      await pool.query(
        'UPDATE admin_requests SET status = ?, reviewed_by_user_id = ?, reviewed_at = NOW() WHERE id = ?',
        [status, req.user.id, id]
      );
      res.json({ success: true, message: `Request ${status}` });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to review request' });
    }
  }
};

module.exports = superAdminController;
