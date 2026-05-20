const { pool } = require('../config/db');

function normalizeLocation(value) {
  return String(value || '').trim().toLowerCase();
}

function buildHubsMap(routeRows) {
  const byRoute = new Map();
  for (const row of routeRows) {
    if (!byRoute.has(row.id)) {
      byRoute.set(row.id, {
        id: row.id,
        from_location: row.from_location,
        to_location: row.to_location,
        is_active: Number(row.is_active) === 1,
        created_at: row.created_at,
        updated_at: row.updated_at,
        hubs: []
      });
    }

    if (row.hub_id) {
      byRoute.get(row.id).hubs.push({
        id: row.hub_id,
        name: row.hub_name,
        location: row.hub_location,
        branch_id: row.hub_branch_id || null,
        order: row.hub_order
      });
    }
  }

  return Array.from(byRoute.values());
}

async function listHubs(activeOnly = true) {
  const where = activeOnly ? 'WHERE is_active = 1' : '';
  const [rows] = await pool.query(
    `SELECT id, name, location, branch_id, is_active, created_at, updated_at
     FROM delivery_hubs
     ${where}
     ORDER BY name ASC, location ASC`
  );
  return rows;
}

async function getHubById(hubId) {
  const [rows] = await pool.query(
    `SELECT id, name, location, branch_id, is_active, created_at, updated_at
     FROM delivery_hubs
     WHERE id = ?
     LIMIT 1`,
    [hubId]
  );
  return rows[0] || null;
}

async function createHub({ name, location }) {
  const [result] = await pool.query(
    `INSERT INTO delivery_hubs (name, location, is_active)
     VALUES (?, ?, 1)`,
    [String(name || '').trim(), String(location || '').trim()]
  );

  return getHubById(result.insertId);
}

async function updateHub(hubId, { name, location, is_active }) {
  const updates = [];
  const params = [];

  if (name !== undefined) {
    updates.push('name = ?');
    params.push(String(name || '').trim());
  }
  if (location !== undefined) {
    updates.push('location = ?');
    params.push(String(location || '').trim());
  }
  if (is_active !== undefined) {
    updates.push('is_active = ?');
    params.push(is_active ? 1 : 0);
  }

  if (updates.length === 0) {
    return getHubById(hubId);
  }

  params.push(hubId);
  await pool.query(`UPDATE delivery_hubs SET ${updates.join(', ')} WHERE id = ?`, params);
  return getHubById(hubId);
}

async function listRoutesWithHubs(activeOnly = true) {
  const where = activeOnly ? 'WHERE dr.is_active = 1' : '';
  const [rows] = await pool.query(
    `SELECT dr.id, dr.from_location, dr.to_location, dr.is_active, dr.created_at, dr.updated_at,
            dh.id AS hub_id, dh.name AS hub_name, dh.location AS hub_location, dh.branch_id AS hub_branch_id, drh.hub_order
     FROM delivery_routes dr
     LEFT JOIN delivery_route_hubs drh ON drh.route_id = dr.id
     LEFT JOIN delivery_hubs dh ON dh.id = drh.hub_id
     ${where}
     ORDER BY dr.id ASC, drh.hub_order ASC`
  );

  return buildHubsMap(rows);
}

async function getRouteById(routeId) {
  const [rows] = await pool.query(
    `SELECT dr.id, dr.from_location, dr.to_location, dr.is_active, dr.created_at, dr.updated_at,
            dh.id AS hub_id, dh.name AS hub_name, dh.location AS hub_location, dh.branch_id AS hub_branch_id, drh.hub_order
     FROM delivery_routes dr
     LEFT JOIN delivery_route_hubs drh ON drh.route_id = dr.id
     LEFT JOIN delivery_hubs dh ON dh.id = drh.hub_id
     WHERE dr.id = ?
     ORDER BY drh.hub_order ASC`,
    [routeId]
  );

  const routes = buildHubsMap(rows);
  return routes[0] || null;
}

async function createRoute({ from_location, to_location, hub_ids = [], created_by = null }) {
  const fromLocation = String(from_location || '').trim();
  const toLocation = String(to_location || '').trim();

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [routeResult] = await connection.query(
      `INSERT INTO delivery_routes (from_location, to_location, is_active, created_by)
       VALUES (?, ?, 1, ?)`,
      [fromLocation, toLocation, created_by]
    );

    const routeId = routeResult.insertId;

    let order = 1;
    for (const hubId of hub_ids) {
      await connection.query(
        `INSERT INTO delivery_route_hubs (route_id, hub_id, hub_order)
         VALUES (?, ?, ?)`,
        [routeId, Number(hubId), order]
      );
      order += 1;
    }

    await connection.commit();
    return routeId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateRoute(routeId, { from_location, to_location, is_active, hub_ids }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const updates = [];
    const params = [];

    if (from_location !== undefined) {
      updates.push('from_location = ?');
      params.push(String(from_location || '').trim());
    }
    if (to_location !== undefined) {
      updates.push('to_location = ?');
      params.push(String(to_location || '').trim());
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(is_active ? 1 : 0);
    }

    if (updates.length > 0) {
      params.push(routeId);
      await connection.query(`UPDATE delivery_routes SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    if (Array.isArray(hub_ids)) {
      await connection.query('DELETE FROM delivery_route_hubs WHERE route_id = ?', [routeId]);
      let order = 1;
      for (const hubId of hub_ids) {
        await connection.query(
          `INSERT INTO delivery_route_hubs (route_id, hub_id, hub_order)
           VALUES (?, ?, ?)`,
          [routeId, Number(hubId), order]
        );
        order += 1;
      }
    }

    await connection.commit();
    return getRouteById(routeId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteRoute(routeId) {
  await pool.query('UPDATE delivery_routes SET is_active = 0 WHERE id = ?', [routeId]);
}

async function findBestMatchingRoute(fromLocation, toLocation) {
  const [exactRows] = await pool.query(
    `SELECT id, from_location, to_location
     FROM delivery_routes
     WHERE is_active = 1
       AND LOWER(TRIM(from_location)) = ?
       AND LOWER(TRIM(to_location)) = ?
     LIMIT 1`,
    [normalizeLocation(fromLocation), normalizeLocation(toLocation)]
  );

  if (exactRows.length > 0) {
    const route = await getRouteById(exactRows[0].id);
    return { match_type: 'exact', route };
  }

  const [fallbackRows] = await pool.query(
    `SELECT id, from_location, to_location, score
     FROM (
       SELECT id, from_location, to_location,
              (CASE WHEN LOWER(TRIM(from_location)) = ? THEN 1 ELSE 0 END +
               CASE WHEN LOWER(TRIM(to_location)) = ? THEN 1 ELSE 0 END) AS score
       FROM delivery_routes
       WHERE is_active = 1
     ) sub
     WHERE score > 0
     ORDER BY score DESC, id ASC
     LIMIT 1`,
    [normalizeLocation(fromLocation), normalizeLocation(toLocation)]
  );

  if (fallbackRows.length > 0) {
    const route = await getRouteById(fallbackRows[0].id);
    return { match_type: 'fallback', route };
  }

  return { match_type: 'none', route: null };
}

module.exports = {
  normalizeLocation,
  listHubs,
  getHubById,
  createHub,
  updateHub,
  listRoutesWithHubs,
  getRouteById,
  createRoute,
  updateRoute,
  deleteRoute,
  findBestMatchingRoute
};
