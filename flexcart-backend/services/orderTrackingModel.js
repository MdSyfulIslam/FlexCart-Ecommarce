const { pool } = require('../config/db');

const TRACKING_STATUSES = {
  ORDER_PLACED: 'order_placed',
  PICKED_UP: 'picked_up',
  AT_HUB: 'at_hub',
  IN_TRANSIT: 'in_transit',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered'
};

const TRACKING_STATUS_ORDER = [
  TRACKING_STATUSES.ORDER_PLACED,
  TRACKING_STATUSES.PICKED_UP,
  TRACKING_STATUSES.AT_HUB,
  TRACKING_STATUSES.IN_TRANSIT,
  TRACKING_STATUSES.OUT_FOR_DELIVERY,
  TRACKING_STATUSES.DELIVERED
];

function isValidTrackingStatus(status) {
  return TRACKING_STATUS_ORDER.includes(status);
}

async function appendTrackingEvent({
  orderId,
  status,
  location = null,
  updatedBy = null,
  connection = null
}) {
  if (!isValidTrackingStatus(status)) {
    throw new Error('Invalid tracking status');
  }

  const db = connection || pool;

  const [result] = await db.query(
    `INSERT INTO order_tracking (order_id, location, status, updated_by)
     VALUES (?, ?, ?, ?)`,
    [orderId, location, status, updatedBy]
  );

  await db.query(
    'UPDATE orders SET current_status = ? WHERE id = ?',
    [status, orderId]
  );

  return result.insertId;
}

async function getTrackingTimeline(orderId) {
  const [rows] = await pool.query(
    `SELECT ot.id, ot.order_id, ot.location, ot.status, ot.updated_by, ot.event_timestamp,
            u.username AS updated_by_name, u.role AS updated_by_role
     FROM order_tracking ot
     LEFT JOIN users u ON u.id = ot.updated_by
     WHERE ot.order_id = ?
     ORDER BY ot.event_timestamp ASC, ot.id ASC`,
    [orderId]
  );

  return rows;
}

module.exports = {
  TRACKING_STATUSES,
  TRACKING_STATUS_ORDER,
  isValidTrackingStatus,
  appendTrackingEvent,
  getTrackingTimeline
};
