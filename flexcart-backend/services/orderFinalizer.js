/**
 * Finalize an order from a validated SSLCommerz payment session.
 * Called by the payment success/IPN callback after server-side validation.
 * Orders are ONLY created here — never before payment is confirmed.
 */
'use strict';
const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { appendTrackingEvent, TRACKING_STATUSES } = require('./orderTrackingModel');

/**
 * Idempotent order creation from a payment session.
 *
 * @param {object} session  - Row from payment_sessions
 * @param {string} valId    - SSLCommerz val_id from the validation API
 * @param {string} rawBody  - JSON.stringify of the raw SSL callback POST body
 * @returns {{ orderId, orderNumber, totalAmount, discountAmount, deliveryCharge,
 *             pointsEarned, starsEarned, paymentMethod, alreadyProcessed? }}
 */
async function finalizeOrderFromSession(session, valId, rawBody) {
  const data = JSON.parse(session.session_data);
  const {
    sessionType, userId, payment_method,
    items, delivery, pricing, shipping, notes,
  } = data;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // ── Idempotency lock ─────────────────────────────────────────────────────
    // Atomically claim the session by changing status from 'pending' →
    // 'completing'.  The RETURNING clause lets us detect if we won the race.
    const [claimedRows] = await connection.query(
      `UPDATE payment_sessions
         SET status = 'completing', updated_at = NOW()
       WHERE tran_id = ? AND status = 'pending'
       RETURNING id`,
      [session.tran_id]
    );

    if (!claimedRows || claimedRows.length === 0) {
      // Another callback already processed (or is processing) this session.
      await connection.rollback();
      const [[existingOrder]] = await pool.query(
        'SELECT id, order_number FROM orders WHERE ssl_tran_id = ? LIMIT 1',
        [session.tran_id]
      );
      return existingOrder
        ? { orderId: existingOrder.id, orderNumber: existingOrder.order_number, alreadyProcessed: true }
        : null;
    }

    // ── Stock re-validation (race-safe inside transaction) ───────────────────
    for (const item of items) {
      const [[product]] = await connection.query(
        'SELECT stock_quantity, is_in_stock FROM products WHERE id = ? LIMIT 1',
        [item.product_id]
      );
      if (!product || !product.is_in_stock || product.stock_quantity < item.quantity) {
        await connection.query(
          `UPDATE payment_sessions SET status = 'stock_failed', updated_at = NOW()
           WHERE tran_id = ?`,
          [session.tran_id]
        );
        await connection.rollback();
        throw new Error(`STOCK_UNAVAILABLE:${item.product_name || item.product_id}`);
      }
    }

    // ── Create the order (payment_status = 'paid' from the start) ────────────
    const orderNumber = `FC-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;
    const [orderResult] = await connection.query(
      `INSERT INTO orders
         (user_id, order_number, total_amount, discount_amount, points_used, promo_code,
          payment_method, payment_status, ssl_tran_id, ssl_val_id,
          shipping_address, shipping_city, shipping_country, shipping_zip,
          notes, from_location, to_location, route_id, current_status,
          receiver_mobile, district, upazila, receiver_location,
          delivery_charge, cod_advance_paid)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?,
               ?, ?, ?, ?,
               ?, ?, ?, ?, ?,
               ?, ?, ?, ?,
               ?, NULL)`,
      [
        userId,
        orderNumber,
        pricing.final_amount,
        pricing.discount_amount,
        pricing.points_used,
        pricing.promo_code || null,
        payment_method || 'sslcommerz',
        session.tran_id,
        valId,
        shipping.address || null,
        shipping.city    || null,
        shipping.country || null,
        shipping.zip     || null,
        notes || null,
        delivery.from_location,
        delivery.to_location,
        delivery.route_id,
        TRACKING_STATUSES.ORDER_PLACED,
        delivery.receiver_mobile,
        delivery.district,
        delivery.upazila,
        delivery.receiver_location,
        delivery.charge,
      ]
    );
    const orderId = orderResult.insertId;

    await appendTrackingEvent({
      orderId,
      status:    TRACKING_STATUSES.ORDER_PLACED,
      location:  delivery.from_location,
      updatedBy: userId,
      connection,
    });

    // ── Order items + stock deduction ────────────────────────────────────────
    let totalPointsEarned = 0;
    let totalStarsEarned  = 0;

    for (const item of items) {
      const itemTotal    = parseFloat(item.unit_price) * item.quantity;
      const pointsEarned = (item.points_reward || 0) * item.quantity;
      const starsEarned  = Math.min(
        parseFloat(((item.stars_reward || 0) * item.quantity).toFixed(2)), 99.99
      );

      await connection.query(
        `INSERT INTO order_items
           (order_id, product_id, company_id, quantity, unit_price, total_price, points_earned, stars_earned)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, item.product_id, item.company_id, item.quantity, item.unit_price, itemTotal, pointsEarned, starsEarned]
      );

      await connection.query(
        `UPDATE products
           SET stock_quantity = stock_quantity - ?,
               total_sold     = total_sold + ?,
               is_in_stock    = CASE WHEN stock_quantity - ? <= 0 THEN 0 ELSE 1 END
         WHERE id = ?`,
        [item.quantity, item.quantity, item.quantity, item.product_id]
      );

      await connection.query(
        'UPDATE companies SET total_sales = total_sales + ? WHERE id = ?',
        [item.quantity, item.company_id]
      );

      // Recompute company badge
      const [[companyData]] = await connection.query(
        'SELECT total_sales, rating, follower_count FROM companies WHERE id = ?',
        [item.company_id]
      );
      if (companyData) {
        const score = companyData.total_sales * 10
          + parseFloat(companyData.rating || 0) * 200
          + (companyData.follower_count || 0) * 5;
        const badge = score >= 5000 ? 'diamond'
          : score >= 3000 ? 'crown'
          : score >= 1500 ? 'gold'
          : score >= 500  ? 'silver' : 'bronze';
        await connection.query('UPDATE companies SET badge = ? WHERE id = ?', [badge, item.company_id]);
      }

      totalPointsEarned += pointsEarned;
      totalStarsEarned  += starsEarned;
    }

    // ── Promo code: increment usage (deferred from session creation) ─────────
    if (pricing.promo_ref && pricing.promo_ref.id) {
      // Validate table name defensively before interpolation
      const promoTable = pricing.promo_ref.table === 'company_promo_codes'
        ? 'company_promo_codes' : 'promo_codes';
      await connection.query(
        `UPDATE ${promoTable} SET current_uses = current_uses + 1 WHERE id = ?`,
        [pricing.promo_ref.id]
      ).catch(e => console.warn('[Finalizer] promo increment warn:', e.message));
    }

    // ── Points: deduct used, credit earned ───────────────────────────────────
    if (pricing.points_used > 0 || totalPointsEarned > 0 || totalStarsEarned > 0) {
      await connection.query(
        `UPDATE users
           SET points       = GREATEST(0, points - ? + ?),
               stars        = LEAST(5, stars + ?),
               earned_stars = earned_stars + ?
         WHERE id = ?`,
        [pricing.points_used, totalPointsEarned, totalStarsEarned, totalStarsEarned, userId]
      );
    }

    // ── Notification ─────────────────────────────────────────────────────────
    await connection.query(
      `INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type)
       VALUES (?, 'order_confirmed', 'Order Confirmed & Paid ✅', ?, ?, 'order')`,
      [
        userId,
        `Your order #${orderNumber} is confirmed. Payment received. Total: ৳${parseFloat(pricing.final_amount).toFixed(2)}`,
        orderId,
      ]
    );

    // ── Revenue history (non-fatal) ──────────────────────────────────────────
    try {
      await connection.query('SAVEPOINT sp_rev');
      const commissionAmount = parseFloat(
        ((pricing.product_total - pricing.discount_amount) * pricing.commission_rate / 100).toFixed(2)
      );
      await connection.query(
        `INSERT INTO revenue_history
           (order_id, order_number, sale_date, product_total, discount_amount,
            delivery_charge, commission_rate, commission_amount, delivery_revenue, source_type)
         VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
        [
          orderId, orderNumber,
          pricing.product_total, pricing.discount_amount,
          delivery.charge, pricing.commission_rate, commissionAmount,
          delivery.charge, sessionType === 'buy_now' ? 'buy_now' : 'cart',
        ]
      );
      await connection.query('RELEASE SAVEPOINT sp_rev');
    } catch (revErr) {
      await connection.query('ROLLBACK TO SAVEPOINT sp_rev').catch(() => {});
      console.error('[Finalizer] revenue history error (non-fatal):', revErr.message);
    }

    // ── SSL transaction audit log ─────────────────────────────────────────────
    await connection.query(
      `INSERT INTO ssl_transactions
         (order_id, tran_id, val_id, amount, currency, status, raw_response)
       VALUES (?, ?, ?, ?, 'BDT', 'success', ?)
       ON CONFLICT (tran_id) DO UPDATE
         SET order_id = EXCLUDED.order_id,
             val_id   = EXCLUDED.val_id,
             status   = 'success',
             updated_at = NOW()`,
      [orderId, session.tran_id, valId, session.amount, rawBody]
    );

    // ── Mark session completed ────────────────────────────────────────────────
    await connection.query(
      `UPDATE payment_sessions
         SET status = 'completed', order_id = ?, updated_at = NOW()
       WHERE tran_id = ?`,
      [orderId, session.tran_id]
    );

    await connection.commit();

    return {
      orderId,
      orderNumber,
      totalAmount:    pricing.final_amount,
      productTotal:   pricing.product_total,
      deliveryCharge: delivery.charge,
      discountAmount: pricing.discount_amount,
      pointsUsed:     pricing.points_used,
      pointsEarned:   totalPointsEarned,
      starsEarned:    totalStarsEarned,
      paymentMethod:  payment_method || 'sslcommerz',
    };
  } catch (err) {
    await connection.rollback().catch(() => {});
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = { finalizeOrderFromSession };
