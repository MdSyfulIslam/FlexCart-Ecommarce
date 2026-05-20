const { pool } = require('../config/db');
const { isValidEmail, isValidPhone, isValidUsername, isValidSalary } = require('../utils/validators');

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

// ─── Cost helpers (mirrors deliveryController) ────────────────
async function loadPricingMap() {
  const keys = [
    'cost_per_kg','cost_per_foot',
    'packaging_plastic','packaging_glass','packaging_fragile','packaging_standard',
    'route_branch_to_branch','route_branch_to_address'
  ];
  try {
    const placeholders = keys.map(() => '?').join(',');
    const [rows] = await pool.query(`SELECT setting_key, setting_value FROM platform_settings WHERE setting_key IN (${placeholders})`, keys);
    const m = {};
    for (const r of rows) m[r.setting_key] = Number(r.setting_value);
    return m;
  } catch { return {}; }
}

const staffAdminController = {

  // ─── Dashboard Stats ──────────────────────────────────────
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
        totalDeliveries, deliveredCount, totalRevenue, totalDeliveryCost,
        totalBranches, totalDeliveryAdmins, totalDeliveryBoys, pendingOrders
      ] = await Promise.all([
        safeCount("SELECT COUNT(*) as c FROM users WHERE role='customer'"),
        safeCount("SELECT COUNT(*) as c FROM users WHERE is_seller=1"),
        safeCount("SELECT COUNT(*) as c FROM products WHERE status='active'"),
        safeCount("SELECT COUNT(*) as c FROM orders"),
        safeCount("SELECT COUNT(*) as c FROM deliveries"),
        safeCount("SELECT COUNT(*) as c FROM deliveries WHERE status='delivered'"),
        safeSum("SELECT COALESCE(SUM(total_amount),0) as c FROM orders WHERE payment_status='paid'"),
        safeSum("SELECT COALESCE(SUM(total_cost),0) as c FROM deliveries"),
        safeCount("SELECT COUNT(*) as c FROM branches"),
        safeCount("SELECT COUNT(*) as c FROM users WHERE role='delivery_admin'"),
        safeCount("SELECT COUNT(*) as c FROM users WHERE role='delivery_boy'"),
        safeCount("SELECT COUNT(*) as c FROM orders WHERE order_status='pending'"),
      ]);

      const successRate = totalDeliveries > 0 ? ((deliveredCount / totalDeliveries) * 100).toFixed(1) : 0;

      res.json({
        success: true,
        data: {
          totalCustomers, totalSellers, totalProducts, totalOrders, pendingOrders,
          totalDeliveries, deliveredCount, successRate,
          totalRevenue, totalDeliveryCost,
          totalBranches, totalDeliveryAdmins, totalDeliveryBoys
        }
      });
    } catch (error) {
      console.error('Staff dashboard stats error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch stats' });
    }
  },

  // ─── Branch CRUD ──────────────────────────────────────────
  getBranches: async (req, res) => {
    try {
      let branches;
      try {
        [branches] = await pool.query(`
          SELECT b.*,
            (SELECT COUNT(*) FROM users u WHERE u.assigned_branch_id = b.id AND u.role = 'delivery_admin') as admin_count,
            (SELECT COUNT(*) FROM users u WHERE u.assigned_branch_id = b.id AND u.role = 'delivery_boy') as driver_count,
            (SELECT COUNT(*) FROM vehicles v WHERE v.branch_id = b.id) as vehicle_count,
            (SELECT COUNT(*) FROM deliveries d WHERE d.from_branch_id = b.id) as delivery_count
          FROM branches b ORDER BY b.name ASC
        `);
      } catch {
        [branches] = await pool.query(
          `SELECT *, 0 as admin_count, 0 as driver_count, 0 as vehicle_count, 0 as delivery_count
           FROM branches ORDER BY name ASC`
        );
      }
      res.json({ success: true, data: branches });
    } catch (error) {
      console.error('Get branches error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch branches' });
    }
  },

  createBranch: async (req, res) => {
    try {
      const { name, address } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Branch name is required' });

      const [existing] = await pool.query('SELECT id FROM branches WHERE name = ?', [name.trim()]);
      if (existing.length > 0) return res.status(409).json({ success: false, message: 'Branch name already exists' });

      const [result] = await pool.query('INSERT INTO branches (name, address) VALUES (?, ?)', [name.trim(), address || null]);

      // Auto-create corresponding hub for this branch
      await pool.query(
        'INSERT INTO delivery_hubs (name, location, branch_id, is_active) VALUES (?, ?, ?, 1)',
        [name.trim(), address || name.trim(), result.insertId]
      ).catch(() => {});

      await logAudit(req.user.id, req.user.role, 'created_branch', 'branch', result.insertId,
        { name: name.trim(), address }, req.ip);

      res.status(201).json({
        success: true,
        data: { id: result.insertId, name: name.trim(), address: address || null, admin_count: 0, driver_count: 0, vehicle_count: 0, delivery_count: 0 },
        message: 'Branch created successfully'
      });
    } catch (error) {
      console.error('Create branch error:', error);
      res.status(500).json({ success: false, message: 'Failed to create branch' });
    }
  },

  updateBranch: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, address } = req.body;
      if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Branch name is required' });

      const [dup] = await pool.query('SELECT id FROM branches WHERE name = ? AND id != ?', [name.trim(), id]);
      if (dup.length > 0) return res.status(409).json({ success: false, message: 'Branch name already exists' });

      await pool.query('UPDATE branches SET name = ?, address = ? WHERE id = ?', [name.trim(), address || null, id]);

      // Sync hub name/location to match updated branch
      await pool.query(
        'UPDATE delivery_hubs SET name = ?, location = ? WHERE branch_id = ?',
        [name.trim(), address || name.trim(), id]
      ).catch(() => {});

      await logAudit(req.user.id, req.user.role, 'updated_branch', 'branch', Number(id),
        { name: name.trim() }, req.ip);

      res.json({ success: true, message: 'Branch updated' });
    } catch (error) {
      console.error('Update branch error:', error);
      res.status(500).json({ success: false, message: 'Failed to update branch' });
    }
  },

  deleteBranch: async (req, res) => {
    try {
      const { id } = req.params;
      const [rows] = await pool.query('SELECT name FROM branches WHERE id = ?', [id]);
      await pool.query('UPDATE users SET assigned_branch_id = NULL WHERE assigned_branch_id = ?', [id]);

      // Deactivate hub instead of deleting (may be linked to routes)
      await pool.query(
        'UPDATE delivery_hubs SET is_active = 0, branch_id = NULL WHERE branch_id = ?',
        [id]
      ).catch(() => {});

      await pool.query('DELETE FROM branches WHERE id = ?', [id]);

      await logAudit(req.user.id, req.user.role, 'deleted_branch', 'branch', Number(id),
        { name: rows[0]?.name }, req.ip);

      res.json({ success: true, message: 'Branch deleted' });
    } catch (error) {
      console.error('Delete branch error:', error);
      res.status(500).json({ success: false, message: 'Failed to delete branch' });
    }
  },

  // ─── Personnel Management ─────────────────────────────────
  getPersonnel: async (req, res) => {
    try {
      const { branchId, role } = req.query;
      let query = `SELECT u.id, u.username, u.email, u.phone, u.role, u.assigned_branch_id,
                          u.is_approved, u.salary, u.status, u.created_at, b.name as branch_name
                   FROM users u LEFT JOIN branches b ON b.id = u.assigned_branch_id
                   WHERE u.role IN ('delivery_admin','delivery_boy')`;
      const params = [];
      if (branchId) { query += ' AND u.assigned_branch_id = ?'; params.push(branchId); }
      if (role)     { query += ' AND u.role = ?';              params.push(role); }
      query += ' ORDER BY u.created_at DESC';
      const [users] = await pool.query(query, params);
      res.json({ success: true, data: users });
    } catch (error) {
      console.error('Get personnel error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch personnel' });
    }
  },

  createPersonnel: async (req, res) => {
    try {
      const bcrypt = require('bcryptjs');
      const { username, email, password, role, branchId, phone, salary } = req.body;

      if (!username || !email || !password || !role) {
        return res.status(400).json({ success: false, message: 'username, email, password, and role are required' });
      }
      if (!['delivery_admin', 'delivery_boy'].includes(role)) {
        return res.status(400).json({ success: false, message: 'Role must be delivery_admin or delivery_boy' });
      }
      if (!isValidEmail(email)) {
        return res.status(400).json({ success: false, message: 'Invalid email address format' });
      }
      if (!isValidUsername(username)) {
        return res.status(400).json({ success: false, message: 'Username must be 3–50 characters: letters, numbers, or underscores only' });
      }
      if (phone && phone.trim() && !isValidPhone(phone)) {
        return res.status(400).json({ success: false, message: 'Phone must be a valid Bangladesh number (e.g. 01712345678)' });
      }
      if (salary !== undefined && salary !== '' && !isValidSalary(salary)) {
        return res.status(400).json({ success: false, message: 'Salary must be a positive integer' });
      }
      if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      }

      const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email.trim()]);
      if (existing.length > 0) return res.status(409).json({ success: false, message: 'Email already exists' });

      const hash = await bcrypt.hash(password, 12);
      const [result] = await pool.query(
        `INSERT INTO users (username, email, password_hash, plain_password, role, assigned_branch_id, phone, salary, is_verified, is_approved, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 'active')`,
        [username.trim(), email.trim(), hash, password, role, branchId || null, phone || null, salary || 0]
      );

      await logAudit(req.user.id, req.user.role, `created_${role}`, 'user', result.insertId,
        { username: username.trim(), role, branchId }, req.ip);

      res.status(201).json({ success: true, data: { id: result.insertId }, message: `${role === 'delivery_admin' ? 'Delivery Admin' : 'Delivery Boy'} created successfully` });
    } catch (error) {
      console.error('Create personnel error:', error);
      res.status(500).json({ success: false, message: 'Failed to create personnel' });
    }
  },

  updatePersonnel: async (req, res) => {
    try {
      const { id } = req.params;
      const { username, phone, branchId, salary, status, password } = req.body;
      const updates = [];
      const params = [];
      if (username)          { updates.push('username = ?');            params.push(username.trim()); }
      if (phone !== undefined){ updates.push('phone = ?');              params.push(phone); }
      if (phone !== undefined && phone && phone.trim() && !isValidPhone(phone)) {
        return res.status(400).json({ success: false, message: 'Phone must be a valid Bangladesh number (e.g. 01712345678)' });
      }
      if (branchId !== undefined){ updates.push('assigned_branch_id = ?'); params.push(branchId || null); }
      if (salary !== undefined){ updates.push('salary = ?');            params.push(salary); }
      if (status)            { updates.push('status = ?');              params.push(status); }
      if (password) {
        if (password.length < 6)
          return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash(password, 12);
        updates.push('password_hash = ?');
        params.push(hash);
        updates.push('plain_password = ?');
        params.push(password);
      }
      if (updates.length === 0) return res.status(400).json({ success: false, message: 'No fields to update' });

      params.push(id);
      await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ? AND role IN ('delivery_admin','delivery_boy')`, params);

      await logAudit(req.user.id, req.user.role, 'updated_personnel', 'user', Number(id), null, req.ip);

      res.json({ success: true, message: 'Personnel updated' });
    } catch (error) {
      console.error('Update personnel error:', error);
      res.status(500).json({ success: false, message: 'Failed to update personnel' });
    }
  },

  togglePersonnelPause: async (req, res) => {
    try {
      const { id } = req.params;
      const [users] = await pool.query("SELECT status FROM users WHERE id = ? AND role IN ('delivery_admin','delivery_boy')", [id]);
      if (users.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

      const newStatus = users[0].status === 'active' ? 'suspended' : 'active';
      await pool.query('UPDATE users SET status = ? WHERE id = ?', [newStatus, id]);

      await logAudit(req.user.id, req.user.role,
        newStatus === 'active' ? 'activated_personnel' : 'paused_personnel',
        'user', Number(id), { newStatus }, req.ip);

      res.json({ success: true, message: `User ${newStatus === 'active' ? 'activated' : 'paused'}`, status: newStatus });
    } catch (error) {
      console.error('Toggle pause error:', error);
      res.status(500).json({ success: false, message: 'Failed to toggle status' });
    }
  },

  deletePersonnel: async (req, res) => {
    try {
      const { id } = req.params;
      const [rows] = await pool.query("SELECT username FROM users WHERE id = ? AND role IN ('delivery_admin','delivery_boy')", [id]);
      await pool.query("DELETE FROM users WHERE id = ? AND role IN ('delivery_admin','delivery_boy')", [id]);

      await logAudit(req.user.id, req.user.role, 'deleted_personnel', 'user', Number(id),
        { username: rows[0]?.username }, req.ip);

      res.json({ success: true, message: 'Personnel deleted' });
    } catch (error) {
      console.error('Delete personnel error:', error);
      res.status(500).json({ success: false, message: 'Failed to delete personnel' });
    }
  },

  // ─── Vehicles ─────────────────────────────────────────────
  getVehicles: async (req, res) => {
    try {
      const { branchId } = req.query;
      let query = `SELECT v.*, b.name as branch_name, u.username as assigned_to,
                          rb.name as route_from_name, tb.name as route_to_name
                   FROM vehicles v
                   LEFT JOIN branches b  ON b.id  = v.branch_id
                   LEFT JOIN users u     ON u.id  = v.assigned_user_id
                   LEFT JOIN branches rb ON rb.id = v.route_from_branch_id
                   LEFT JOIN branches tb ON tb.id = v.route_to_branch_id`;
      const params = [];
      if (branchId) { query += ' WHERE v.branch_id = ?'; params.push(branchId); }
      query += ' ORDER BY v.created_at DESC';
      const [vehicles] = await pool.query(query, params);
      res.json({ success: true, data: vehicles });
    } catch (error) {
      console.error('Get vehicles error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch vehicles' });
    }
  },

  createVehicle: async (req, res) => {
    try {
      const { plateNumber, vehicleType, branchId, assignedUserId,
              routeFromBranchId, routeToBranchId,
              driverName, driverPhone, viaBranchIds } = req.body;

      if (!plateNumber || !plateNumber.trim())
        return res.status(400).json({ success: false, message: 'Plate number is required' });
      if (!driverName || !driverName.trim())
        return res.status(400).json({ success: false, message: 'Driver name is required' });
      if (!driverPhone || !driverPhone.trim())
        return res.status(400).json({ success: false, message: 'Driver phone is required' });
      if (!isValidPhone(driverPhone)) {
        return res.status(400).json({ success: false, message: 'Driver phone must be a valid Bangladesh number (e.g. 01712345678)' });
      }

      const [existing] = await pool.query('SELECT id FROM vehicles WHERE plate_number = ?', [plateNumber.trim()]);
      if (existing.length > 0)
        return res.status(409).json({ success: false, message: 'Plate number already exists' });

      const viaJson = Array.isArray(viaBranchIds) && viaBranchIds.length > 0
        ? JSON.stringify(viaBranchIds.map(Number).filter(Boolean))
        : null;

      const [result] = await pool.query(
        `INSERT INTO vehicles
           (plate_number, vehicle_type, branch_id, assigned_user_id,
            route_from_branch_id, route_to_branch_id,
            driver_name, driver_phone, route_via_branches)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [plateNumber.trim(), vehicleType || 'bike', branchId || null, assignedUserId || null,
         routeFromBranchId || null, routeToBranchId || null,
         driverName.trim(), driverPhone.trim(), viaJson]
      );

      await logAudit(req.user.id, req.user.role, 'created_vehicle', 'vehicle', result.insertId,
        { plateNumber: plateNumber.trim(), driverName: driverName.trim(), vehicleType, branchId,
          routeFromBranchId, routeToBranchId }, req.ip);

      res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Vehicle added successfully' });
    } catch (error) {
      console.error('Create vehicle error:', error);
      res.status(500).json({ success: false, message: 'Failed to create vehicle' });
    }
  },

  updateVehicle: async (req, res) => {
    try {
      const { id } = req.params;
      const { plateNumber, vehicleType, branchId, routeFromBranchId, routeToBranchId,
              driverName, driverPhone, viaBranchIds, isActive } = req.body;

      if (plateNumber) {
        const [dup] = await pool.query('SELECT id FROM vehicles WHERE plate_number = ? AND id != ?', [plateNumber.trim(), id]);
        if (dup.length > 0)
          return res.status(409).json({ success: false, message: 'Plate number already exists' });
      }

      const updates = []; const params = [];
      if (plateNumber       !== undefined) { updates.push('plate_number = ?');         params.push(plateNumber.trim()); }
      if (vehicleType       !== undefined) { updates.push('vehicle_type = ?');         params.push(vehicleType); }
      if (branchId          !== undefined) { updates.push('branch_id = ?');            params.push(branchId || null); }
      if (routeFromBranchId !== undefined) { updates.push('route_from_branch_id = ?'); params.push(routeFromBranchId || null); }
      if (routeToBranchId   !== undefined) { updates.push('route_to_branch_id = ?');   params.push(routeToBranchId || null); }
      if (driverName        !== undefined) { updates.push('driver_name = ?');          params.push(driverName ? driverName.trim() : null); }
      if (driverPhone       !== undefined) { updates.push('driver_phone = ?');         params.push(driverPhone ? driverPhone.trim() : null); }
      if (viaBranchIds      !== undefined) {
        updates.push('route_via_branches = ?');
        params.push(Array.isArray(viaBranchIds) && viaBranchIds.length > 0
          ? JSON.stringify(viaBranchIds.map(Number).filter(Boolean)) : null);
      }
      if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive ? 1 : 0); }

      if (updates.length === 0)
        return res.status(400).json({ success: false, message: 'No fields to update' });

      params.push(id);
      await pool.query(`UPDATE vehicles SET ${updates.join(', ')} WHERE id = ?`, params);

      await logAudit(req.user.id, req.user.role, 'updated_vehicle', 'vehicle', Number(id),
        { plateNumber, driverName }, req.ip);

      res.json({ success: true, message: 'Vehicle updated successfully' });
    } catch (error) {
      console.error('Update vehicle error:', error);
      res.status(500).json({ success: false, message: 'Failed to update vehicle' });
    }
  },

  deleteVehicle: async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT plate_number FROM vehicles WHERE id = ?', [req.params.id]);
      await pool.query('DELETE FROM vehicles WHERE id = ?', [req.params.id]);
      await logAudit(req.user.id, req.user.role, 'deleted_vehicle', 'vehicle', Number(req.params.id),
        { plateNumber: rows[0]?.plate_number }, req.ip);
      res.json({ success: true, message: 'Vehicle deleted' });
    } catch (error) {
      console.error('Delete vehicle error:', error);
      res.status(500).json({ success: false, message: 'Failed to delete vehicle' });
    }
  },

  // ─── Orders Management ────────────────────────────────────
  getOrders: async (req, res) => {
    try {
      const { status, page = 1, limit = 50, search } = req.query;
      const offset = (page - 1) * limit;

      let query = `
        SELECT o.id, o.order_number, o.total_amount, o.discount_amount, o.delivery_charge,
               o.cod_advance_paid,
               o.order_status as status,
               o.payment_status, o.payment_method,
               o.shipping_address, o.shipping_city, o.shipping_country,
               o.created_at, o.updated_at,
               o.assigned_branch_id, o.assigned_branch_at,
               o.receiver_mobile, o.district, o.upazila, o.receiver_location,
               ab.name as assigned_branch_name,
               u.username as customer_name, u.email as customer_email, u.phone as customer_phone,
               (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count,
               d.id as delivery_id, d.status as delivery_status,
               d.delivery_boy_name, d.vehicle_plate,
               fb.name as from_branch_name, tb.name as to_branch_name
        FROM orders o
        LEFT JOIN users u         ON u.id  = o.user_id
        LEFT JOIN deliveries d    ON d.order_id  = o.id
        LEFT JOIN branches ab     ON ab.id = o.assigned_branch_id
        LEFT JOIN branches fb     ON fb.id = d.from_branch_id
        LEFT JOIN branches tb     ON tb.id = d.to_branch_id
        WHERE 1=1`;
      const params = [];

      if (status) { query += ' AND o.order_status = ?'; params.push(status); }
      if (search) {
        query += ' AND (u.username LIKE ? OR u.email LIKE ? OR o.id = ? OR o.order_number LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, parseInt(search) || 0, `%${search}%`);
      }

      query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
      params.push(Number(limit), Number(offset));

      const [orders] = await pool.query(query, params);
      const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM orders');

      res.json({ success: true, data: orders, total });
    } catch (error) {
      console.error('Get orders error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch orders' });
    }
  },

  // ─── Assign Branch to Order ───────────────────────────────
  assignBranchToOrder: async (req, res) => {
    try {
      const { id } = req.params;
      const { branchId } = req.body;
      if (!branchId) return res.status(400).json({ success: false, message: 'branchId is required' });

      const [orders] = await pool.query('SELECT id, order_status FROM orders WHERE id = ?', [id]);
      if (!orders.length) return res.status(404).json({ success: false, message: 'Order not found' });
      if (['cancelled', 'returned'].includes(orders[0].order_status))
        return res.status(400).json({ success: false, message: `Order is ${orders[0].order_status}` });

      const [branchRows] = await pool.query('SELECT id, name FROM branches WHERE id = ?', [branchId]);
      if (!branchRows.length) return res.status(404).json({ success: false, message: 'Branch not found' });

      await pool.query(
        `UPDATE orders
         SET assigned_branch_id = ?, assigned_branch_at = NOW(),
             order_status = CASE WHEN order_status = 'pending' THEN 'processing' ELSE order_status END
         WHERE id = ?`,
        [branchId, id]
      );

      await logAudit(req.user.id, req.user.role, 'assigned_branch_to_order', 'order', Number(id),
        { branchId, branchName: branchRows[0].name }, req.ip);

      res.json({ success: true, message: `Order assigned to ${branchRows[0].name}`,
                 data: { branchName: branchRows[0].name } });
    } catch (error) {
      console.error('Assign branch to order error:', error);
      res.status(500).json({ success: false, message: 'Failed to assign branch' });
    }
  },

  // ─── Cancel Delivery Assignment ───────────────────────────
  cancelOrderDelivery: async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const { id } = req.params;
      await connection.beginTransaction();

      const [orders] = await connection.query(
        'SELECT id, order_number, user_id, order_status FROM orders WHERE id = ?', [id]
      );
      if (!orders.length) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      const [deliveries] = await connection.query('SELECT id FROM deliveries WHERE order_id = ?', [id]);
      if (!deliveries.length) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'No delivery assignment found for this order' });
      }

      await connection.query('DELETE FROM deliveries WHERE order_id = ?', [id]);
      await connection.query(
        "UPDATE orders SET order_status = 'processing', assigned_branch_id = NULL, assigned_branch_at = NULL WHERE id = ?",
        [id]
      );
      await connection.query(
        `INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type)
         VALUES (?, 'order_update', 'Order Assignment Cancelled', ?, ?, 'order')`,
        [orders[0].user_id,
         `Your order #${orders[0].order_number} delivery assignment has been cancelled and is being re-processed.`,
         id]
      );

      await connection.commit();
      await logAudit(req.user.id, req.user.role, 'cancelled_delivery_assignment', 'order', Number(id),
        { order_number: orders[0].order_number }, req.ip);

      res.json({ success: true, message: 'Delivery assignment cancelled, order reset to processing' });
    } catch (error) {
      try { await connection.rollback(); } catch {}
      console.error('Cancel delivery error:', error);
      res.status(500).json({ success: false, message: 'Failed to cancel delivery assignment' });
    } finally {
      connection.release();
    }
  },

  updateOrderStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const allowed = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];
      if (!allowed.includes(status)) {
        return res.status(400).json({ success: false, message: `Status must be one of: ${allowed.join(', ')}` });
      }

      // Auto-complete COD payment when order is delivered
      const [[order]] = await pool.query(
        'SELECT payment_method, payment_status FROM orders WHERE id = ?', [id]
      );
      const paymentUpdate = (status === 'delivered' && order?.payment_method === 'cash_on_delivery')
        ? ', payment_status = \'paid\''
        : '';

      await pool.query(`UPDATE orders SET order_status = ?${paymentUpdate} WHERE id = ?`, [status, id]);

      await logAudit(req.user.id, req.user.role, 'updated_order_status', 'order', Number(id),
        { newStatus: status }, req.ip);

      res.json({ success: true, message: `Order status updated to ${status}` });
    } catch (error) {
      console.error('Update order status error:', error);
      res.status(500).json({ success: false, message: 'Failed to update order status' });
    }
  },

  // ─── Assign Delivery to Order ─────────────────────────────
  assignDeliveryToOrder: async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const { id } = req.params;
      const {
        fromBranchId, toBranchId, deliveryType = 'branch_to_branch',
        destinationAddress, weightKg, sizeFeet,
        packagingCategory = 'standard', deliveryBoyUserId, vehiclePlate
      } = req.body;

      if (!fromBranchId || !toBranchId) return res.status(400).json({ success: false, message: 'fromBranchId and toBranchId are required' });
      if (!weightKg || Number(weightKg) <= 0) return res.status(400).json({ success: false, message: 'Valid weightKg is required' });
      if (!sizeFeet || Number(sizeFeet) <= 0) return res.status(400).json({ success: false, message: 'Valid sizeFeet is required' });
      if (!deliveryBoyUserId) return res.status(400).json({ success: false, message: 'deliveryBoyUserId is required' });
      if (!vehiclePlate) return res.status(400).json({ success: false, message: 'vehiclePlate is required' });

      const fromId = Number(fromBranchId);
      const toId = Number(toBranchId);
      const feet = Number(sizeFeet);
      const pkgCat = ['plastic', 'glass', 'fragile', 'standard'].includes(packagingCategory) ? packagingCategory : 'standard';
      const roundedWeight = Math.ceil(Number(weightKg) * 2) / 2;

      await connection.beginTransaction();

      const [orders] = await connection.query('SELECT * FROM orders WHERE id = ? LIMIT 1', [id]);
      if (!orders.length) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
      const order = orders[0];
      if (['cancelled', 'returned'].includes(order.order_status)) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: `Order is ${order.order_status} and cannot be delivered` });
      }

      const [existing] = await connection.query('SELECT id FROM deliveries WHERE order_id = ? LIMIT 1', [id]);
      if (existing.length > 0) {
        await connection.rollback();
        return res.status(409).json({ success: false, message: 'Delivery already assigned for this order' });
      }

      const [drivers] = await connection.query(
        "SELECT id, username, phone FROM users WHERE id = ? AND role = 'delivery_boy' AND status = 'active' LIMIT 1",
        [Number(deliveryBoyUserId)]
      );
      if (!drivers.length) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Invalid or inactive delivery boy' });
      }
      const driver = drivers[0];

      const settingMap = await loadPricingMap();
      const pricePerKg   = settingMap.cost_per_kg   || 0.4;
      const pricePerFoot = settingMap.cost_per_foot  || 0.6;
      const pkgCosts = {
        plastic:  settingMap.packaging_plastic  || 1.0,
        glass:    settingMap.packaging_glass    || 1.5,
        fragile:  settingMap.packaging_fragile  || 2.0,
        standard: settingMap.packaging_standard || 1.0
      };
      const pkgUnitCost = pkgCosts[pkgCat] || 1.0;

      const [routeRows] = await connection.query(
        'SELECT charge_branch_to_branch, charge_branch_to_branch_address FROM branch_delivery_pricing WHERE from_branch_id = ? AND to_branch_id = ? AND is_active = 1 LIMIT 1',
        [fromId, toId]
      ).catch(() => [[]]);
      const defaultRoute = deliveryType === 'branch_to_branch_address'
        ? (settingMap.route_branch_to_address || 2.5)
        : (settingMap.route_branch_to_branch  || 2.0);
      const routeCharge = routeRows.length > 0
        ? (deliveryType === 'branch_to_branch_address'
            ? Number(routeRows[0].charge_branch_to_branch_address)
            : Number(routeRows[0].charge_branch_to_branch))
        : defaultRoute;

      const costWeight    = Number((roundedWeight * pricePerKg).toFixed(2));
      const costSize      = Number((feet * pricePerFoot).toFixed(2));
      const costRoute     = Number(routeCharge.toFixed(2));
      const packagingCost = Number((pkgUnitCost * feet).toFixed(2));
      const totalCost     = Number((costWeight + costSize + costRoute + packagingCost).toFixed(2));

      const [deliveryResult] = await connection.query(
        `INSERT INTO deliveries
          (order_id, order_number, from_branch_id, to_branch_id, delivery_type,
           destination_address, weight_kg, size_feet, packaging_category, packaging_cost,
           price_per_kg, price_per_foot, cost_weight, cost_size, cost_route, total_cost,
           delivery_boy_name, delivery_boy_phone, vehicle_plate, delivery_boy_user_id,
           assigned_by_user_id, seller_paid_cash, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'in_transit')`,
        [
          order.id, order.order_number, fromId, toId, deliveryType,
          destinationAddress || null, roundedWeight, feet, pkgCat, packagingCost,
          pricePerKg, pricePerFoot, costWeight, costSize, costRoute, totalCost,
          driver.username, driver.phone || '', vehiclePlate,
          driver.id, req.user.id
        ]
      );

      await connection.query("UPDATE orders SET order_status = 'shipped' WHERE id = ?", [order.id]);

      await connection.query(
        `INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type)
         VALUES (?, 'order_shipped', 'Order Shipped! 🚚', ?, ?, 'order')`,
        [
          order.user_id,
          `Your order #${order.order_number} is on the way! Delivery boy: ${driver.username}, Vehicle: ${vehiclePlate}.`,
          order.id
        ]
      );

      const [companyRows] = await connection.query(
        'SELECT DISTINCT company_id FROM order_items WHERE order_id = ?', [order.id]
      );
      for (const row of companyRows) {
        await connection.query(
          `INSERT INTO company_notifications (company_id, type, title, message, reference_id, reference_type)
           VALUES (?, 'system', 'Order Shipped', ?, ?, 'order')`,
          [
            row.company_id,
            `Order #${order.order_number} is now in delivery. Driver: ${driver.username}, Vehicle: ${vehiclePlate}.`,
            order.id
          ]
        );
      }

      await connection.commit();

      await logAudit(req.user.id, req.user.role, 'assigned_delivery', 'order', Number(id),
        { order_number: order.order_number, delivery_boy: driver.username, vehicle: vehiclePlate, totalCost }, req.ip);

      res.status(201).json({
        success: true,
        message: 'Delivery assigned successfully',
        data: { deliveryId: deliveryResult.insertId, totalCost, orderNumber: order.order_number }
      });
    } catch (error) {
      try { await connection.rollback(); } catch {}
      console.error('Assign delivery to order error:', error);
      res.status(500).json({ success: false, message: 'Failed to assign delivery' });
    } finally {
      connection.release();
    }
  },

  // ─── Activity Audit Logs ──────────────────────────────────
  getAuditLogs: async (req, res) => {
    try {
      const { page = 1, limit = 100, action, adminId, days = 30 } = req.query;
      const offset = (page - 1) * limit;

      let query = `
        SELECT l.*, u.username as admin_username, u.email as admin_email, u.role as admin_role_name
        FROM admin_audit_log l
        JOIN users u ON u.id = l.admin_user_id
        WHERE l.created_at >= NOW() - (? * INTERVAL '1 day')`;
      const params = [Number(days)];

      if (action)  { query += ' AND l.action = ?';         params.push(action); }
      if (adminId) { query += ' AND l.admin_user_id = ?';  params.push(adminId); }

      query += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
      params.push(Number(limit), Number(offset));

      const [logs] = await pool.query(query, params);

      const [[{ total }]] = await pool.query(
        "SELECT COUNT(*) as total FROM admin_audit_log WHERE created_at >= NOW() - (? * INTERVAL '1 day')",
        [Number(days)]
      );

      res.json({ success: true, data: logs, total });
    } catch (error) {
      console.error('Get audit logs error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch audit logs' });
    }
  },

  // ─── Users (Customers/Sellers) ────────────────────────────
  getUsers: async (req, res) => {
    try {
      const { search, page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      let query = `SELECT id, username, email, phone, role, is_seller, status, points, stars, created_at
                   FROM users WHERE role = 'customer'`;
      const params = [];

      if (search) { query += ' AND (username LIKE ? OR email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(Number(limit), Number(offset));

      const [users] = await pool.query(query, params);
      const [[{ total }]] = await pool.query("SELECT COUNT(*) as total FROM users WHERE role = 'customer'");

      res.json({ success: true, data: users, total });
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
  },

  // ─── Products ─────────────────────────────────────────────
  getProducts: async (req, res) => {
    try {
      const { status, search, page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      let query = `
        SELECT p.id, p.name, p.current_price AS price, p.stock_quantity AS stock, p.status, p.created_at,
               c.company_name
        FROM products p
        LEFT JOIN companies c ON c.id = p.company_id
        WHERE 1=1`;
      const params = [];

      if (status) { query += ' AND p.status = ?'; params.push(status); }
      if (search) { query += ' AND p.name LIKE ?'; params.push(`%${search}%`); }
      query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
      params.push(Number(limit), Number(offset));

      const [products] = await pool.query(query, params);
      const [[{ total }]] = await pool.query('SELECT COUNT(*) as total FROM products');

      res.json({ success: true, data: products, total });
    } catch (error) {
      console.error('Get products error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch products' });
    }
  },

  toggleProductStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const [rows] = await pool.query('SELECT status, name FROM products WHERE id = ?', [id]);
      if (rows.length === 0) return res.status(404).json({ success: false, message: 'Product not found' });

      const newStatus = rows[0].status === 'active' ? 'inactive' : 'active';
      await pool.query('UPDATE products SET status = ? WHERE id = ?', [newStatus, id]);

      await logAudit(req.user.id, req.user.role,
        newStatus === 'active' ? 'activated_product' : 'deactivated_product',
        'product', Number(id), { name: rows[0].name }, req.ip);

      res.json({ success: true, status: newStatus, message: `Product ${newStatus}` });
    } catch (error) {
      console.error('Toggle product status error:', error);
      res.status(500).json({ success: false, message: 'Failed to toggle product status' });
    }
  },

  // ─── Branch Delivery Stats ────────────────────────────────
  getBranchDeliveryStats: async (req, res) => {
    try {
      const { branchId, date } = req.query;
      if (!branchId) return res.status(400).json({ success: false, message: 'branchId is required' });

      let dateFilter = '';
      const params = [branchId, branchId];
      if (date) { dateFilter = ' AND DATE(d.assigned_at) = ?'; params.push(date); }

      const [deliveries] = await pool.query(
        `SELECT d.*, fb.name as from_branch_name, tb.name as to_branch_name
         FROM deliveries d
         JOIN branches fb ON fb.id = d.from_branch_id
         JOIN branches tb ON tb.id = d.to_branch_id
         WHERE (d.from_branch_id = ? OR d.to_branch_id = ?)${dateFilter}
         ORDER BY d.assigned_at DESC`,
        params
      );
      res.json({ success: true, data: deliveries });
    } catch (error) {
      console.error('Branch delivery stats error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch branch delivery stats' });
    }
  },

  // ─── Analytics ────────────────────────────────────────────
  getAnalytics: async (req, res) => {
    try {
      const { period = 'monthly' } = req.query;
      let dateFormat = 'YYYY-MM';
      if (period === 'daily')  dateFormat = 'YYYY-MM-DD';
      if (period === 'yearly') dateFormat = 'YYYY';

      const [revenueData] = await pool.query(
        `SELECT TO_CHAR(created_at, ?) as label, SUM(total_amount) as revenue, COUNT(*) as orders
         FROM orders WHERE payment_status='paid' GROUP BY 1 ORDER BY 1 DESC LIMIT 12`,
        [dateFormat]
      );
      const [deliveryData] = await pool.query(
        `SELECT TO_CHAR(assigned_at, ?) as label, COUNT(*) as total,
                SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) as completed,
                SUM(total_cost) as delivery_revenue
         FROM deliveries GROUP BY 1 ORDER BY 1 DESC LIMIT 12`,
        [dateFormat]
      );

      res.json({ success: true, data: { revenue: revenueData.reverse(), deliveries: deliveryData.reverse() } });
    } catch (error) {
      console.error('Analytics error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch analytics' });
    }
  },

  // ─── Customer Feedback ────────────────────────────────────
  getFeedback: async (req, res) => {
    try {
      const [feedback] = await pool.query(
        `SELECT f.*, u.username AS submitter_username, u.email AS submitter_email,
                c.company_name
         FROM feedbacks f
         LEFT JOIN users u ON u.id = f.user_id
         LEFT JOIN companies c ON c.id = f.company_id
         ORDER BY f.created_at ASC LIMIT 200`
      );
      res.json({ success: true, data: feedback });
    } catch (error) {
      console.error('Get feedback error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch feedback' });
    }
  },

  sendCompanyWarning: async (req, res) => {
    try {
      const { id } = req.params;
      const { company_id, reason } = req.body;

      if (!reason || reason.trim().length === 0)
        return res.status(400).json({ success: false, message: 'Warning reason is required' });

      // Resolve company — use body param (staff picks it if not linked) or feedback's own company_id
      let targetCompanyId = company_id;
      if (!targetCompanyId) {
        const [[fb]] = await pool.query('SELECT company_id FROM feedbacks WHERE id = ?', [id]);
        targetCompanyId = fb?.company_id;
      }
      if (!targetCompanyId)
        return res.status(400).json({ success: false, message: 'No company linked to this complaint' });

      const [[company]] = await pool.query('SELECT company_name FROM companies WHERE id = ?', [targetCompanyId]);
      if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

      await pool.query(
        `INSERT INTO company_notifications (company_id, type, title, message)
         VALUES (?, 'system', '⚠️ Warning from FlexCart Admin', ?)`,
        [targetCompanyId, reason.trim()]
      );

      await pool.query("UPDATE feedbacks SET status = 'reviewed' WHERE id = ?", [id]);

      res.json({ success: true, message: `Warning sent to ${company.company_name}` });
    } catch (error) {
      console.error('Send company warning error:', error);
      res.status(500).json({ success: false, message: 'Failed to send warning' });
    }
  },

  // ─── Admin Notifications ──────────────────────────────────
  getAdminNotifications: async (req, res) => {
    try {
      const [notifs] = await pool.query(
        'SELECT * FROM admin_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30',
        [req.user.id]
      );
      res.json({ success: true, data: notifs });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
    }
  },

  // ─── Company Verification Requests ───────────────────────
  getCompanyVerifications: async (req, res) => {
    try {
      const { status = 'pending', page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      const [verifications] = await pool.query(
        `SELECT c.id, c.company_name, c.category, c.description,
                c.nid_number, c.nid_image, c.nid_front_image, c.nid_back_image, c.face_image,
                c.company_logo, c.contact_email, c.contact_phone,
                c.address, c.city, c.country, c.website,
                c.verification_status, c.rejection_reason, c.created_at,
                u.id as user_id, u.username, u.email, u.profile_image
         FROM companies c
         JOIN users u ON u.id = c.user_id
         WHERE c.verification_status = ?
         ORDER BY c.created_at DESC
         LIMIT ? OFFSET ?`,
        [status, Number(limit), Number(offset)]
      );

      const [[{ total }]] = await pool.query(
        'SELECT COUNT(*) as total FROM companies WHERE verification_status = ?', [status]
      );
      const [[{ pendingCount }]] = await pool.query(
        "SELECT COUNT(*) as pendingCount FROM companies WHERE verification_status = 'pending'"
      );
      const [[{ approvedCount }]] = await pool.query(
        "SELECT COUNT(*) as approvedCount FROM companies WHERE verification_status = 'approved'"
      );
      const [[{ rejectedCount }]] = await pool.query(
        "SELECT COUNT(*) as rejectedCount FROM companies WHERE verification_status = 'rejected'"
      );

      res.json({ success: true, data: verifications, total, pendingCount, approvedCount, rejectedCount });
    } catch (error) {
      console.error('Get company verifications error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch verification requests' });
    }
  },

  approveCompanyVerification: async (req, res) => {
    try {
      const { id } = req.params;
      const [rows] = await pool.query(
        "SELECT id, user_id, company_name, verification_status FROM companies WHERE id = ?", [id]
      );
      if (rows.length === 0) return res.status(404).json({ success: false, message: 'Company not found' });
      if (rows[0].verification_status !== 'pending') {
        return res.status(400).json({ success: false, message: 'This request has already been reviewed' });
      }

      await pool.query(
        "UPDATE companies SET verification_status = 'approved', is_verified = 1, badge = 'bronze', status = 'active' WHERE id = ?", [id]
      );
      await pool.query('UPDATE users SET is_seller = 1 WHERE id = ?', [rows[0].user_id]);
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type)
         VALUES (?, 'company_approved', 'Company Approved! 🎉', ?, ?, 'company')`,
        [rows[0].user_id,
         `Your company "${rows[0].company_name}" has been approved. You can now start listing products!`,
         Number(id)]
      );

      await logAudit(req.user.id, req.user.role, 'approved_company_verification',
        'company', Number(id), { company_name: rows[0].company_name }, req.ip);

      res.json({ success: true, message: `Company "${rows[0].company_name}" approved successfully` });
    } catch (error) {
      console.error('Approve company verification error:', error);
      res.status(500).json({ success: false, message: 'Failed to approve company' });
    }
  },

  rejectCompanyVerification: async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const [rows] = await pool.query(
        "SELECT id, user_id, company_name, verification_status FROM companies WHERE id = ?", [id]
      );
      if (rows.length === 0) return res.status(404).json({ success: false, message: 'Company not found' });
      if (rows[0].verification_status !== 'pending') {
        return res.status(400).json({ success: false, message: 'This request has already been reviewed' });
      }

      await pool.query(
        "UPDATE companies SET verification_status = 'rejected', is_verified = 0, rejection_reason = ? WHERE id = ?",
        [reason || null, id]
      );
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type)
         VALUES (?, 'company_rejected', 'Company Application Rejected', ?, ?, 'company')`,
        [rows[0].user_id,
         reason
           ? `Your company "${rows[0].company_name}" was not approved. Reason: ${reason}`
           : `Your company "${rows[0].company_name}" was not approved. Please contact support.`,
         Number(id)]
      );

      await logAudit(req.user.id, req.user.role, 'rejected_company_verification',
        'company', Number(id), { company_name: rows[0].company_name, reason }, req.ip);

      res.json({ success: true, message: `Company "${rows[0].company_name}" rejected` });
    } catch (error) {
      console.error('Reject company verification error:', error);
      res.status(500).json({ success: false, message: 'Failed to reject company' });
    }
  }
};

module.exports = staffAdminController;
