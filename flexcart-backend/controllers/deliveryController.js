const { pool } = require('../config/db');
const {
  getVehiclesByRoute,
  getAvailableDeliveryBoysByLocation,
  updateDeliveryBoyAvailability
} = require('../services/deliveryAssignmentModel');
const {
  appendTrackingEvent,
  getTrackingTimeline,
  isValidTrackingStatus,
  TRACKING_STATUSES,
  TRACKING_STATUS_ORDER
} = require('../services/orderTrackingModel');
const { formatOrderDeliveryStatus } = require('../services/deliveryStatusFormatter');
const { emitToBranch, emitToCompany, emitToOrder, emitToUser } = require('../services/realtimeGateway');

const DEFAULT_PRICE_PER_KG = 0.4;
const DEFAULT_PRICE_PER_FOOT = 0.6;

// Packaging unit costs (per foot). Total packaging cost = unitCost × sizeFeet
const DEFAULT_PACKAGING_UNIT_COSTS = {
  plastic: 1.00,
  glass: 1.50,
  fragile: 2.00,
  standard: 1.00
};

const DEFAULT_ROUTE_CHARGES = {
  branch_to_branch: 2.0,
  branch_to_branch_address: 2.5
};

let pricingCache = {
  atMs: 0,
  data: null
};

function parseSettingNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

async function loadPlatformSettingsMap(keys) {
  try {
    const placeholders = keys.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT setting_key, setting_value FROM platform_settings WHERE setting_key IN (${placeholders})`,
      keys
    );
    const map = {};
    for (const r of rows) map[r.setting_key] = r.setting_value;
    return map;
  } catch {
    // platform_settings might not exist in older DBs; fall back to defaults.
    return {};
  }
}

async function getDeliveryPricingCached() {
  const now = Date.now();
  if (pricingCache.data && (now - pricingCache.atMs) < 30_000) return pricingCache.data;

  const keys = [
    'cost_per_kg',
    'cost_per_foot',
    'packaging_plastic',
    'packaging_glass',
    'packaging_fragile',
    'packaging_standard',
    'route_branch_to_branch',
    'route_branch_to_address'
  ];

  const map = await loadPlatformSettingsMap(keys);

  const pricePerKg = parseSettingNumber(map.cost_per_kg, DEFAULT_PRICE_PER_KG);
  const pricePerFoot = parseSettingNumber(map.cost_per_foot, DEFAULT_PRICE_PER_FOOT);

  const packagingUnitCosts = {
    plastic: parseSettingNumber(map.packaging_plastic, DEFAULT_PACKAGING_UNIT_COSTS.plastic),
    glass: parseSettingNumber(map.packaging_glass, DEFAULT_PACKAGING_UNIT_COSTS.glass),
    fragile: parseSettingNumber(map.packaging_fragile, DEFAULT_PACKAGING_UNIT_COSTS.fragile),
    standard: parseSettingNumber(map.packaging_standard, DEFAULT_PACKAGING_UNIT_COSTS.standard)
  };

  const defaultRouteCharges = {
    branch_to_branch: parseSettingNumber(map.route_branch_to_branch, DEFAULT_ROUTE_CHARGES.branch_to_branch),
    branch_to_branch_address: parseSettingNumber(map.route_branch_to_address, DEFAULT_ROUTE_CHARGES.branch_to_branch_address)
  };

  const data = { pricePerKg, pricePerFoot, packagingUnitCosts, defaultRouteCharges };
  pricingCache = { atMs: now, data };
  return data;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function roundUpToHalf(value) {
  const n = toNumber(value);
  if (n === null) return null;
  return Math.ceil(n * 2) / 2;
}

function getScopedBranchId(req, requestedBranchId = null) {
  const role = req.user?.role;
  const userBranchId = toInt(req.user?.assigned_branch_id);
  if (role === 'super_admin') {
    return requestedBranchId ?? userBranchId;
  }
  return userBranchId;
}

async function getRouteCharge(fromBranchId, toBranchId, deliveryType, fallbackCharges = DEFAULT_ROUTE_CHARGES) {
  const fallback = deliveryType === 'branch_to_branch_address'
    ? fallbackCharges.branch_to_branch_address
    : fallbackCharges.branch_to_branch;
  try {
    const [rows] = await pool.query(
      `SELECT charge_branch_to_branch, charge_branch_to_branch_address
       FROM branch_delivery_pricing
       WHERE from_branch_id = ? AND to_branch_id = ? AND is_active = 1
       LIMIT 1`,
      [fromBranchId, toBranchId]
    );
    if (rows.length === 0) return fallback;
    return deliveryType === 'branch_to_branch_address'
      ? Number(rows[0].charge_branch_to_branch_address)
      : Number(rows[0].charge_branch_to_branch);
  } catch {
    return fallback;
  }
}

function statusRank(status) {
  return TRACKING_STATUS_ORDER.indexOf(status);
}

const deliveryController = {
  getBranches: async (req, res) => {
    try {
      const [branches] = await pool.query('SELECT id, name, address FROM branches ORDER BY name ASC');
      res.json({ success: true, data: branches });
    } catch (error) {
      console.error('Get branches error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch branches' });
    }
  },

  getDeliveryPricing: async (req, res) => {
    try {
      const pricing = await getDeliveryPricingCached();
      res.json({
        success: true,
        data: {
          price_per_kg: Number(pricing.pricePerKg.toFixed(2)),
          price_per_foot: Number(pricing.pricePerFoot.toFixed(2)),
          packaging_unit_costs: pricing.packagingUnitCosts,
          default_route_charges: pricing.defaultRouteCharges,
          weight_rounding_kg: 0.5
        }
      });
    } catch (error) {
      console.error('Get delivery pricing error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch delivery pricing' });
    }
  },

  getBranchResources: async (req, res) => {
    try {
      const role = req.user?.role;
      const requestedBranchId = toInt(req.query.branchId);
      const userBranchId = toInt(req.user?.assigned_branch_id);

      const branchId = role === 'super_admin'
        ? (requestedBranchId ?? userBranchId)
        : userBranchId;

      if (branchId === null) {
        return res.status(400).json({ success: false, message: 'Branch is not assigned for this account' });
      }

      const [drivers] = await pool.query(
        `SELECT id, username, phone
         FROM users
         WHERE role = 'delivery_boy'
           AND assigned_branch_id = ?
           AND status = 'active'
           AND (is_approved IS NULL OR is_approved = 1)
         ORDER BY username ASC`,
        [branchId]
      );

      const [vehicles] = await pool.query(
        `SELECT id, plate_number, vehicle_type
         FROM vehicles
         WHERE branch_id = ? AND is_active = 1
         ORDER BY created_at DESC`,
        [branchId]
      );

      res.json({ success: true, data: { branchId, drivers, vehicles } });
    } catch (error) {
      console.error('Get branch resources error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch branch resources' });
    }
  },

  getRouteQuote: async (req, res) => {
    try {
      const { fromBranchId, toBranchId, deliveryType } = req.query;

      const fromId = toInt(fromBranchId);
      const toId = toInt(toBranchId);

      if (fromId === null || toId === null) {
        return res.status(400).json({ success: false, message: 'fromBranchId and toBranchId are required' });
      }
      if (!deliveryType || !['branch_to_branch', 'branch_to_branch_address'].includes(deliveryType)) {
        return res.status(400).json({ success: false, message: 'Invalid deliveryType' });
      }

      const pricing = await getDeliveryPricingCached();
      const costRoute = await getRouteCharge(fromId, toId, deliveryType, pricing.defaultRouteCharges);
      res.json({ success: true, data: { cost_route: Number(costRoute.toFixed(2)) } });
    } catch (error) {
      console.error('Get route quote error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch route quote' });
    }
  },

  getOrderForDelivery: async (req, res) => {
    try {
      const { orderNumber } = req.params;
      if (!orderNumber) return res.status(400).json({ success: false, message: 'orderNumber is required' });

      const [orders] = await pool.query(
        `SELECT o.*, ab.name as assigned_branch_name, u.username as customer_name, u.phone as customer_phone
         FROM orders o
         LEFT JOIN branches ab ON ab.id = o.assigned_branch_id
         JOIN users u ON u.id = o.user_id
         WHERE o.order_number = ?
         LIMIT 1`,
        [orderNumber]
      );

      if (orders.length === 0) return res.status(404).json({ success: false, message: 'Order not found' });

      const order = orders[0];
      const scopedBranchId = getScopedBranchId(req);
      if (req.user?.role !== 'super_admin') {
        if (scopedBranchId === null) {
          return res.status(400).json({ success: false, message: 'Branch is not assigned for this account' });
        }
        if (Number(order.assigned_branch_id || 0) !== Number(scopedBranchId)) {
          return res.status(403).json({ success: false, message: 'Not authorized to access this order for your branch' });
        }
      }

      const [items] = await pool.query(
        `SELECT oi.*, p.name as product_name, p.image_url, c.company_name
         FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         JOIN companies c ON oi.company_id = c.id
         WHERE oi.order_id = ?`,
        [order.id]
      );

      const [deliveries] = await pool.query(
        `SELECT d.*, fb.name as from_branch_name, tb.name as to_branch_name
         FROM deliveries d
         LEFT JOIN branches fb ON fb.id = d.from_branch_id
         LEFT JOIN branches tb ON tb.id = d.to_branch_id
         WHERE d.order_id = ?
         LIMIT 1`,
        [order.id]
      );

      const delivery = deliveries[0] || null;
      const deliveryStatusText = formatOrderDeliveryStatus(order, delivery);

      res.json({
        success: true,
        data: {
          order: { ...order, items, delivery, delivery_status_text: deliveryStatusText }
        }
      });
    } catch (error) {
      console.error('Get order for delivery error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch order' });
    }
  },

  getBranchAssignments: async (req, res) => {
    try {
      const requestedBranchId = toInt(req.query.branchId);
      const branchId = getScopedBranchId(req, requestedBranchId);
      if (branchId === null) {
        return res.status(400).json({ success: false, message: 'Branch is not assigned for this account' });
      }

      const [rows] = await pool.query(
        `SELECT o.id, o.order_number, o.order_status, o.current_status, o.assigned_branch_id,
                o.assigned_branch_at, o.branch_accepted_at,
                o.shipping_address, o.shipping_city, o.shipping_country, o.shipping_zip,
                o.district, o.upazila, o.receiver_location, o.receiver_mobile,
                o.payment_method, o.payment_status, o.delivery_charge,
                o.total_amount, o.cod_advance_paid,
                u.username AS customer_name, u.phone AS customer_phone,
                ab.name AS assigned_branch_name,
                pb.name AS previous_branch_name,
                (
                  SELECT STRING_AGG(cname, ', ' ORDER BY cname)
                  FROM (
                    SELECT DISTINCT comp.company_name AS cname
                    FROM companies comp
                    JOIN order_items oi2 ON oi2.company_id = comp.id
                    WHERE oi2.order_id = o.id
                  ) _cn
                ) AS company_names,
                (
                  SELECT SUM(oi2.total_price)
                  FROM order_items oi2
                  WHERE oi2.order_id = o.id
                ) AS order_total
         FROM orders o
         JOIN users u ON u.id = o.user_id
         LEFT JOIN branches ab ON ab.id = o.assigned_branch_id
         LEFT JOIN branches pb ON pb.id = o.previous_branch_id
         LEFT JOIN deliveries d ON d.order_id = o.id
         WHERE o.assigned_branch_id = ?
           AND d.id IS NULL
           AND o.order_status NOT IN ('cancelled', 'delivered', 'returned')
         ORDER BY (o.branch_accepted_at IS NULL) DESC, o.assigned_branch_at DESC, o.created_at DESC`,
        [branchId]
      );

      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('Get branch assignments error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch branch assignments' });
    }
  },

  acceptBranchAssignment: async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const orderNumber = String(req.params.orderNumber || '').trim();
      if (!orderNumber) {
        return res.status(400).json({ success: false, message: 'orderNumber is required' });
      }

      const branchId = getScopedBranchId(req);
      if (branchId === null) {
        return res.status(400).json({ success: false, message: 'Branch is not assigned for this account' });
      }

      await connection.beginTransaction();

      const [orders] = await connection.query(
        `SELECT o.id, o.order_number, o.user_id, o.order_status, o.assigned_branch_id, o.branch_accepted_at,
                b.name as assigned_branch_name
         FROM orders o
         LEFT JOIN branches b ON b.id = o.assigned_branch_id
         WHERE o.order_number = ?
         LIMIT 1`,
        [orderNumber]
      );

      if (orders.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      const order = orders[0];
      if (Number(order.assigned_branch_id || 0) !== Number(branchId)) {
        await connection.rollback();
        return res.status(403).json({ success: false, message: 'Order is not assigned to your branch' });
      }

      if (order.branch_accepted_at) {
        await connection.rollback();
        return res.json({ success: true, message: 'Branch already accepted this order' });
      }

      const [existingDelivery] = await connection.query(
        'SELECT id FROM deliveries WHERE order_id = ? LIMIT 1',
        [order.id]
      );
      if (existingDelivery.length > 0) {
        await connection.rollback();
        return res.status(409).json({ success: false, message: 'Delivery already created for this order' });
      }

      await connection.query(
        `UPDATE orders
         SET branch_accepted_at = NOW(),
             branch_accepted_by_user_id = ?,
             order_status = CASE
               WHEN order_status = 'pending' THEN 'processing'
               ELSE order_status
             END
         WHERE id = ?`,
        [req.user.id, order.id]
      );

      await appendTrackingEvent({
        orderId: order.id,
        status: TRACKING_STATUSES.AT_HUB,
        location: `Branch Accepted: ${order.assigned_branch_name || `Branch ${branchId}`}`,
        updatedBy: req.user.id,
        connection
      });

      const [companyRows] = await connection.query(
        'SELECT DISTINCT company_id FROM order_items WHERE order_id = ?',
        [order.id]
      );

      for (const row of companyRows) {
        await connection.query(
          `INSERT INTO company_notifications (company_id, type, title, message, reference_id, reference_type)
           VALUES (?, 'system', 'Branch Accepted', ?, ?, 'order')`,
          [
            row.company_id,
            `Order #${order.order_number} is accepted by ${order.assigned_branch_name || `Branch ${branchId}`}.`,
            order.id
          ]
        );
      }

      await connection.query(
        `INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type)
         VALUES (?, 'order_update', 'Branch Accepted', ?, ?, 'order')`,
        [
          order.user_id,
          `Your order #${order.order_number} has been accepted by ${order.assigned_branch_name || `Branch ${branchId}`}.`,
          order.id
        ]
      );

      await connection.commit();

      emitToBranch(branchId, 'delivery:queue:changed', {
        orderNumber: order.order_number,
        reason: 'branch_assignment_accepted'
      });
      emitToUser(order.user_id, 'order:status:changed', {
        orderNumber: order.order_number,
        status: 'branch_accepted',
        branchName: order.assigned_branch_name || `Branch ${branchId}`,
        source: 'branch_accepted'
      });
      emitToOrder(order.order_number, 'order:tracking:changed', {
        orderNumber: order.order_number,
        status: 'branch_accepted',
        branchName: order.assigned_branch_name || `Branch ${branchId}`,
        source: 'branch_accepted'
      });
      for (const row of companyRows) {
        emitToCompany(row.company_id, 'company:dashboard:refresh', {
          companyId: row.company_id,
          orderNumber: order.order_number,
          reason: 'branch_accepted'
        });
      }

      res.json({ success: true, message: 'Branch accepted successfully' });
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // ignore
      }
      console.error('Accept branch assignment error:', error);
      res.status(500).json({ success: false, message: 'Failed to accept branch assignment' });
    } finally {
      connection.release();
    }
  },

  getBranchStats: async (req, res) => {
    try {
      const requestedBranchId = toInt(req.query.branchId);
      const branchId = getScopedBranchId(req, requestedBranchId);
      if (branchId === null) {
        return res.status(400).json({ success: false, message: 'Branch is not assigned for this account' });
      }

      const { from_date, to_date } = req.query;
      const dateParams = [];
      let delivDateClause = '';
      if (from_date) { delivDateClause += ' AND d.assigned_at >= ?'; dateParams.push(from_date); }
      if (to_date)   { delivDateClause += ' AND d.assigned_at <= ?'; dateParams.push(to_date + ' 23:59:59'); }

      const [[pendingAssignments]] = await pool.query(
        `SELECT COUNT(*) as count
         FROM orders o
         LEFT JOIN deliveries d ON d.order_id = o.id
         WHERE o.assigned_branch_id = ?
           AND o.branch_accepted_at IS NULL
           AND d.id IS NULL
           AND o.order_status NOT IN ('cancelled', 'delivered', 'returned')`,
        [branchId]
      );

      const [[acceptedAssignments]] = await pool.query(
        `SELECT COUNT(*) as count
         FROM orders o
         LEFT JOIN deliveries d ON d.order_id = o.id
         WHERE o.assigned_branch_id = ?
           AND o.branch_accepted_at IS NOT NULL
           AND d.id IS NULL
           AND o.order_status NOT IN ('cancelled', 'delivered', 'returned')`,
        [branchId]
      );

      const [[completedDeliveries]] = await pool.query(
        `SELECT COUNT(*) as count
         FROM deliveries d
         WHERE d.from_branch_id = ? AND d.status = 'delivered'${delivDateClause}`,
        [branchId, ...dateParams]
      );

      const [[rejectedDeliveries]] = await pool.query(
        `SELECT COUNT(*) as count
         FROM deliveries d
         WHERE d.from_branch_id = ? AND d.status = 'rejected'${delivDateClause}`,
        [branchId, ...dateParams]
      );

      const [[totalDeliveries]] = await pool.query(
        `SELECT COUNT(*) as count
         FROM deliveries d
         WHERE d.from_branch_id = ?${delivDateClause}`,
        [branchId, ...dateParams]
      );

      const [[inProgressDeliveries]] = await pool.query(
        `SELECT COUNT(*) as count
         FROM deliveries d
         WHERE d.from_branch_id = ? AND d.status IN ('assigned','in_transit','out_for_delivery')${delivDateClause}`,
        [branchId, ...dateParams]
      );

      res.json({
        success: true,
        data: {
          total_deliveries:     Number(totalDeliveries.count || 0),
          accepted_deliveries:  Number(acceptedAssignments.count || 0),
          pending_deliveries:   Number(pendingAssignments.count || 0),
          completed_deliveries: Number(completedDeliveries.count || 0),
          rejected_deliveries:  Number(rejectedDeliveries.count || 0),
          in_progress_deliveries: Number(inProgressDeliveries.count || 0)
        }
      });
    } catch (error) {
      console.error('Get branch stats error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch branch stats' });
    }
  },

  assignDelivery: async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const {
        orderNumber,
        weightKg,
        sizeFeet,
        fromBranchId,
        toBranchId,
        deliveryType,
        destinationAddress,
        packagingCategory,
        deliveryBoyUserId,
        deliveryBoyName,
        deliveryBoyPhone,
        vehiclePlate
      } = req.body;

      if (!orderNumber) return res.status(400).json({ success: false, message: 'orderNumber is required' });
      if (!fromBranchId || !toBranchId) return res.status(400).json({ success: false, message: 'fromBranchId and toBranchId are required' });
      if (!deliveryType || !['branch_to_branch', 'branch_to_branch_address'].includes(deliveryType)) {
        return res.status(400).json({ success: false, message: 'Invalid deliveryType' });
      }
      const requiresDriver = deliveryType === 'branch_to_branch_address';

      const roundedWeight = roundUpToHalf(weightKg);
      const feet = toInt(sizeFeet);
      const fromId = toInt(fromBranchId);
      const toId = toInt(toBranchId);
      const pkgCat = ['plastic', 'glass', 'fragile', 'standard'].includes(packagingCategory) ? packagingCategory : 'standard';

      if (req.user?.role !== 'super_admin') {
        const userBranchId = toInt(req.user?.assigned_branch_id);
        if (userBranchId === null) {
          return res.status(400).json({ success: false, message: 'Branch is not assigned for this account' });
        }
        if (fromId !== userBranchId) {
          return res.status(403).json({ success: false, message: 'You can only process deliveries from your assigned branch' });
        }
      }

      const pricing = await getDeliveryPricingCached();
      const pkgUnitCost = pricing.packagingUnitCosts[pkgCat] ?? pricing.packagingUnitCosts.standard;

      if (roundedWeight === null || roundedWeight <= 0) {
        return res.status(400).json({ success: false, message: 'weightKg must be a positive number' });
      }
      if (feet === null || feet <= 0) {
        return res.status(400).json({ success: false, message: 'sizeFeet must be a positive integer' });
      }
      if (fromId === null || toId === null) {
        return res.status(400).json({ success: false, message: 'fromBranchId and toBranchId must be numbers' });
      }

      const driverUserId = toInt(deliveryBoyUserId);
      let finalDriverUserId = null;
      let finalDriverName = deliveryBoyName || null;
      let finalDriverPhone = deliveryBoyPhone || null;

      if (driverUserId !== null) {
        const [driverRows] = await connection.query(
          `SELECT id, username, phone, assigned_branch_id, status, is_approved, delivery_is_available
           FROM users
           WHERE id = ? AND role = 'delivery_boy'
           LIMIT 1`,
          [driverUserId]
        );
        if (driverRows.length === 0) {
          return res.status(400).json({ success: false, message: 'Invalid deliveryBoyUserId' });
        }

        const driver = driverRows[0];
        if (driver.status && driver.status !== 'active') {
          return res.status(400).json({ success: false, message: 'Selected delivery boy is not active' });
        }
        if (driver.is_approved !== undefined && Number(driver.is_approved) === 0) {
          return res.status(400).json({ success: false, message: 'Selected delivery boy is pending approval' });
        }
        if (driver.delivery_is_available !== undefined && Number(driver.delivery_is_available) === 0) {
          return res.status(400).json({ success: false, message: 'Selected delivery boy is currently unavailable' });
        }
        if (driver.assigned_branch_id !== null && Number(driver.assigned_branch_id) !== fromId) {
          return res.status(400).json({ success: false, message: 'Selected delivery boy is not assigned to the from-branch' });
        }

        finalDriverUserId = driver.id;
        finalDriverName = driver.username;
        finalDriverPhone = driver.phone;
      }

      const packagingCost = Number((pkgUnitCost * feet).toFixed(2));

      await connection.beginTransaction();

      const [orders] = await connection.query(
        'SELECT * FROM orders WHERE order_number = ? LIMIT 1',
        [orderNumber]
      );
      if (orders.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      const order = orders[0];
      if (['cancelled', 'returned'].includes(order.order_status)) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: `Order is ${order.order_status} and cannot be delivered` });
      }
      if (order.order_status === 'delivered') {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Order is already delivered' });
      }
      if (Number(order.assigned_branch_id || 0) !== fromId) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Order is not assigned to the selected from-branch' });
      }
      if (!order.branch_accepted_at) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Branch must accept this assignment before delivery processing' });
      }

      const [existing] = await connection.query('SELECT id FROM deliveries WHERE order_id = ? LIMIT 1', [order.id]);
      if (existing.length > 0) {
        await connection.rollback();
        return res.status(409).json({ success: false, message: 'Delivery is already assigned for this order' });
      }

      let finalVehiclePlate = vehiclePlate ? String(vehiclePlate).trim() : null;

      if (finalVehiclePlate) {
        const [vehicleRows] = await connection.query(
          `SELECT id, plate_number, is_active
           FROM vehicles
           WHERE plate_number = ?
           LIMIT 1`,
          [finalVehiclePlate]
        );
        if (vehicleRows.length === 0 || Number(vehicleRows[0].is_active) !== 1) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: 'Selected vehicle is not active or does not exist' });
        }
      } else {
        let autoVehicle = null;

        if (order.route_id) {
          const byRouteVehicles = await getVehiclesByRoute(order.route_id);
          if (byRouteVehicles.length > 0) {
            autoVehicle = byRouteVehicles[0];
          }
        }

        if (!autoVehicle) {
          const [fallbackVehicles] = await connection.query(
            `SELECT id, plate_number
             FROM vehicles
             WHERE is_active = 1
               AND (
                 branch_id = ?
                 OR (route_from_branch_id = ? AND route_to_branch_id = ?)
               )
             ORDER BY id ASC
             LIMIT 1`,
            [fromId, fromId, toId]
          );
          autoVehicle = fallbackVehicles[0] || null;
        }

        if (!autoVehicle) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: 'No active vehicle available for this route' });
        }

        finalVehiclePlate = autoVehicle.plate_number;
      }

      const routeCharge = await getRouteCharge(fromId, toId, deliveryType, pricing.defaultRouteCharges);

      if (requiresDriver && driverUserId === null && (!finalDriverName || !finalDriverPhone)) {
        const locationHint = String(order.to_location || destinationAddress || order.shipping_city || '').trim();
        let autoDriver = null;

        const rankedDrivers = await getAvailableDeliveryBoysByLocation(locationHint);
        if (rankedDrivers.length > 0) {
          autoDriver = rankedDrivers[0];
        }

        if (!autoDriver) {
          const [branchDrivers] = await connection.query(
            `SELECT id, username, phone
             FROM users
             WHERE role = 'delivery_boy'
               AND status = 'active'
               AND (is_approved IS NULL OR is_approved = 1)
               AND delivery_is_available = 1
               AND (assigned_branch_id = ? OR assigned_branch_id IS NULL)
             ORDER BY id ASC
             LIMIT 1`,
            [fromId]
          );
          autoDriver = branchDrivers[0] || null;
        }

        if (!autoDriver) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: 'No available delivery boy found for assignment' });
        }

        finalDriverUserId = autoDriver.id;
        finalDriverName = autoDriver.username;
        finalDriverPhone = autoDriver.phone;
      }

      if (requiresDriver && (!finalDriverName || !finalDriverPhone)) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Delivery boy name and phone (or deliveryBoyUserId) are required' });
      }

      if (!requiresDriver) {
        finalDriverName = finalDriverName || '';
        finalDriverPhone = finalDriverPhone || '';
      }

      const [[fromBranchRow]] = await connection.query(
        'SELECT name FROM branches WHERE id = ? LIMIT 1',
        [fromId]
      );
      const [[toBranchRow]] = await connection.query(
        'SELECT name FROM branches WHERE id = ? LIMIT 1',
        [toId]
      );

      const fromBranchName = fromBranchRow?.name || `Branch ${fromId}`;
      const toBranchName = toBranchRow?.name || `Branch ${toId}`;
      const initialDeliveryStatus = requiresDriver ? 'assigned' : 'in_transit';

      const costWeight = Number((roundedWeight * pricing.pricePerKg).toFixed(2));
      const costSize = Number((feet * pricing.pricePerFoot).toFixed(2));
      const costRoute = Number((routeCharge).toFixed(2));
      const totalCost = Number((costWeight + costSize + costRoute + packagingCost).toFixed(2));

      const [deliveryResult] = await connection.query(
        `INSERT INTO deliveries
          (order_id, order_number, from_branch_id, to_branch_id, delivery_type,
           destination_address, weight_kg, size_feet, packaging_category, packaging_cost,
           price_per_kg, price_per_foot,
           cost_weight, cost_size, cost_route, total_cost,
           delivery_boy_name, delivery_boy_phone, vehicle_plate,
           delivery_boy_user_id,
           assigned_by_user_id, seller_paid_cash, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          order.id,
          order.order_number,
          fromId,
          toId,
          deliveryType,
          destinationAddress || null,
          roundedWeight,
          feet,
          pkgCat,
          packagingCost,
          pricing.pricePerKg,
          pricing.pricePerFoot,
          costWeight,
          costSize,
          costRoute,
          totalCost,
          finalDriverName,
          finalDriverPhone,
          finalVehiclePlate,
          finalDriverUserId,
          req.user.id,
          initialDeliveryStatus
        ]
      );

      if (finalDriverUserId) {
        await updateDeliveryBoyAvailability(
          finalDriverUserId,
          false,
          order.from_location || null,
          connection
        );
      }

      await connection.query(
        `UPDATE orders
         SET order_status = 'shipped'
         WHERE id = ? AND order_status != 'delivered'`,
        [order.id]
      );

      await appendTrackingEvent({
        orderId: order.id,
        status: TRACKING_STATUSES.PICKED_UP,
        location: order.from_location || fromBranchName,
        updatedBy: req.user.id,
        connection
      });

      if (requiresDriver) {
        const area = String(order.shipping_city || order.to_location || '').trim();
        const outForDeliveryLocation = `${finalDriverName} (${finalDriverPhone})${area ? ` - ${area}` : ''}`;
        await appendTrackingEvent({
          orderId: order.id,
          status: TRACKING_STATUSES.OUT_FOR_DELIVERY,
          location: outForDeliveryLocation,
          updatedBy: req.user.id,
          connection
        });
      } else {
        await appendTrackingEvent({
          orderId: order.id,
          status: TRACKING_STATUSES.IN_TRANSIT,
          location: `In Shipment: ${fromBranchName} -> ${toBranchName}`,
          updatedBy: req.user.id,
          connection
        });
      }

      // Notify customer
      await connection.query(
        `INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type)
         VALUES (?, 'order_shipped', 'Order Shipped', ?, ?, 'order')`,
        [
          order.user_id,
          requiresDriver
            ? `Your order #${order.order_number} is out for delivery. Rider: ${finalDriverName} (${finalDriverPhone}), Vehicle: ${finalVehiclePlate}.`
            : `Your order #${order.order_number} is in shipment: ${fromBranchName} -> ${toBranchName}.`,
          order.id
        ]
      );

      // Notify all companies involved in this order (seller dashboards)
      const [companyRows] = await connection.query(
        'SELECT DISTINCT company_id FROM order_items WHERE order_id = ?',
        [order.id]
      );

      for (const row of companyRows) {
        await connection.query(
          `INSERT INTO company_notifications (company_id, type, title, message, reference_id, reference_type)
           VALUES (?, 'system', 'Delivery Assigned', ?, ?, 'order')`,
          [
            row.company_id,
            `Order #${order.order_number} is now in delivery (on the way). Delivery: ${finalDriverName} (${finalDriverPhone}), Vehicle: ${finalVehiclePlate}.`,
            order.id
          ]
        );
      }

      await connection.commit();

      emitToUser(order.user_id, 'order:status:changed', {
        orderNumber: order.order_number,
        status: requiresDriver ? 'out_for_delivery' : 'in_shipment',
        deliveryType,
        fromBranchId: fromId,
        toBranchId: toId
      });
      emitToOrder(order.order_number, 'order:tracking:changed', {
        orderNumber: order.order_number,
        source: 'assign_delivery'
      });
      emitToBranch(fromId, 'delivery:queue:changed', {
        orderNumber: order.order_number,
        reason: 'assigned_from_branch'
      });
      emitToBranch(toId, 'delivery:queue:changed', {
        orderNumber: order.order_number,
        reason: 'assigned_to_branch'
      });
      for (const row of companyRows) {
        emitToCompany(row.company_id, 'company:dashboard:refresh', {
          companyId: row.company_id,
          orderNumber: order.order_number,
          reason: 'delivery_assigned'
        });
      }

      const deliveryId = deliveryResult.insertId;
      const [deliveryRows] = await pool.query(
        `SELECT d.*, fb.name as from_branch_name, tb.name as to_branch_name
         FROM deliveries d
         JOIN branches fb ON fb.id = d.from_branch_id
         JOIN branches tb ON tb.id = d.to_branch_id
         WHERE d.id = ?
         LIMIT 1`,
        [deliveryId]
      );

      res.status(201).json({
        success: true,
        message: 'Delivery assigned successfully',
        data: deliveryRows[0]
      });
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // ignore
      }
      console.error('Assign delivery error:', error);
      res.status(500).json({ success: false, message: 'Failed to assign delivery' });
    } finally {
      connection.release();
    }
  },

  updateTrackingStatus: async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const { orderNumber, status, location } = req.body;
      const role = req.user?.role;
      const userId = req.user?.id;
      const userPhone = req.user?.phone;

      if (!orderNumber) return res.status(400).json({ success: false, message: 'orderNumber is required' });
      if (!status || !isValidTrackingStatus(status)) {
        return res.status(400).json({ success: false, message: 'Invalid tracking status' });
      }

      await connection.beginTransaction();

      const [orderRows] = await connection.query(
        'SELECT id, order_number, current_status, user_id FROM orders WHERE order_number = ? LIMIT 1',
        [orderNumber]
      );
      if (orderRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      const order = orderRows[0];
      const [deliveryRows] = await connection.query(
        `SELECT id, status, delivery_boy_user_id, delivery_boy_phone, destination_address
         FROM deliveries
         WHERE order_id = ?
         LIMIT 1`,
        [order.id]
      );

      if (role === 'delivery_boy') {
        if (deliveryRows.length === 0) {
          await connection.rollback();
          return res.status(403).json({ success: false, message: 'No delivery assignment found for this order' });
        }

        const delivery = deliveryRows[0];
        const belongsToDriver = Number(delivery.delivery_boy_user_id) === Number(userId)
          || (!delivery.delivery_boy_user_id && delivery.delivery_boy_phone === (userPhone || ''));
        if (!belongsToDriver) {
          await connection.rollback();
          return res.status(403).json({ success: false, message: 'Not authorized to update this order tracking' });
        }
      }

      const timeline = await getTrackingTimeline(order.id);
      const lastStatus = timeline.length > 0 ? timeline[timeline.length - 1].status : order.current_status;
      if (lastStatus && statusRank(status) < statusRank(lastStatus)) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Tracking status cannot move backwards' });
      }

      await appendTrackingEvent({
        orderId: order.id,
        status,
        location: location || null,
        updatedBy: userId,
        connection
      });

      if (status === TRACKING_STATUSES.DELIVERED) {
        await connection.query(
          `UPDATE orders SET order_status = 'delivered', delivered_at = NOW() WHERE id = ?`,
          [order.id]
        );
        if (deliveryRows.length > 0) {
          await connection.query(
            `UPDATE deliveries SET status = 'delivered', delivered_at = COALESCE(delivered_at, NOW()) WHERE id = ?`,
            [deliveryRows[0].id]
          );

          if (deliveryRows[0].delivery_boy_user_id) {
            await updateDeliveryBoyAvailability(
              deliveryRows[0].delivery_boy_user_id,
              true,
              deliveryRows[0].destination_address || null,
              connection
            );
          }
        }
      } else {
        await connection.query(
          `UPDATE orders SET order_status = 'shipped' WHERE id = ? AND order_status != 'delivered'`,
          [order.id]
        );
        if (deliveryRows.length > 0 && ['assigned', 'in_transit'].includes(deliveryRows[0].status)) {
          await connection.query(
            `UPDATE deliveries SET status = 'in_transit' WHERE id = ?`,
            [deliveryRows[0].id]
          );
        }
      }

      await connection.commit();

      const [companyRows] = await pool.query(
        'SELECT DISTINCT company_id FROM order_items WHERE order_id = ?',
        [order.id]
      );

      emitToUser(order.user_id, 'order:status:changed', {
        orderNumber: order.order_number,
        status,
        source: 'tracking_update'
      });
      emitToOrder(order.order_number, 'order:tracking:changed', {
        orderNumber: order.order_number,
        status,
        source: 'tracking_update'
      });
      for (const row of companyRows) {
        emitToCompany(row.company_id, 'company:dashboard:refresh', {
          companyId: row.company_id,
          orderNumber: order.order_number,
          reason: 'tracking_update',
          status
        });
      }

      const updatedTimeline = await getTrackingTimeline(order.id);
      res.json({
        success: true,
        message: 'Tracking status updated successfully',
        data: {
          orderNumber: order.order_number,
          currentStatus: status,
          timeline: updatedTimeline
        }
      });
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // ignore
      }
      console.error('Update tracking status error:', error);
      res.status(500).json({ success: false, message: 'Failed to update tracking status' });
    } finally {
      connection.release();
    }
  },

  getTrackingTimeline: async (req, res) => {
    try {
      const orderNumber = req.params.orderNumber || req.query.orderNumber;
      if (!orderNumber) {
        return res.status(400).json({ success: false, message: 'orderNumber is required' });
      }

      const [orderRows] = await pool.query(
        'SELECT id, order_number, current_status FROM orders WHERE order_number = ? LIMIT 1',
        [orderNumber]
      );
      if (orderRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      const order = orderRows[0];
      const timeline = await getTrackingTimeline(order.id);
      res.json({
        success: true,
        data: {
          orderNumber: order.order_number,
          currentStatus: order.current_status,
          timeline
        }
      });
    } catch (error) {
      console.error('Get tracking timeline error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch tracking timeline' });
    }
  },

  getDriverStats: async (req, res) => {
    try {
      const userId = req.user?.id;
      const userPhone = req.user?.phone;
      const { from_date, to_date } = req.query;
      if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });

      const baseWhere = `(delivery_boy_user_id = ? OR (delivery_boy_user_id IS NULL AND delivery_boy_phone = ?))`;
      const baseParams = [userId, userPhone || ''];
      let dateClause = '';
      const dateParams = [];
      if (from_date) { dateClause += ' AND DATE(assigned_at) >= ?'; dateParams.push(from_date); }
      if (to_date)   { dateClause += ' AND DATE(assigned_at) <= ?'; dateParams.push(to_date); }

      const [[{ total }]]    = await pool.query(`SELECT COUNT(*) as total FROM deliveries WHERE ${baseWhere}${dateClause}`, [...baseParams, ...dateParams]);
      const [[{ delivered }]]= await pool.query(`SELECT COUNT(*) as delivered FROM deliveries WHERE ${baseWhere} AND status='delivered'${dateClause}`, [...baseParams, ...dateParams]);
      const [[{ pending }]]  = await pool.query(`SELECT COUNT(*) as pending FROM deliveries WHERE ${baseWhere} AND status IN ('assigned','in_transit','out_for_delivery')${dateClause}`, [...baseParams, ...dateParams]);
      const [[{ rejected }]] = await pool.query(`SELECT COUNT(*) as rejected FROM deliveries WHERE ${baseWhere} AND status='rejected'${dateClause}`, [...baseParams, ...dateParams]);

      res.json({ success: true, data: { total, delivered, pending, rejected } });
    } catch (error) {
      console.error('Get driver stats error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch stats' });
    }
  },

  getDriverAllDeliveries: async (req, res) => {
    try {
      const userId = req.user?.id;
      const userPhone = req.user?.phone;
      const { status_filter, from_date, to_date } = req.query;
      if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });

      let statusClause = '';
      if (status_filter === 'delivered') statusClause = `AND d.status = 'delivered'`;
      else if (status_filter === 'rejected') statusClause = `AND d.status = 'rejected'`;
      else if (status_filter === 'pending') statusClause = `AND d.status IN ('assigned','in_transit','out_for_delivery')`;

      let dateClause = '';
      const dateParams = [];
      if (from_date) { dateClause += ' AND DATE(d.assigned_at) >= ?'; dateParams.push(from_date); }
      if (to_date)   { dateClause += ' AND DATE(d.assigned_at) <= ?'; dateParams.push(to_date); }

      const [rows] = await pool.query(
        `SELECT d.id, d.order_id, d.order_number, d.delivery_type, d.status, d.total_cost,
                d.delivery_boy_name, d.delivery_boy_phone, d.vehicle_plate,
                d.assigned_at, d.delivered_at, d.rejection_reason,
                d.proof_image_url, d.proof_notes, d.destination_address,
                fb.name as from_branch_name, tb.name as to_branch_name,
                o.shipping_address, o.shipping_city, o.shipping_country, o.shipping_zip,
                o.district, o.upazila, o.receiver_location, o.receiver_mobile,
                o.payment_method, o.total_amount, o.cod_advance_paid,
                cu.username as customer_name, cu.phone as customer_phone
         FROM deliveries d
         JOIN branches fb ON fb.id = d.from_branch_id
         JOIN branches tb ON tb.id = d.to_branch_id
         JOIN orders o ON o.id = d.order_id
         JOIN users cu ON cu.id = o.user_id
         WHERE (d.delivery_boy_user_id = ? OR (d.delivery_boy_user_id IS NULL AND d.delivery_boy_phone = ?))
         ${statusClause}${dateClause}
         ORDER BY COALESCE(d.delivered_at, d.assigned_at) DESC
         LIMIT 500`,
        [userId, userPhone || '', ...dateParams]
      );

      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('Get driver all deliveries error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch deliveries' });
    }
  },

  rejectDelivery: async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const { orderNumber, reason } = req.body;
      const userId = req.user?.id;
      const userPhone = req.user?.phone;

      if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });
      if (!orderNumber) return res.status(400).json({ success: false, message: 'orderNumber is required' });
      if (!reason || !reason.trim()) return res.status(400).json({ success: false, message: 'Rejection reason is required' });

      await connection.beginTransaction();

      const [deliveries] = await connection.query(
        `SELECT d.*, o.user_id
         FROM deliveries d
         JOIN orders o ON o.id = d.order_id
         WHERE d.order_number = ?
           AND (d.delivery_boy_user_id = ? OR (d.delivery_boy_user_id IS NULL AND d.delivery_boy_phone = ?))
         LIMIT 1`,
        [orderNumber, userId, userPhone || '']
      );

      if (deliveries.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Delivery assignment not found' });
      }

      const delivery = deliveries[0];
      if (!['assigned', 'in_transit', 'out_for_delivery'].includes(delivery.status)) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: `Cannot reject a delivery with status: ${delivery.status}` });
      }

      await connection.query(
        `UPDATE deliveries SET status = 'rejected', rejection_reason = ? WHERE id = ?`,
        [reason.trim(), delivery.id]
      );

      await appendTrackingEvent({
        orderId: delivery.order_id,
        status: TRACKING_STATUSES.AT_HUB,
        location: `Return Delivery: ${reason.trim()}`,
        updatedBy: userId,
        connection
      });

      if (delivery.delivery_boy_user_id) {
        await updateDeliveryBoyAvailability(
          delivery.delivery_boy_user_id,
          true,
          delivery.destination_address || null,
          connection
        );
      }

      await connection.query(
        `UPDATE orders SET order_status = 'returned' WHERE id = ? AND order_status IN ('processing', 'shipped')`,
        [delivery.order_id]
      );

      await connection.query(
        `INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type)
         VALUES (?, 'order_update', 'Delivery Issue', ?, ?, 'order')`,
        [
          delivery.user_id,
          `Delivery for order #${delivery.order_number} could not be completed. Reason: ${reason.trim()}. A new delivery will be arranged.`,
          delivery.order_id
        ]
      );

      await connection.commit();

      const [companyRows] = await pool.query(
        'SELECT DISTINCT company_id FROM order_items WHERE order_id = ?',
        [delivery.order_id]
      );

      emitToUser(delivery.user_id, 'order:status:changed', {
        orderNumber: delivery.order_number,
        status: 'returned',
        reason: reason.trim(),
        source: 'delivery_rejected'
      });
      emitToOrder(delivery.order_number, 'order:tracking:changed', {
        orderNumber: delivery.order_number,
        status: 'returned',
        reason: reason.trim(),
        source: 'delivery_rejected'
      });
      for (const row of companyRows) {
        emitToCompany(row.company_id, 'company:dashboard:refresh', {
          companyId: row.company_id,
          orderNumber: delivery.order_number,
          reason: 'delivery_rejected'
        });
      }

      res.json({ success: true, message: 'Delivery rejected successfully', data: { orderNumber } });
    } catch (error) {
      try { await connection.rollback(); } catch {}
      console.error('Reject delivery error:', error);
      res.status(500).json({ success: false, message: 'Failed to reject delivery' });
    } finally {
      connection.release();
    }
  },

  getDriverAssignments: async (req, res) => {
    try {
      const userId = req.user?.id;
      const userPhone = req.user?.phone;

      if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });

      const [rows] = await pool.query(
        `SELECT d.id, d.order_id, d.order_number, d.delivery_type, d.status, d.total_cost,
                d.delivery_boy_name, d.delivery_boy_phone, d.vehicle_plate,
                d.assigned_at, d.destination_address,
                fb.name as from_branch_name, tb.name as to_branch_name,
                o.shipping_address, o.shipping_city, o.shipping_country, o.shipping_zip,
                o.district, o.upazila, o.receiver_location, o.receiver_mobile,
                o.payment_method, o.total_amount, o.cod_advance_paid,
                cu.username as customer_name, cu.phone as customer_phone
         FROM deliveries d
         JOIN branches fb ON fb.id = d.from_branch_id
         JOIN branches tb ON tb.id = d.to_branch_id
         JOIN orders o ON o.id = d.order_id
         JOIN users cu ON cu.id = o.user_id
         WHERE (d.delivery_boy_user_id = ? OR (d.delivery_boy_user_id IS NULL AND d.delivery_boy_phone = ?))
           AND d.status IN ('assigned','in_transit','out_for_delivery')
         ORDER BY d.assigned_at DESC`,
        [userId, userPhone || '']
      );

      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('Get driver assignments error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch assignments' });
    }
  },

  getDriverHistory: async (req, res) => {
    try {
      const userId = req.user?.id;
      const userPhone = req.user?.phone;
      const { from_date, to_date } = req.query;
      if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });

      let dateClause = '';
      const dateParams = [];
      if (from_date) { dateClause += ' AND DATE(d.assigned_at) >= ?'; dateParams.push(from_date); }
      if (to_date)   { dateClause += ' AND DATE(d.assigned_at) <= ?'; dateParams.push(to_date); }

      const [rows] = await pool.query(
        `SELECT d.id, d.order_id, d.order_number, d.delivery_type, d.status, d.total_cost,
                d.delivery_boy_name, d.delivery_boy_phone, d.vehicle_plate,
                d.assigned_at, d.delivered_at, d.rejection_reason,
                d.proof_image_url, d.proof_notes,
                fb.name as from_branch_name, tb.name as to_branch_name,
                o.shipping_address, o.shipping_city, o.shipping_country, o.shipping_zip,
                o.district, o.upazila, o.receiver_location
         FROM deliveries d
         JOIN branches fb ON fb.id = d.from_branch_id
         JOIN branches tb ON tb.id = d.to_branch_id
         JOIN orders o ON o.id = d.order_id
         WHERE (d.delivery_boy_user_id = ? OR (d.delivery_boy_user_id IS NULL AND d.delivery_boy_phone = ?))
           AND d.status IN ('delivered', 'rejected')${dateClause}
         ORDER BY COALESCE(d.delivered_at, d.assigned_at) DESC
         LIMIT 500`,
        [userId, userPhone || '', ...dateParams]
      );

      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('Get driver history error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch delivery history' });
    }
  },

  completeDelivery: async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const { orderNumber, lat, lng, notes } = req.body;

      const userId = req.user?.id;
      const userPhone = req.user?.phone;

      if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });
      if (!orderNumber) return res.status(400).json({ success: false, message: 'orderNumber is required' });
      // GPS is optional – fall back to null if not provided or permission denied
      const latitude  = toNumber(lat);
      const longitude = toNumber(lng);

      await connection.beginTransaction();

      const [deliveries] = await connection.query(
        `SELECT d.*, o.user_id
         FROM deliveries d
         JOIN orders o ON o.id = d.order_id
         WHERE d.order_number = ?
           AND (d.delivery_boy_user_id = ? OR (d.delivery_boy_user_id IS NULL AND d.delivery_boy_phone = ?))
         LIMIT 1`,
        [orderNumber, userId, userPhone || '']
      );

      if (deliveries.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Delivery assignment not found' });
      }

      const delivery = deliveries[0];
      if (delivery.status === 'delivered') {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Delivery is already completed' });
      }

      const proofUrl = req.file ? req.file.path : null;

      await connection.query(
        `UPDATE deliveries
         SET status = 'delivered', proof_image_url = ?, proof_lat = ?, proof_lng = ?, proof_notes = ?, delivered_at = NOW()
         WHERE id = ?`,
        [proofUrl, latitude, longitude, notes || null, delivery.id]
      );

      await appendTrackingEvent({
        orderId: delivery.order_id,
        status: TRACKING_STATUSES.DELIVERED,
        location: delivery.destination_address || null,
        updatedBy: userId,
        connection
      });

      await connection.query(
        `UPDATE orders
         SET order_status = 'delivered', delivered_at = NOW()
         WHERE id = ?`,
        [delivery.order_id]
      );

      if (delivery.delivery_boy_user_id) {
        await updateDeliveryBoyAvailability(
          delivery.delivery_boy_user_id,
          true,
          delivery.destination_address || null,
          connection
        );
      }

      // Notify customer
      await connection.query(
        `INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type)
         VALUES (?, 'order_delivered', 'Order Received', ?, ?, 'order')`,
        [
          delivery.user_id,
          `Your order #${delivery.order_number} has been received. Delivered by ${delivery.delivery_boy_name} (${delivery.delivery_boy_phone}).`,
          delivery.order_id
        ]
      );

      // Notify sellers (company dashboards)
      const [companyRows] = await connection.query(
        'SELECT DISTINCT company_id FROM order_items WHERE order_id = ?',
        [delivery.order_id]
      );

      for (const row of companyRows) {
        await connection.query(
          `INSERT INTO company_notifications (company_id, type, title, message, reference_id, reference_type)
           VALUES (?, 'system', 'Order Completed', ?, ?, 'order')`,
          [
            row.company_id,
            `Order #${delivery.order_number} has been delivered and completed.`,
            delivery.order_id
          ]
        );
      }

      await connection.commit();

      emitToUser(delivery.user_id, 'order:status:changed', {
        orderNumber: delivery.order_number,
        status: 'delivered',
        source: 'delivery_completed'
      });
      emitToOrder(delivery.order_number, 'order:tracking:changed', {
        orderNumber: delivery.order_number,
        status: 'delivered',
        source: 'delivery_completed'
      });
      for (const row of companyRows) {
        emitToCompany(row.company_id, 'company:dashboard:refresh', {
          companyId: row.company_id,
          orderNumber: delivery.order_number,
          reason: 'delivery_completed'
        });
      }

      res.json({
        success: true,
        message: 'Delivery completed successfully',
        data: {
          proof_image_url: proofUrl,
          order_number: delivery.order_number
        }
      });
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // ignore
      }
      console.error('Complete delivery error:', error);
      res.status(500).json({ success: false, message: 'Failed to complete delivery' });
    } finally {
      connection.release();
    }
  },

  // ─── NEW: Get all delivery records for a branch (categorized) ───────────────
  getDeliveriesForBranch: async (req, res) => {
    try {
      const requestedBranchId = toInt(req.query.branchId);
      const branchId = getScopedBranchId(req, requestedBranchId);
      if (branchId === null) {
        return res.status(400).json({ success: false, message: 'Branch is not assigned for this account' });
      }

      const statusFilter = req.query.status || 'all';
      const search = req.query.search ? String(req.query.search).replace(/^#/, '').trim() : null;

      const params = [branchId];
      let statusClause = '';
      if (statusFilter === 'delivered')   statusClause = "AND d.status = 'delivered'";
      else if (statusFilter === 'active') statusClause = "AND d.status IN ('assigned','in_transit','out_for_delivery')";
      else if (statusFilter === 'rejected') statusClause = "AND d.status = 'rejected'";
      // 'all' = no filter (history: all terminal states)
      else if (statusFilter === 'all') statusClause = "AND d.status IN ('delivered','rejected')";

      let searchClause = '';
      if (search) { searchClause = 'AND d.order_number LIKE ?'; params.push(`%${search}%`); }

      const [rows] = await pool.query(
        `SELECT d.id, d.order_id, d.order_number, d.delivery_type, d.status,
                d.total_cost, d.weight_kg, d.size_feet, d.packaging_category,
                d.delivery_boy_name, d.delivery_boy_phone, d.vehicle_plate,
                d.delivery_boy_user_id, d.assigned_at, d.delivered_at,
                d.proof_image_url, d.rejection_reason, d.destination_address,
                d.from_branch_id, d.to_branch_id,
                fb.name as from_branch_name, tb.name as to_branch_name,
                o.shipping_address, o.shipping_city, o.shipping_country, o.shipping_zip,
                o.district, o.upazila, o.receiver_location, o.receiver_mobile,
                o.order_status, o.payment_method, o.payment_status,
                o.total_amount, o.cod_advance_paid,
                o.user_id as customer_user_id,
                u.username as customer_name, u.phone as customer_phone,
                o.current_status
         FROM deliveries d
         JOIN branches fb ON fb.id = d.from_branch_id
         JOIN branches tb ON tb.id = d.to_branch_id
         JOIN orders o ON o.id = d.order_id
         JOIN users u ON u.id = o.user_id
         WHERE d.from_branch_id = ?
         ${statusClause}
         ${searchClause}
         ORDER BY d.assigned_at DESC
         LIMIT 300`,
        params
      );

      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('Get deliveries for branch error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch deliveries' });
    }
  },

  // ─── NEW: Reassign accepted order to a different branch ─────────────────────
  reassignOrderBranch: async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const orderNumber = String(req.params.orderNumber || '').trim();
      const newBranchId = toInt(req.body.branchId);

      if (!orderNumber) return res.status(400).json({ success: false, message: 'orderNumber is required' });
      if (!newBranchId) return res.status(400).json({ success: false, message: 'branchId is required' });

      const currentBranchId = getScopedBranchId(req);

      await connection.beginTransaction();

      const [orders] = await connection.query(
        `SELECT o.id, o.order_number, o.user_id, o.order_status, o.assigned_branch_id,
                b.name as assigned_branch_name
         FROM orders o
         LEFT JOIN branches b ON b.id = o.assigned_branch_id
         WHERE o.order_number = ?
         LIMIT 1`,
        [orderNumber]
      );

      if (orders.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      const order = orders[0];

      if (req.user?.role !== 'super_admin') {
        if (currentBranchId === null) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: 'Branch is not assigned for your account' });
        }
        if (Number(order.assigned_branch_id) !== Number(currentBranchId)) {
          await connection.rollback();
          return res.status(403).json({ success: false, message: 'Order is not assigned to your branch' });
        }
      }

      const [existingDelivery] = await connection.query(
        'SELECT id FROM deliveries WHERE order_id = ? LIMIT 1',
        [order.id]
      );
      if (existingDelivery.length > 0) {
        await connection.rollback();
        return res.status(409).json({ success: false, message: 'Delivery already in progress, cannot reassign branch' });
      }

      if (Number(newBranchId) === Number(order.assigned_branch_id)) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Order is already assigned to this branch' });
      }

      const [newBranchRows] = await connection.query(
        'SELECT id, name FROM branches WHERE id = ? AND is_active = 1 LIMIT 1',
        [newBranchId]
      );
      if (newBranchRows.length === 0) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Target branch not found or inactive' });
      }

      const newBranch = newBranchRows[0];

      await connection.query(
        `UPDATE orders
         SET previous_branch_id = assigned_branch_id,
             assigned_branch_id = ?,
             assigned_branch_at = NOW(),
             branch_accepted_at = NULL,
             branch_accepted_by_user_id = NULL
         WHERE id = ?`,
        [newBranchId, order.id]
      );

      await appendTrackingEvent({
        orderId: order.id,
        status: TRACKING_STATUSES.IN_TRANSIT,
        location: `Transferred to ${newBranch.name}`,
        updatedBy: req.user.id,
        connection
      });

      const [newBranchAdmins] = await connection.query(
        `SELECT id FROM users
         WHERE role IN ('delivery_admin', 'super_admin')
           AND status = 'active'
           AND (assigned_branch_id = ? OR role = 'super_admin')
         LIMIT 20`,
        [newBranchId]
      );

      for (const admin of newBranchAdmins) {
        await connection.query(
          `INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type)
           VALUES (?, 'order_update', 'New Branch Assignment', ?, ?, 'order')`,
          [
            admin.id,
            `Order #${order.order_number} has been transferred to ${newBranch.name} for processing.`,
            order.id
          ]
        );
      }

      await connection.query(
        `INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type)
         VALUES (?, 'order_update', 'Order Processing', ?, ?, 'order')`,
        [
          order.user_id,
          `Your order #${order.order_number} is being processed at ${newBranch.name}.`,
          order.id
        ]
      );

      await connection.commit();

      const fromBranchForEmit = currentBranchId ?? toInt(order.assigned_branch_id);
      if (fromBranchForEmit) {
        emitToBranch(fromBranchForEmit, 'delivery:queue:changed', {
          orderNumber: order.order_number,
          reason: 'reassigned_away'
        });
      }
      emitToBranch(newBranchId, 'delivery:assignment:new', {
        orderNumber: order.order_number,
        reason: 'branch_reassigned'
      });
      emitToUser(order.user_id, 'order:tracking:changed', {
        orderNumber: order.order_number,
        source: 'branch_reassigned'
      });
      emitToOrder(order.order_number, 'order:tracking:changed', {
        orderNumber: order.order_number,
        source: 'branch_reassigned'
      });

      res.json({ success: true, message: `Order reassigned to ${newBranch.name} successfully` });
    } catch (error) {
      try { await connection.rollback(); } catch {}
      console.error('Reassign order branch error:', error);
      res.status(500).json({ success: false, message: 'Failed to reassign order' });
    } finally {
      connection.release();
    }
  },

  // ─── Simple: Assign accepted order directly to a delivery boy ──────────────
  assignToDeliveryBoy: async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const orderNumber = String(req.params.orderNumber || '').trim();
      const deliveryBoyUserId = toInt(req.body.deliveryBoyUserId);

      if (!orderNumber) return res.status(400).json({ success: false, message: 'orderNumber is required' });
      if (!deliveryBoyUserId) return res.status(400).json({ success: false, message: 'deliveryBoyUserId is required' });

      const branchId = getScopedBranchId(req);
      if (branchId === null) return res.status(400).json({ success: false, message: 'Branch is not assigned for your account' });

      await connection.beginTransaction();

      const [orders] = await connection.query(
        `SELECT o.id, o.order_number, o.user_id, o.order_status, o.assigned_branch_id, o.branch_accepted_at,
                b.name as branch_name
         FROM orders o
         LEFT JOIN branches b ON b.id = o.assigned_branch_id
         WHERE o.order_number = ? LIMIT 1`,
        [orderNumber]
      );
      if (orders.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      const order = orders[0];
      const effectiveBranchId = req.user?.role === 'super_admin'
        ? (branchId ?? toInt(order.assigned_branch_id))
        : branchId;

      if (req.user?.role !== 'super_admin' && Number(order.assigned_branch_id) !== Number(effectiveBranchId)) {
        await connection.rollback();
        return res.status(403).json({ success: false, message: 'Order is not assigned to your branch' });
      }
      if (!order.branch_accepted_at) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Branch must accept this order before assigning to a delivery boy' });
      }

      const [existing] = await connection.query('SELECT id FROM deliveries WHERE order_id = ? LIMIT 1', [order.id]);
      if (existing.length > 0) {
        await connection.rollback();
        return res.status(409).json({ success: false, message: 'A delivery record already exists for this order' });
      }

      const [boys] = await connection.query(
        `SELECT id, username, phone, assigned_branch_id, status, is_approved
         FROM users WHERE id = ? AND role = 'delivery_boy' LIMIT 1`,
        [deliveryBoyUserId]
      );
      if (boys.length === 0) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Delivery boy not found' });
      }
      const boy = boys[0];
      if (boy.status !== 'active') {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Delivery boy is not active' });
      }
      if (Number(boy.is_approved) === 0) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Delivery boy is not approved yet' });
      }

      await connection.query(
        `INSERT INTO deliveries
          (order_id, order_number, from_branch_id, to_branch_id, delivery_type,
           weight_kg, size_feet, price_per_kg, price_per_foot,
           cost_weight, cost_size, cost_route, total_cost,
           delivery_boy_name, delivery_boy_phone, vehicle_plate,
           delivery_boy_user_id, assigned_by_user_id, seller_paid_cash, status)
         VALUES (?, ?, ?, ?, 'branch_to_branch_address', 0, 0, 0, 0, 0, 0, 0, 0, ?, ?, '', ?, ?, 1, 'assigned')`,
        [
          order.id, order.order_number,
          effectiveBranchId, effectiveBranchId,
          boy.username, boy.phone || '',
          boy.id, req.user.id
        ]
      );

      await connection.query(
        `UPDATE orders SET order_status = 'shipped' WHERE id = ? AND order_status != 'delivered'`,
        [order.id]
      );

      await appendTrackingEvent({
        orderId: order.id,
        status: TRACKING_STATUSES.OUT_FOR_DELIVERY,
        location: `Assigned to ${boy.username}${boy.phone ? ' (' + boy.phone + ')' : ''} — ${order.branch_name || `Branch ${effectiveBranchId}`}`,
        updatedBy: req.user.id,
        connection
      });

      await connection.query(
        `INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type)
         VALUES (?, 'order_shipped', 'Order Out for Delivery', ?, ?, 'order')`,
        [
          order.user_id,
          `Your order #${order.order_number} is out for delivery. Rider: ${boy.username} (${boy.phone || '-'}).`,
          order.id
        ]
      );

      await connection.query(
        `INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type)
         VALUES (?, 'system', 'New Delivery Assigned', ?, ?, 'order')`,
        [
          boy.id,
          `Order #${order.order_number} has been assigned to you for delivery.`,
          order.id
        ]
      );

      await connection.commit();

      emitToUser(order.user_id, 'order:status:changed', {
        orderNumber: order.order_number, status: 'out_for_delivery', source: 'assign_to_boy'
      });
      emitToOrder(order.order_number, 'order:tracking:changed', {
        orderNumber: order.order_number, source: 'assign_to_boy'
      });
      emitToBranch(effectiveBranchId, 'delivery:queue:changed', {
        orderNumber: order.order_number, reason: 'assigned_to_delivery_boy'
      });
      emitToUser(boy.id, 'delivery:new:assignment', {
        orderNumber: order.order_number, message: 'New delivery assigned to you'
      });

      res.status(201).json({
        success: true,
        message: `Delivery assigned to ${boy.username} successfully`,
        data: { orderNumber: order.order_number, deliveryBoy: { id: boy.id, name: boy.username, phone: boy.phone } }
      });
    } catch (error) {
      try { await connection.rollback(); } catch {}
      console.error('Assign to delivery boy error:', error);
      res.status(500).json({ success: false, message: 'Failed to assign to delivery boy' });
    } finally {
      connection.release();
    }
  },

  getDeliveryHistory: async (req, res) => {
    try {
      const { date, search } = req.query;
      if (!date) return res.status(400).json({ success: false, message: 'date is required (YYYY-MM-DD)' });

      let query = `SELECT d.*, fb.name as from_branch_name, tb.name as to_branch_name,
                o.shipping_address, o.shipping_city, o.shipping_country, o.shipping_zip
         FROM deliveries d
         JOIN branches fb ON fb.id = d.from_branch_id
         JOIN branches tb ON tb.id = d.to_branch_id
         JOIN orders o ON o.id = d.order_id
         WHERE DATE(d.assigned_at) = ?`;
      const params = [date];

      if (req.user?.role !== 'super_admin') {
        const branchId = toInt(req.user?.assigned_branch_id);
        if (branchId === null) {
          return res.status(400).json({ success: false, message: 'Branch is not assigned for this account' });
        }
        query += ` AND d.from_branch_id = ?`;
        params.push(branchId);
      }

      if (search && search.trim()) {
        const cleaned = search.trim().replace(/^#/, '');
        query += ` AND d.order_number LIKE ?`;
        params.push(`%${cleaned}%`);
      }

      query += ` ORDER BY d.assigned_at DESC`;

      const [rows] = await pool.query(query, params);

      res.json({ success: true, data: rows });
    } catch (error) {
      console.error('Get delivery history error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch delivery history' });
    }
  }
};

module.exports = deliveryController;
