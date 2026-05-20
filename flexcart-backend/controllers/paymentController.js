/**
 * SSLCommerz payment callback controller.
 *
 * Session-based flow:
 *  1. /api/orders creates a payment_sessions row and returns a gatewayUrl
 *  2. User pays on the SSLCommerz hosted page
 *  3. SSLCommerz POSTs to /success, /fail, /cancel, or /ipn
 *  4. success + IPN  → validate → finalizeOrderFromSession() creates the order
 *  5. fail / cancel  → mark session failed/cancelled — NO order is created
 *
 * These endpoints are called by SSLCommerz (no JWT auth).
 * Only server-side validated data is trusted; raw POST body amounts are never used.
 */
'use strict';
const { pool }                          = require('../config/db');
const { validatePayment, FRONTEND_URL } = require('../services/sslService');
const { finalizeOrderFromSession }      = require('../services/orderFinalizer');

// ── helpers ───────────────────────────────────────────────────────────────────

async function getSession(tranId) {
  const [[session]] = await pool.query(
    'SELECT * FROM payment_sessions WHERE tran_id = ? LIMIT 1',
    [tranId]
  );
  return session || null;
}

function markSessionFailed(tranId, status = 'failed') {
  pool.query(
    `UPDATE payment_sessions
       SET status = ?, updated_at = NOW()
     WHERE tran_id = ? AND status IN ('pending', 'completing')`,
    [status, tranId]
  ).catch(() => {});
}

function logFailedTransaction(tranId, status, rawBody) {
  pool.query(
    `INSERT INTO ssl_transactions
       (order_id, tran_id, val_id, amount, currency, status, raw_response)
     VALUES (NULL, ?, '', 0, 'BDT', ?, ?)
     ON CONFLICT (tran_id) DO UPDATE
       SET status = EXCLUDED.status, updated_at = NOW()`,
    [tranId, status, rawBody]
  ).catch(() => {});
}

// ── success callback ──────────────────────────────────────────────────────────

const paymentSuccess = async (req, res) => {
  const { tran_id, val_id, amount } = req.body;

  if (!tran_id || !val_id) {
    return res.redirect(`${FRONTEND_URL}/payment/fail?reason=invalid_callback`);
  }

  // Server-side validation — never trust POST body alone
  let validation = null;
  try { validation = await validatePayment(val_id); } catch (_) {}

  const session = await getSession(tran_id);

  // SSLCommerz returns 'VALID' on first validate, 'VALIDATED' on repeat calls —
  // both mean the payment is genuine. Use whichever amount field is present.
  const validationOk = validation &&
    (validation.status === 'VALID' || validation.status === 'VALIDATED') &&
    validation.tran_id === tran_id;

  const validationAmount = parseFloat(
    validation?.currency_amount ?? validation?.amount ?? 0
  );
  const sessionAmount = parseFloat(session?.amount ?? 0);

  const isValid =
    validationOk &&
    (sessionAmount === 0 || Math.abs(validationAmount - sessionAmount) < 1);

  if (!isValid) {
    if (tran_id) logFailedTransaction(tran_id, 'tampered', JSON.stringify(req.body));
    return res.redirect(`${FRONTEND_URL}/payment/fail?reason=validation_failed`);
  }

  if (!session) {
    return res.redirect(`${FRONTEND_URL}/payment/fail?reason=order_not_found`);
  }

  // Already finalised (IPN may have arrived first)
  if (session.status === 'completed') {
    const [[existing]] = await pool.query(
      'SELECT order_number FROM orders WHERE ssl_tran_id = ? LIMIT 1', [tran_id]
    );
    return res.redirect(
      `${FRONTEND_URL}/payment/success?order=${existing?.order_number || ''}`
    );
  }

  // Create the order
  try {
    const result = await finalizeOrderFromSession(session, val_id, JSON.stringify(req.body));

    if (!result) {
      return res.redirect(`${FRONTEND_URL}/payment/fail?reason=server_error`);
    }
    if (result.alreadyProcessed) {
      const [[existing]] = await pool.query(
        'SELECT order_number FROM orders WHERE ssl_tran_id = ? LIMIT 1', [tran_id]
      );
      return res.redirect(
        `${FRONTEND_URL}/payment/success?order=${existing?.order_number || ''}`
      );
    }
    return res.redirect(`${FRONTEND_URL}/payment/success?order=${result.orderNumber}`);
  } catch (finErr) {
    console.error('[Payment] finalization error:', finErr.message);
    const reason = String(finErr.message).startsWith('STOCK_UNAVAILABLE:')
      ? 'stock_unavailable'
      : 'server_error';
    return res.redirect(`${FRONTEND_URL}/payment/fail?reason=${reason}`);
  }
};

// ── fail callback ─────────────────────────────────────────────────────────────

const paymentFail = async (req, res) => {
  const { tran_id } = req.body;
  if (tran_id) {
    markSessionFailed(tran_id, 'failed');
    logFailedTransaction(tran_id, 'failed', JSON.stringify(req.body));
  }
  return res.redirect(`${FRONTEND_URL}/payment/fail?reason=payment_failed`);
};

// ── cancel callback ───────────────────────────────────────────────────────────

const paymentCancel = async (req, res) => {
  const { tran_id } = req.body;
  if (tran_id) {
    markSessionFailed(tran_id, 'cancelled');
    logFailedTransaction(tran_id, 'cancelled', JSON.stringify(req.body));
  }
  return res.redirect(`${FRONTEND_URL}/payment/fail?reason=cancelled`);
};

// ── IPN (server-to-server notification) ──────────────────────────────────────

const paymentIPN = async (req, res) => {
  res.status(200).json({ received: true }); // ACK immediately

  const { tran_id, val_id, status } = req.body;
  if (!tran_id || !val_id || status !== 'VALID') return;

  let validation = null;
  try { validation = await validatePayment(val_id); } catch (_) {}
  if (!validation || validation.status !== 'VALID' || validation.tran_id !== tran_id) return;

  const session = await getSession(tran_id);
  if (!session || session.status !== 'pending') return;

  await finalizeOrderFromSession(session, val_id, JSON.stringify(req.body))
    .catch(e => console.error('[IPN] finalization error:', e.message));
};

// ── status check (authenticated) ─────────────────────────────────────────────

const getPaymentStatus = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const userId = req.user.id;

    const [rows] = await pool.query(
      `SELECT o.id, o.order_number, o.payment_status, o.payment_method, o.total_amount,
              o.ssl_tran_id, o.ssl_val_id, o.created_at
       FROM orders o
       WHERE o.order_number = ? AND o.user_id = ?
       LIMIT 1`,
      [orderNumber, userId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    return res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Get payment status error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { paymentSuccess, paymentFail, paymentCancel, paymentIPN, getPaymentStatus };
