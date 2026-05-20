const { pool } = require('../config/db');

async function getVehiclesByRoute(routeId) {
  const [rows] = await pool.query(
    `SELECT id, plate_number, vehicle_type, branch_id, route_id, is_active,
            driver_name, driver_phone
     FROM vehicles
     WHERE is_active = 1 AND route_id = ?
     ORDER BY id ASC`,
    [routeId]
  );
  return rows;
}

async function getAvailableDeliveryBoysByLocation(locationLike) {
  const [rows] = await pool.query(
    `SELECT id, username, phone, assigned_branch_id, delivery_is_available,
            delivery_last_location, delivery_last_location_updated_at
     FROM users
     WHERE role = 'delivery_boy'
       AND status = 'active'
       AND (is_approved IS NULL OR is_approved = 1)
       AND delivery_is_available = 1
       AND (
         delivery_last_location IS NULL
         OR LOWER(TRIM(delivery_last_location)) LIKE LOWER(CONCAT('%', ?, '%'))
       )
     ORDER BY delivery_last_location_updated_at DESC, id ASC`,
    [String(locationLike || '').trim()]
  );

  return rows;
}

async function updateDeliveryBoyAvailability(userId, isAvailable, location = null, connection = null) {
  const db = connection || pool;
  await db.query(
    `UPDATE users
     SET delivery_is_available = ?,
         delivery_last_location = COALESCE(?, delivery_last_location),
         delivery_last_location_updated_at = NOW()
     WHERE id = ? AND role = 'delivery_boy'`,
    [isAvailable ? 1 : 0, location, userId]
  );
}

module.exports = {
  getVehiclesByRoute,
  getAvailableDeliveryBoysByLocation,
  updateDeliveryBoyAvailability
};
