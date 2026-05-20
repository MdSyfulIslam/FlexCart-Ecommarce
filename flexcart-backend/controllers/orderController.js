const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { findBestMatchingRoute } = require('../services/deliveryRouteModel');
const { appendTrackingEvent, TRACKING_STATUSES } = require('../services/orderTrackingModel');
const { formatOrderDeliveryStatus } = require('../services/deliveryStatusFormatter');
const { isValidPhone } = require('../utils/validators');
const { initiatePayment: initiateSSL } = require('../services/sslService');

const DEFAULT_ORIGIN_LOCATION = 'Branch 1';

// Payment methods that route through the SSLCommerz hosted checkout
const SSL_GATEWAY_METHODS = ['sslcommerz', 'bkash', 'nagad', 'rocket', 'bank_card', 'bank_transfer'];

// Districts considered "inside Dhaka" zone (case-insensitive match)
const INSIDE_DHAKA_DISTRICTS = new Set(['dhaka']);

function isInsideDhaka(district) {
  return INSIDE_DHAKA_DISTRICTS.has(String(district || '').toLowerCase().trim());
}

async function getDeliverySettings(conn) {
  const db = conn || pool;
  const [rows] = await db.query(
    `SELECT setting_key, setting_value FROM platform_settings WHERE setting_key IN (
       'delivery_inside_dhaka','delivery_outside_dhaka','delivery_extra_per_item','commission_rate'
     )`
  );
  const map = {};
  rows.forEach(r => { map[r.setting_key] = parseFloat(r.setting_value) || 0; });
  return {
    inside_dhaka:     map.delivery_inside_dhaka    ?? 60,
    outside_dhaka:    map.delivery_outside_dhaka   ?? 120,
    extra_per_item:   map.delivery_extra_per_item  ?? 30,
    commission_rate:  map.commission_rate          ?? 5,
  };
}

function computeDeliveryCharge(district, totalQuantity, settings) {
  const base  = isInsideDhaka(district) ? settings.inside_dhaka : settings.outside_dhaka;
  const extra = Math.max(0, totalQuantity - 1) * settings.extra_per_item;
  return parseFloat((base + extra).toFixed(2));
}

async function getCommissionRateForCategory(categoryId, defaultRate, conn) {
  if (!categoryId) return defaultRate;
  // Always use pool (not the transaction connection) — a failed read must not abort the transaction
  const db = pool;
  try {
    const [[row]] = await db.query(
      'SELECT commission_rate FROM category_commissions WHERE category_id = ?',
      [categoryId]
    ).catch(() => [[null]]);
    return row ? parseFloat(row.commission_rate) : defaultRate;
  } catch {
    return defaultRate;
  }
}

async function recordRevenueHistory(conn, {
  orderId, orderNumber, productTotal, discountAmount,
  deliveryCharge, commissionRate, sourceType
}) {
  const commissionAmount = parseFloat(((productTotal - discountAmount) * commissionRate / 100).toFixed(2));
  await conn.query(
    `INSERT INTO revenue_history
       (order_id, order_number, sale_date, product_total, discount_amount, delivery_charge,
        commission_rate, commission_amount, delivery_revenue, source_type)
     VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
    [orderId, orderNumber, productTotal, discountAmount, deliveryCharge,
     commissionRate, commissionAmount, deliveryCharge, sourceType]
  );
}

function cleanLocation(value) {
  const text = String(value || '').trim();
  return text.length > 0 ? text : null;
}

async function resolveRouteForOrder({ connection, fromLocation, toLocation }) {
  const origin = cleanLocation(fromLocation);
  const destination = cleanLocation(toLocation);

  const [[routeStats]] = await connection.query(
    'SELECT COUNT(*) as active_routes FROM delivery_routes WHERE is_active = 1'
  );

  if (!origin || !destination) {
    if (Number(routeStats?.active_routes || 0) > 0) {
      throw new Error('from_location and to_location are required when delivery routes are configured');
    }

    return {
      routeId: null,
      matchType: 'none',
      hubs: [],
      fromLocation: origin,
      toLocation: destination
    };
  }

  if (Number(routeStats?.active_routes || 0) === 0) {
    return {
      routeId: null,
      matchType: 'none',
      hubs: [],
      fromLocation: origin,
      toLocation: destination
    };
  }

  const { match_type, route } = await findBestMatchingRoute(origin, destination);
  if (!route) {
    // No predefined route found — continue without route assignment (delivery admin can assign later)
    return {
      routeId: null,
      matchType: 'none',
      hubs: [],
      fromLocation: origin,
      toLocation: destination
    };
  }

  return {
    routeId: route.id,
    matchType: match_type,
    hubs: route.hubs || [],
    fromLocation: origin,
    toLocation: destination
  };
}

const orderController = {
  createOrder: async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const {
        payment_method,
        shipping_address,
        shipping_city,
        shipping_country,
        shipping_zip,
        promo_code,
        use_points,
        notes,
        from_location,
        to_location,
        receiver_mobile,
        district,
        upazila,
        receiver_location,
        selected_item_ids
      } = req.body;
      const userId = req.user.id;

      if (!receiver_mobile?.trim()) {
        return res.status(400).json({ success: false, message: 'Receiver mobile number is required' });
      }
      if (!isValidPhone(receiver_mobile)) {
        return res.status(400).json({ success: false, message: 'Receiver mobile must be a valid Bangladesh number (e.g. 01712345678)' });
      }
      if (!district?.trim()) {
        return res.status(400).json({ success: false, message: 'District is required' });
      }
      if (!upazila?.trim()) {
        return res.status(400).json({ success: false, message: 'Upazila is required' });
      }
      if (!receiver_location?.trim()) {
        return res.status(400).json({ success: false, message: 'Receiver location is required' });
      }

      const routeSelection = await resolveRouteForOrder({
        connection,
        fromLocation: from_location || DEFAULT_ORIGIN_LOCATION,
        toLocation: to_location || shipping_city || district
      }).catch(async (error) => {
        await connection.rollback();
        res.status(400).json({ success: false, message: error.message });
        return null;
      });

      if (!routeSelection) {
        return;
      }

      const [allCartItems] = await connection.query(
        `SELECT c.*, COALESCE(c.negotiated_price, p.current_price) as effective_price, p.current_price, p.name as product_name, p.stock_quantity, p.is_in_stock, p.company_id, p.category_id, p.points_reward, p.stars_reward, p.cod_advance_amount,
                comp.user_id as company_owner_id
         FROM cart c
         JOIN products p ON c.product_id = p.id
         JOIN companies comp ON p.company_id = comp.id
         WHERE c.user_id = ? AND p.status = 'active'`,
        [userId]
      );

      // Filter to selected items if specified, otherwise use all
      const selectedIds = Array.isArray(selected_item_ids) && selected_item_ids.length > 0
        ? new Set(selected_item_ids.map(Number))
        : null;
      const cartItems = selectedIds
        ? allCartItems.filter(item => selectedIds.has(item.id))
        : allCartItems;

      if (cartItems.length === 0) { await connection.rollback(); return res.status(400).json({ success: false, message: 'Cart is empty' }); }

      // Block self-purchase even if the client UI fails to prevent it
      for (const item of cartItems) {
        if (Number(item.company_owner_id) === Number(userId)) {
          await connection.rollback();
          return res.status(403).json({ success: false, message: 'You cannot buy your own product' });
        }
      }

      for (const item of cartItems) {
        if (!item.is_in_stock || item.stock_quantity < item.quantity) {
          await connection.rollback();
          return res.status(400).json({ success: false, message: `${item.product_name} is out of stock` });
        }
      }

      const deliverySettings = await getDeliverySettings(connection);
      const totalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);
      const deliveryCharge = computeDeliveryCharge(district, totalQuantity, deliverySettings);

      // Compute weighted average commission rate based on each item's product category
      let effectiveCommissionRate = deliverySettings.commission_rate;
      try {
        const totalValue = cartItems.reduce((s, i) => s + parseFloat(i.effective_price) * i.quantity, 0);
        if (totalValue > 0) {
          let weightedSum = 0;
          for (const item of cartItems) {
            const rate = await getCommissionRateForCategory(item.category_id, deliverySettings.commission_rate, connection);
            weightedSum += rate * parseFloat(item.effective_price) * item.quantity;
          }
          effectiveCommissionRate = parseFloat((weightedSum / totalValue).toFixed(4));
        }
      } catch { /* fallback to global rate */ }

      let productTotal = cartItems.reduce((sum, item) => sum + (parseFloat(item.effective_price) * item.quantity), 0);
      let totalAmount = productTotal;
      let discountAmount = 0;
      let pointsUsed = 0;
      let promoRef = null; // { id, table } — deferred for SSLCommerz payment sessions

      if (promo_code) {
        const codeUpper = promo_code.toUpperCase();
        // Check global promo codes first
        const [promos] = await connection.query(
          `SELECT *, 'global' as source FROM promo_codes WHERE UPPER(code) = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > NOW()) AND (max_uses IS NULL OR current_uses < max_uses)`, [codeUpper]
        );
        // Also check company promo codes
        const [companyPromos] = await connection.query(
          `SELECT *, 'company' as source FROM company_promo_codes WHERE UPPER(code) = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > NOW()) AND (max_uses IS NULL OR current_uses < max_uses)`, [codeUpper]
        );
        const promo = promos.length > 0 ? promos[0] : (companyPromos.length > 0 ? companyPromos[0] : null);
        if (promo && totalAmount >= parseFloat(promo.min_order_amount || 0)) {
          discountAmount = promo.discount_type === 'percentage' ? (totalAmount * promo.discount_value) / 100 : parseFloat(promo.discount_value);
          const table = promo.source === 'global' ? 'promo_codes' : 'company_promo_codes';
          promoRef = { id: promo.id, table };
          // For SSLCommerz: defer the usage increment until order finalization (after payment confirmed)
          if (payment_method !== 'sslcommerz') {
            await connection.query(`UPDATE ${table} SET current_uses = current_uses + 1 WHERE id = ?`, [promo.id]);
          }
        }
      }

      if (use_points && use_points > 0) {
        const [user] = await connection.query('SELECT points FROM users WHERE id = ?', [userId]);
        pointsUsed = Math.min(use_points, user[0].points, Math.floor(totalAmount * 100));
        discountAmount += pointsUsed / 100;
      }

      const finalAmount = parseFloat((Math.max(totalAmount - discountAmount, 0) + deliveryCharge).toFixed(2));
      const orderNumber = `FC-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;

      const codAdvancePaid = payment_method === 'cash_on_delivery'
        ? parseFloat(cartItems.reduce((sum, item) => {
            const adv = item.cod_advance_amount != null ? parseFloat(item.cod_advance_amount) : 0;
            return sum + adv * item.quantity;
          }, 0).toFixed(2))
        : null;

      const isSSLGateway   = SSL_GATEWAY_METHODS.includes(payment_method);
      const isCodAdvance   = payment_method === 'cash_on_delivery' && codAdvancePaid > 0;
      const isPendingPayment = payment_method === 'cash_on_delivery' || isSSLGateway;
      // needsSSL: only for COD advance — SSL gateway methods early-exit before this
      const needsSSL = isCodAdvance;
      const sslTranId = (isSSLGateway || isCodAdvance)
        ? `FLEX-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`
        : null;

      // ── SSLCommerz gateway: all online methods redirect to hosted checkout.
      //    Order is created ONLY after payment is confirmed by SSLCommerz. ───
      if (isSSLGateway) {
        await connection.rollback(); // no writes to undo — just closes the txn
        const sessionData = {
          sessionType: 'cart',
          userId,
          payment_method: payment_method, // preserve actual method for order record
          items: cartItems.map(item => ({
            product_id:    item.product_id,
            company_id:    item.company_id,
            quantity:      item.quantity,
            unit_price:    parseFloat(item.effective_price),
            product_name:  item.product_name,
            points_reward: item.points_reward || 0,
            stars_reward:  item.stars_reward  || 0,
          })),
          delivery: {
            charge:            deliveryCharge,
            district:          district.trim(),
            upazila:           upazila?.trim() || null,
            receiver_location: receiver_location.trim(),
            receiver_mobile:   receiver_mobile.trim(),
            from_location:     routeSelection.fromLocation,
            to_location:       routeSelection.toLocation,
            route_id:          routeSelection.routeId,
            route_match_type:  routeSelection.matchType,
            route_hubs:        routeSelection.hubs,
          },
          pricing: {
            product_total:   productTotal,
            discount_amount: discountAmount,
            points_used:     pointsUsed,
            promo_code:      promo_code || null,
            promo_ref:       promoRef,
            commission_rate: effectiveCommissionRate,
            final_amount:    finalAmount,
          },
          shipping: {
            address: shipping_address || null,
            city:    shipping_city    || null,
            country: shipping_country || null,
            zip:     shipping_zip     || null,
          },
          notes: notes || null,
        };
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
        try {
          await pool.query(
            `INSERT INTO payment_sessions (tran_id, user_id, session_type, session_data, amount, expires_at)
             VALUES (?, ?, 'cart', ?, ?, ?)`,
            [sslTranId, userId, JSON.stringify(sessionData), finalAmount, expiresAt.toISOString()]
          );
          const [userRows] = await pool.query(
            'SELECT username, email, phone FROM users WHERE id = ? LIMIT 1', [userId]
          );
          const userInfo = userRows[0] || {};
          const gatewayUrl = await initiateSSL({
            tranId:          sslTranId,
            totalAmount:     finalAmount,
            customerName:    userInfo.username || 'Customer',
            customerEmail:   userInfo.email    || 'customer@flexcart.com',
            customerPhone:   receiver_mobile?.trim() || userInfo.phone || '01700000000',
            shippingAddress: shipping_address || district || 'Dhaka',
            shippingCity:    shipping_city    || district || 'Dhaka',
            productName:     'FlexCart Order',
            preferredMethod: payment_method,
          });
          return res.status(200).json({
            success: true,
            message: 'Redirecting to payment gateway…',
            data: { gatewayUrl },
          });
        } catch (sslErr) {
          await pool.query('DELETE FROM payment_sessions WHERE tran_id = ?', [sslTranId]).catch(() => {});
          console.error('SSL session error (cart):', sslErr.message);
          return res.status(500).json({ success: false, message: 'Payment gateway initiation failed. Please try again.' });
        }
      }

      const [orderResult] = await connection.query(
        `INSERT INTO orders (user_id, order_number, total_amount, discount_amount, points_used, promo_code, payment_method, payment_status, shipping_address, shipping_city, shipping_country, shipping_zip, notes, from_location, to_location, route_id, current_status, receiver_mobile, district, upazila, receiver_location, delivery_charge, cod_advance_paid, ssl_tran_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          orderNumber,
          finalAmount,
          discountAmount,
          pointsUsed,
          promo_code || null,
          payment_method || 'bkash',
          isPendingPayment ? 'pending' : 'paid',
          shipping_address || null,
          shipping_city || null,
          shipping_country || null,
          shipping_zip || null,
          notes || null,
          routeSelection.fromLocation,
          routeSelection.toLocation,
          routeSelection.routeId,
          TRACKING_STATUSES.ORDER_PLACED,
          receiver_mobile.trim(),
          district.trim(),
          upazila?.trim() || null,
          receiver_location.trim(),
          deliveryCharge,
          codAdvancePaid,
          sslTranId,
        ]
      );

      const orderId = orderResult.insertId;
      await appendTrackingEvent({
        orderId,
        status: TRACKING_STATUSES.ORDER_PLACED,
        location: routeSelection.fromLocation,
        updatedBy: userId,
        connection
      });

      let totalPointsEarned = 0;
      let totalStarsEarned = 0;

      for (const item of cartItems) {
        const itemPrice = parseFloat(item.effective_price);
        const itemTotal = itemPrice * item.quantity;
        const pointsEarned = item.points_reward * item.quantity;
        const starsEarned = Math.min(parseFloat(((item.stars_reward || 0) * item.quantity).toFixed(2)), 99.99);

        await connection.query(
          `INSERT INTO order_items (order_id, product_id, company_id, quantity, unit_price, total_price, points_earned, stars_earned) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [orderId, item.product_id, item.company_id, item.quantity, itemPrice, itemTotal, pointsEarned, starsEarned]
        );

        await connection.query(
          `UPDATE products SET stock_quantity = stock_quantity - ?, total_sold = total_sold + ?, is_in_stock = CASE WHEN stock_quantity - ? <= 0 THEN 0 ELSE 1 END WHERE id = ?`,
          [item.quantity, item.quantity, item.quantity, item.product_id]
        );

        await connection.query('UPDATE companies SET total_sales = total_sales + ? WHERE id = ?', [item.quantity, item.company_id]);

        // Recompute badge after total_sales change
        const [companyBadgeData] = await connection.query(
          'SELECT total_sales, rating, follower_count FROM companies WHERE id = ?',
          [item.company_id]
        );
        if (companyBadgeData.length > 0) {
          const d = companyBadgeData[0];
          const score = (d.total_sales * 10) + (parseFloat(d.rating) * 200) + (d.follower_count * 5);
          const newBadge = score >= 5000 ? 'diamond' : score >= 3000 ? 'crown' : score >= 1500 ? 'gold' : score >= 500 ? 'silver' : 'bronze';
          await connection.query('UPDATE companies SET badge = ? WHERE id = ?', [newBadge, item.company_id]);
        }

        totalPointsEarned += pointsEarned;
        totalStarsEarned += starsEarned;
      }

      await connection.query(`UPDATE users SET points = GREATEST(0, points + ?), stars = LEAST(5, stars + ?) WHERE id = ?`, [totalPointsEarned - pointsUsed, Math.min(totalStarsEarned, 5), userId]);

      // Only remove purchased cart items (preserves unselected items)
      const purchasedCartIds = cartItems.map(item => item.id);
      if (purchasedCartIds.length > 0) {
        const placeholders = purchasedCartIds.map(() => '?').join(',');
        await connection.query(`DELETE FROM cart WHERE user_id = ? AND id IN (${placeholders})`, [userId, ...purchasedCartIds]);
      }
      await connection.query(`INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type) VALUES (?, 'order_confirmed', 'Order Confirmed!', ?, ?, 'order')`, [userId, `Your order #${orderNumber} has been confirmed. Total: ৳${finalAmount.toFixed(2)}`, orderId]);

      // Record detailed revenue history for Super Admin
      // Use SAVEPOINT so a failure here does not abort the main transaction
      try {
        await connection.query('SAVEPOINT sp_revenue');
        await recordRevenueHistory(connection, {
          orderId, orderNumber, productTotal, discountAmount,
          deliveryCharge, commissionRate: effectiveCommissionRate, sourceType: 'cart'
        });
        await connection.query('RELEASE SAVEPOINT sp_revenue');
      } catch (revenueErr) {
        await connection.query('ROLLBACK TO SAVEPOINT sp_revenue').catch(() => {});
        console.error('Revenue history record error (non-fatal):', revenueErr.message);
      }

      await connection.commit();

      // --- SSLCommerz: initiate payment after committing the order ---
      if (needsSSL) {
        // For COD+advance: charge only the advance; for sslcommerz: charge full order
        const sslAmount    = payment_method === 'cash_on_delivery' ? codAdvancePaid : finalAmount;
        const sslLabel     = payment_method === 'cash_on_delivery'
          ? `COD Advance - FlexCart #${orderNumber}`
          : `FlexCart Order #${orderNumber}`;
        try {
          const [userRows] = await pool.query(
            'SELECT username, email, phone FROM users WHERE id = ? LIMIT 1',
            [userId]
          );
          const user = userRows[0] || {};
          const gatewayUrl = await initiateSSL({
            tranId:          sslTranId,
            totalAmount:     sslAmount,
            customerName:    user.username || 'Customer',
            customerEmail:   user.email    || 'customer@flexcart.com',
            customerPhone:   receiver_mobile?.trim() || user.phone || '01700000000',
            shippingAddress: shipping_address || district || 'Dhaka',
            shippingCity:    shipping_city    || district || 'Dhaka',
            productName:     sslLabel,
          });
          return res.status(201).json({
            success: true,
            message: 'Order created. Redirecting to payment gateway…',
            data: {
              orderId,
              orderNumber,
              totalAmount: finalAmount,
              productTotal,
              deliveryCharge,
              discountAmount,
              pointsUsed,
              pointsEarned: totalPointsEarned,
              starsEarned: totalStarsEarned,
              paymentMethod: payment_method,
              codAdvancePaid: codAdvancePaid || 0,
              codDueOnDelivery: payment_method === 'cash_on_delivery'
                ? Math.max(0, finalAmount - (codAdvancePaid || 0))
                : 0,
              gatewayUrl,
              selectedRoute: {
                id: routeSelection.routeId,
                matchType: routeSelection.matchType,
                fromLocation: routeSelection.fromLocation,
                toLocation: routeSelection.toLocation,
                hubs: routeSelection.hubs
              }
            }
          });
        } catch (sslError) {
          console.error('SSLCommerz initiation error:', sslError.message);
          return res.status(201).json({
            success: true,
            message: 'Order created but payment gateway initiation failed. Please retry.',
            data: {
              orderId,
              orderNumber,
              totalAmount: finalAmount,
              paymentMethod: payment_method,
              paymentGatewayError: true,
            }
          });
        }
      }

      res.status(201).json({
        success: true,
        message: 'Order placed successfully',
        data: {
          orderId,
          orderNumber,
          totalAmount: finalAmount,
          productTotal,
          deliveryCharge,
          discountAmount,
          pointsUsed,
          pointsEarned: totalPointsEarned,
          starsEarned: totalStarsEarned,
          paymentMethod: payment_method,
          codAdvancePaid: codAdvancePaid || 0,
          selectedRoute: {
            id: routeSelection.routeId,
            matchType: routeSelection.matchType,
            fromLocation: routeSelection.fromLocation,
            toLocation: routeSelection.toLocation,
            hubs: routeSelection.hubs
          }
        }
      });
    } catch (error) {
      await connection.rollback();
      console.error('Create Order Error:', error.code, error.message, error.detail || '');
      res.status(500).json({ success: false, message: 'Server error creating order', debug: `${error.code || 'ERR'}: ${error.message}` });
    } finally {
      connection.release();
    }
  },

  buyNow: async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const {
        product_id,
        quantity = 1,
        payment_method,
        shipping_address,
        shipping_city,
        shipping_country,
        shipping_zip,
        notes,
        from_location,
        to_location,
        receiver_mobile,
        district,
        upazila,
        receiver_location
      } = req.body;
      const userId = req.user.id;
      const qty = parseInt(quantity, 10) || 1;

      if (!product_id) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'product_id is required' });
      }
      if (!receiver_mobile?.trim()) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Receiver mobile number is required' });
      }
      if (!isValidPhone(receiver_mobile)) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Receiver mobile must be a valid Bangladesh number (e.g. 01712345678)' });
      }
      if (!district?.trim()) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'District is required' });
      }
      if (!upazila?.trim()) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Upazila is required' });
      }
      if (!receiver_location?.trim()) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: 'Receiver location is required' });
      }

      const routeSelection = await resolveRouteForOrder({
        connection,
        fromLocation: from_location || DEFAULT_ORIGIN_LOCATION,
        toLocation: to_location || shipping_city || district
      }).catch(async (error) => {
        await connection.rollback();
        res.status(400).json({ success: false, message: error.message });
        return null;
      });

      if (!routeSelection) {
        return;
      }

      const [products] = await connection.query(
        `SELECT p.*, comp.user_id as company_owner_id
         FROM products p
         JOIN companies comp ON p.company_id = comp.id
         WHERE p.id = ? AND p.status = 'active'`,
        [product_id]
      );

      if (products.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Product not found' });
      }

      const product = products[0];

      if (Number(product.company_owner_id) === Number(userId)) {
        await connection.rollback();
        return res.status(403).json({ success: false, message: 'You cannot buy your own product' });
      }

      if (!product.is_in_stock || product.stock_quantity < qty) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: `Only ${product.stock_quantity} units available` });
      }

      const unitPrice = parseFloat(product.current_price);
      const subtotal = unitPrice * qty;

      // Compute delivery charge server-side from platform settings
      const deliverySettings = await getDeliverySettings(connection);
      const deliveryCharge = computeDeliveryCharge(district, qty, deliverySettings);

      // Get per-category commission rate for this product
      const buyNowCommissionRate = await getCommissionRateForCategory(
        product.category_id, deliverySettings.commission_rate, connection
      );

      const totalAmount = parseFloat((subtotal + deliveryCharge).toFixed(2));
      const orderNumber = `FC-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;
      const pointsEarned = (product.points_reward || 0) * qty;
      const starsEarned = Math.min(parseFloat(((product.stars_reward || 0) * qty).toFixed(2)), 99.99);

      const codAdvancePaid = payment_method === 'cash_on_delivery' && product.cod_advance_amount != null
        ? parseFloat((parseFloat(product.cod_advance_amount) * qty).toFixed(2))
        : null;

      const isPendingBuyNow = payment_method === 'cash_on_delivery' || payment_method === 'sslcommerz';
      const isSSLGatewayBuyNow = SSL_GATEWAY_METHODS.includes(payment_method);
      const isCodAdvanceBuyNow = payment_method === 'cash_on_delivery' && codAdvancePaid > 0;
      const needsSSLBuyNow = isCodAdvanceBuyNow; // SSL gateway methods early-exit before reaching this
      const sslTranIdBuyNow = (isSSLGatewayBuyNow || isCodAdvanceBuyNow)
        ? `FLEX-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`
        : null;

      // ── SSLCommerz gateway: all online methods redirect to hosted checkout ──
      if (isSSLGatewayBuyNow) {
        await connection.rollback();
        const sessionData = {
          sessionType: 'buy_now',
          userId,
          payment_method: payment_method, // preserve actual method for order record
          items: [{
            product_id:    product_id,
            company_id:    product.company_id,
            quantity:      qty,
            unit_price:    unitPrice,
            product_name:  product.name,
            points_reward: product.points_reward || 0,
            stars_reward:  product.stars_reward  || 0,
          }],
          delivery: {
            charge:            deliveryCharge,
            district:          district.trim(),
            upazila:           upazila?.trim() || null,
            receiver_location: receiver_location.trim(),
            receiver_mobile:   receiver_mobile.trim(),
            from_location:     routeSelection.fromLocation,
            to_location:       routeSelection.toLocation,
            route_id:          routeSelection.routeId,
            route_match_type:  routeSelection.matchType,
            route_hubs:        routeSelection.hubs,
          },
          pricing: {
            product_total:   subtotal,
            discount_amount: 0,
            points_used:     0,
            promo_code:      null,
            promo_ref:       null,
            commission_rate: buyNowCommissionRate,
            final_amount:    totalAmount,
          },
          shipping: {
            address: shipping_address || null,
            city:    shipping_city    || null,
            country: shipping_country || null,
            zip:     shipping_zip     || null,
          },
          notes: notes || null,
        };
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
        try {
          await pool.query(
            `INSERT INTO payment_sessions (tran_id, user_id, session_type, session_data, amount, expires_at)
             VALUES (?, ?, 'buy_now', ?, ?, ?)`,
            [sslTranIdBuyNow, userId, JSON.stringify(sessionData), totalAmount, expiresAt.toISOString()]
          );
          const [userRows] = await pool.query(
            'SELECT username, email, phone FROM users WHERE id = ? LIMIT 1', [userId]
          );
          const userInfo = userRows[0] || {};
          const gatewayUrl = await initiateSSL({
            tranId:          sslTranIdBuyNow,
            totalAmount:     totalAmount,
            customerName:    userInfo.username || 'Customer',
            customerEmail:   userInfo.email    || 'customer@flexcart.com',
            customerPhone:   receiver_mobile?.trim() || userInfo.phone || '01700000000',
            shippingAddress: shipping_address || district || 'Dhaka',
            shippingCity:    shipping_city    || district || 'Dhaka',
            productName:     product.name || 'FlexCart Product',
            preferredMethod: payment_method,
          });
          return res.status(200).json({
            success: true,
            message: 'Redirecting to payment gateway…',
            data: { gatewayUrl },
          });
        } catch (sslErr) {
          await pool.query('DELETE FROM payment_sessions WHERE tran_id = ?', [sslTranIdBuyNow]).catch(() => {});
          console.error('SSL session error (buy_now):', sslErr.message);
          return res.status(500).json({ success: false, message: 'Payment gateway initiation failed. Please try again.' });
        }
      }

      const [orderResult] = await connection.query(
        `INSERT INTO orders (user_id, order_number, total_amount, discount_amount, points_used, payment_method, payment_status, shipping_address, shipping_city, shipping_country, shipping_zip, notes, from_location, to_location, route_id, current_status, receiver_mobile, district, upazila, receiver_location, delivery_charge, cod_advance_paid, ssl_tran_id)
         VALUES (?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          orderNumber,
          totalAmount,
          payment_method || 'bkash',
          isPendingBuyNow ? 'pending' : 'paid',
          shipping_address || null,
          shipping_city || null,
          shipping_country || null,
          shipping_zip || null,
          notes || null,
          routeSelection.fromLocation,
          routeSelection.toLocation,
          routeSelection.routeId,
          TRACKING_STATUSES.ORDER_PLACED,
          receiver_mobile.trim(),
          district.trim(),
          upazila.trim(),
          receiver_location.trim(),
          deliveryCharge,
          codAdvancePaid,
          sslTranIdBuyNow,
        ]
      );

      const orderId = orderResult.insertId;
      await appendTrackingEvent({
        orderId,
        status: TRACKING_STATUSES.ORDER_PLACED,
        location: routeSelection.fromLocation,
        updatedBy: userId,
        connection
      });

      await connection.query(
        `INSERT INTO order_items (order_id, product_id, company_id, quantity, unit_price, total_price, points_earned, stars_earned)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, product_id, product.company_id, qty, unitPrice, subtotal, pointsEarned, starsEarned]
      );

      await connection.query(
        `UPDATE products SET stock_quantity = stock_quantity - ?, total_sold = total_sold + ?,
         is_in_stock = CASE WHEN stock_quantity - ? <= 0 THEN 0 ELSE 1 END WHERE id = ?`,
        [qty, qty, qty, product_id]
      );

      await connection.query('UPDATE companies SET total_sales = total_sales + ? WHERE id = ?', [qty, product.company_id]);

      const [companyData] = await connection.query(
        'SELECT total_sales, rating, follower_count FROM companies WHERE id = ?', [product.company_id]
      );
      if (companyData.length > 0) {
        const d = companyData[0];
        const score = (d.total_sales * 10) + (parseFloat(d.rating) * 200) + (d.follower_count * 5);
        const badge = score >= 5000 ? 'diamond' : score >= 3000 ? 'crown' : score >= 1500 ? 'gold' : score >= 500 ? 'silver' : 'bronze';
        await connection.query('UPDATE companies SET badge = ? WHERE id = ?', [badge, product.company_id]);
      }

      if (pointsEarned > 0 || starsEarned > 0) {
        await connection.query(
          `UPDATE users SET points = GREATEST(0, points + ?), stars = LEAST(5, stars + ?), earned_stars = earned_stars + ? WHERE id = ?`,
          [pointsEarned, starsEarned, starsEarned, userId]
        );
      }

      await connection.query(
        `INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type)
         VALUES (?, 'order_confirmed', 'Order Confirmed!', ?, ?, 'order')`,
        [userId, `Your order #${orderNumber} confirmed. Total: ৳${totalAmount.toFixed(2)}`, orderId]
      );

      // Record detailed revenue history
      // Use SAVEPOINT so a failure here does not abort the main transaction
      try {
        await connection.query('SAVEPOINT sp_revenue');
        await recordRevenueHistory(connection, {
          orderId, orderNumber, productTotal: subtotal, discountAmount: 0,
          deliveryCharge, commissionRate: buyNowCommissionRate, sourceType: 'buy_now'
        });
        await connection.query('RELEASE SAVEPOINT sp_revenue');
      } catch (revenueErr) {
        await connection.query('ROLLBACK TO SAVEPOINT sp_revenue').catch(() => {});
        console.error('Revenue history record error (non-fatal):', revenueErr.message);
      }

      await connection.commit();

      // --- SSLCommerz: initiate payment after committing the buy-now order ---
      if (needsSSLBuyNow) {
        const sslAmount = payment_method === 'cash_on_delivery' ? codAdvancePaid : totalAmount;
        const sslLabel  = payment_method === 'cash_on_delivery'
          ? `COD Advance - FlexCart #${orderNumber}`
          : `FlexCart Order #${orderNumber}`;
        try {
          const [userRows] = await pool.query(
            'SELECT username, email, phone FROM users WHERE id = ? LIMIT 1',
            [userId]
          );
          const user = userRows[0] || {};
          const gatewayUrl = await initiateSSL({
            tranId:          sslTranIdBuyNow,
            totalAmount:     sslAmount,
            customerName:    user.username || 'Customer',
            customerEmail:   user.email    || 'customer@flexcart.com',
            customerPhone:   receiver_mobile?.trim() || user.phone || '01700000000',
            shippingAddress: shipping_address || district || 'Dhaka',
            shippingCity:    shipping_city    || district || 'Dhaka',
            productName:     sslLabel,
          });
          return res.status(201).json({
            success: true,
            message: 'Order created. Redirecting to payment gateway…',
            data: {
              orderId, orderNumber, subtotal, deliveryCharge, totalAmount,
              pointsEarned, starsEarned,
              paymentMethod: payment_method,
              codAdvancePaid: codAdvancePaid || 0,
              codDueOnDelivery: payment_method === 'cash_on_delivery'
                ? Math.max(0, totalAmount - (codAdvancePaid || 0))
                : 0,
              gatewayUrl,
              selectedRoute: {
                id: routeSelection.routeId,
                matchType: routeSelection.matchType,
                fromLocation: routeSelection.fromLocation,
                toLocation: routeSelection.toLocation,
                hubs: routeSelection.hubs
              }
            }
          });
        } catch (sslError) {
          console.error('SSLCommerz (buyNow) initiation error:', sslError.message);
          return res.status(201).json({
            success: true,
            message: 'Order created but payment gateway initiation failed. Please retry.',
            data: { orderId, orderNumber, totalAmount, paymentMethod: payment_method, paymentGatewayError: true }
          });
        }
      }

      res.status(201).json({
        success: true,
        message: 'Order placed successfully',
        data: {
          orderId,
          orderNumber,
          subtotal,
          deliveryCharge,
          totalAmount,
          pointsEarned,
          starsEarned,
          paymentMethod: payment_method,
          codAdvancePaid: codAdvancePaid || 0,
          codDueOnDelivery: payment_method === 'cash_on_delivery' && codAdvancePaid
            ? Math.max(0, totalAmount - codAdvancePaid)
            : 0,
          selectedRoute: {
            id: routeSelection.routeId,
            matchType: routeSelection.matchType,
            fromLocation: routeSelection.fromLocation,
            toLocation: routeSelection.toLocation,
            hubs: routeSelection.hubs
          }
        }
      });
    } catch (error) {
      await connection.rollback();
      console.error('Buy Now Error:', error.code, error.message, error.detail || '');
      res.status(500).json({ success: false, message: 'Server error placing order', debug: `${error.code || 'ERR'}: ${error.message}` });
    } finally {
      connection.release();
    }
  },

  getDeliveryCharge: async (req, res) => {
    try {
      const { district = '', quantity = 1 } = req.query;
      const qty = Math.max(1, parseInt(quantity, 10) || 1);
      const settings = await getDeliverySettings(null);
      const charge = computeDeliveryCharge(district, qty, settings);
      const zone = isInsideDhaka(district) ? 'inside_dhaka' : 'outside_dhaka';
      const base = isInsideDhaka(district) ? settings.inside_dhaka : settings.outside_dhaka;
      const extra = parseFloat((Math.max(0, qty - 1) * settings.extra_per_item).toFixed(2));
      res.json({ success: true, data: { charge, base, extra, zone, quantity: qty, district } });
    } catch (error) {
      console.error('Get delivery charge error:', error);
      res.status(500).json({ success: false, message: 'Failed to calculate delivery charge' });
    }
  },

  validatePromo: async (req, res) => {
    try {
      const userId = req.user.id;
      const { promo_code } = req.body;

      if (!promo_code) {
        return res.json({ success: false, message: 'No code provided' });
      }

      const codeUpper = promo_code.toUpperCase();

      // Get current cart total
      const [cartItems] = await pool.query(
        `SELECT COALESCE(c.negotiated_price, p.current_price) as effective_price, c.quantity
         FROM cart c JOIN products p ON c.product_id = p.id
         WHERE c.user_id = ? AND p.status = 'active'`,
        [userId]
      );

      const cartTotal = cartItems.reduce((sum, item) => sum + (parseFloat(item.effective_price) * item.quantity), 0);

      // Check global promo codes
      const [promos] = await pool.query(
        `SELECT * FROM promo_codes WHERE UPPER(code) = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > NOW()) AND (max_uses IS NULL OR current_uses < max_uses)`,
        [codeUpper]
      );

      // Check company promo codes
      const [companyPromos] = await pool.query(
        `SELECT cpc.* FROM company_promo_codes cpc WHERE UPPER(cpc.code) = ? AND cpc.is_active = 1 AND (cpc.expires_at IS NULL OR cpc.expires_at > NOW()) AND (cpc.max_uses IS NULL OR cpc.current_uses < cpc.max_uses)`,
        [codeUpper]
      );

      const promo = promos.length > 0 ? promos[0] : (companyPromos.length > 0 ? companyPromos[0] : null);

      if (!promo) {
        return res.json({ success: false, message: 'Invalid or expired promo code' });
      }

      if (cartTotal < parseFloat(promo.min_order_amount || 0)) {
        return res.json({
          success: false,
          message: `Minimum order of ৳${parseFloat(promo.min_order_amount).toFixed(2)} required`
        });
      }

      const discount = promo.discount_type === 'percentage'
        ? (cartTotal * promo.discount_value) / 100
        : parseFloat(promo.discount_value);

      return res.json({
        success: true,
        discount: parseFloat(discount.toFixed(2)),
        discountType: promo.discount_type,
        discountValue: parseFloat(promo.discount_value),
        finalTotal: parseFloat(Math.max(cartTotal - discount, 0).toFixed(2))
      });
    } catch (error) {
      console.error('Validate Promo Error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  getOrderHistory: async (req, res) => {
    try {
      const { page = 1, limit = 10 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      const [countResult] = await pool.query('SELECT COUNT(*) as total FROM orders WHERE user_id = ?', [req.user.id]);
      const [orders] = await pool.query(
        `SELECT o.*, ab.name as assigned_branch_name, pb.name as previous_branch_name
         FROM orders o
         LEFT JOIN branches ab ON ab.id = o.assigned_branch_id
         LEFT JOIN branches pb ON pb.id = o.previous_branch_id
         WHERE o.user_id = ?
         ORDER BY o.created_at DESC
         LIMIT ? OFFSET ?`,
        [req.user.id, parseInt(limit), offset]
      );

      const deliveriesByOrderId = {};
      if (orders.length > 0) {
        const orderIds = orders.map(o => o.id);
        const placeholders = orderIds.map(() => '?').join(',');
        const [deliveries] = await pool.query(
          `SELECT d.*, fb.name as from_branch_name, tb.name as to_branch_name
           FROM deliveries d
           LEFT JOIN branches fb ON fb.id = d.from_branch_id
           LEFT JOIN branches tb ON tb.id = d.to_branch_id
           WHERE d.order_id IN (${placeholders})`,
          orderIds
        );
        for (const d of deliveries) deliveriesByOrderId[d.order_id] = d;
      }

      for (let order of orders) {
        const [items] = await pool.query(
          `SELECT oi.*, p.name as product_name, p.image_url, c.company_name FROM order_items oi JOIN products p ON oi.product_id = p.id JOIN companies c ON oi.company_id = c.id WHERE oi.order_id = ?`, [order.id]
        );
        order.items = items;
        order.delivery = deliveriesByOrderId[order.id] || null;
        order.delivery_status_text = formatOrderDeliveryStatus(order, order.delivery, 'customer');
      }

      res.json({ success: true, data: { orders, pagination: { page: parseInt(page), limit: parseInt(limit), total: countResult[0].total, totalPages: Math.ceil(countResult[0].total / parseInt(limit)) } } });
    } catch (error) {
      console.error('Get Order History Error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  getOrderById: async (req, res) => {
    try {
      const [orders] = await pool.query(
        `SELECT o.*, ab.name as assigned_branch_name, pb.name as previous_branch_name
         FROM orders o
         LEFT JOIN branches ab ON ab.id = o.assigned_branch_id
         LEFT JOIN branches pb ON pb.id = o.previous_branch_id
         WHERE o.id = ? AND o.user_id = ?`,
        [req.params.id, req.user.id]
      );
      if (orders.length === 0) return res.status(404).json({ success: false, message: 'Order not found' });

      const [items] = await pool.query(
        `SELECT oi.*, p.name as product_name, p.image_url, c.company_name, c.company_logo FROM order_items oi JOIN products p ON oi.product_id = p.id JOIN companies c ON oi.company_id = c.id WHERE oi.order_id = ?`, [orders[0].id]
      );

      const [deliveries] = await pool.query(
        `SELECT d.*, fb.name as from_branch_name, tb.name as to_branch_name
         FROM deliveries d
         LEFT JOIN branches fb ON fb.id = d.from_branch_id
         LEFT JOIN branches tb ON tb.id = d.to_branch_id
         WHERE d.order_id = ?
         LIMIT 1`,
        [orders[0].id]
      );

      const delivery = deliveries[0] || null;
      const orderWithStatus = {
        ...orders[0],
        delivery,
        delivery_status_text: formatOrderDeliveryStatus(orders[0], delivery, 'customer')
      };

      res.json({ success: true, data: { ...orderWithStatus, items } });
    } catch (error) {
      console.error('Get Order Error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
};

module.exports = orderController;