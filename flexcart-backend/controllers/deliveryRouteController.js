const { pool } = require('../config/db');
const {
  listHubs,
  getHubById,
  createHub,
  updateHub,
  listRoutesWithHubs,
  getRouteById,
  createRoute,
  updateRoute,
  deleteRoute
} = require('../services/deliveryRouteModel');

function parseIntSafe(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function normalizeHubIds(hubIds) {
  if (!Array.isArray(hubIds)) return [];
  return hubIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
}

async function validateHubIds(hubIds) {
  for (const hubId of hubIds) {
    const hub = await getHubById(hubId);
    if (!hub) {
      return { ok: false, hubId };
    }
  }
  return { ok: true };
}

const deliveryRouteController = {
  listHubs: async (req, res) => {
    try {
      const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
      const hubs = await listHubs(!includeInactive);
      res.json({ success: true, data: hubs });
    } catch (error) {
      console.error('List hubs error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch hubs' });
    }
  },

  createHub: async (req, res) => {
    try {
      const { name, location } = req.body;
      if (!String(name || '').trim() || !String(location || '').trim()) {
        return res.status(400).json({ success: false, message: 'name and location are required' });
      }

      const hub = await createHub({ name, location });
      res.status(201).json({ success: true, message: 'Hub created successfully', data: hub });
    } catch (error) {
      console.error('Create hub error:', error);
      res.status(500).json({ success: false, message: 'Failed to create hub' });
    }
  },

  updateHub: async (req, res) => {
    try {
      const hubId = parseIntSafe(req.params.id);
      if (!hubId) {
        return res.status(400).json({ success: false, message: 'Invalid hub id' });
      }

      const hub = await getHubById(hubId);
      if (!hub) {
        return res.status(404).json({ success: false, message: 'Hub not found' });
      }

      const updated = await updateHub(hubId, req.body || {});
      res.json({ success: true, message: 'Hub updated successfully', data: updated });
    } catch (error) {
      console.error('Update hub error:', error);
      res.status(500).json({ success: false, message: 'Failed to update hub' });
    }
  },

  listRoutes: async (req, res) => {
    try {
      const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
      const routes = await listRoutesWithHubs(!includeInactive);
      res.json({ success: true, data: routes });
    } catch (error) {
      console.error('List routes error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch routes' });
    }
  },

  createRoute: async (req, res) => {
    try {
      const { from_location, to_location, hub_ids } = req.body;
      if (!String(from_location || '').trim() || !String(to_location || '').trim()) {
        return res.status(400).json({ success: false, message: 'from_location and to_location are required' });
      }

      const normalizedHubIds = normalizeHubIds(hub_ids);
      const hubCheck = await validateHubIds(normalizedHubIds);
      if (!hubCheck.ok) {
        return res.status(400).json({ success: false, message: `Hub not found: ${hubCheck.hubId}` });
      }

      const routeId = await createRoute({
        from_location,
        to_location,
        hub_ids: normalizedHubIds,
        created_by: req.user?.id || null
      });

      const route = await getRouteById(routeId);
      res.status(201).json({ success: true, message: 'Route created successfully', data: route });
    } catch (error) {
      console.error('Create route error:', error);
      res.status(500).json({ success: false, message: 'Failed to create route' });
    }
  },

  updateRoute: async (req, res) => {
    try {
      const routeId = parseIntSafe(req.params.id);
      if (!routeId) {
        return res.status(400).json({ success: false, message: 'Invalid route id' });
      }

      const existing = await getRouteById(routeId);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Route not found' });
      }

      const payload = { ...req.body };
      if (payload.hub_ids !== undefined) {
        payload.hub_ids = normalizeHubIds(payload.hub_ids);
        const hubCheck = await validateHubIds(payload.hub_ids);
        if (!hubCheck.ok) {
          return res.status(400).json({ success: false, message: `Hub not found: ${hubCheck.hubId}` });
        }
      }

      const route = await updateRoute(routeId, payload);
      res.json({ success: true, message: 'Route updated successfully', data: route });
    } catch (error) {
      console.error('Update route error:', error);
      res.status(500).json({ success: false, message: 'Failed to update route' });
    }
  },

  deleteRoute: async (req, res) => {
    try {
      const routeId = parseIntSafe(req.params.id);
      if (!routeId) {
        return res.status(400).json({ success: false, message: 'Invalid route id' });
      }

      const existing = await getRouteById(routeId);
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Route not found' });
      }

      await deleteRoute(routeId);
      res.json({ success: true, message: 'Route deactivated successfully' });
    } catch (error) {
      console.error('Delete route error:', error);
      res.status(500).json({ success: false, message: 'Failed to delete route' });
    }
  },

  assignRouteToOrder: async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const { orderNumber, routeId } = req.body;
      const parsedRouteId = parseIntSafe(routeId);
      if (!String(orderNumber || '').trim() || !parsedRouteId) {
        return res.status(400).json({ success: false, message: 'orderNumber and routeId are required' });
      }

      const route = await getRouteById(parsedRouteId);
      if (!route || !route.is_active) {
        return res.status(404).json({ success: false, message: 'Active route not found' });
      }

      await connection.beginTransaction();

      const [orders] = await connection.query(
        'SELECT id, order_number, order_status FROM orders WHERE order_number = ? LIMIT 1',
        [String(orderNumber).trim()]
      );
      if (orders.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      const order = orders[0];
      if (['cancelled', 'returned', 'delivered'].includes(order.order_status)) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: `Cannot assign route to ${order.order_status} order` });
      }

      await connection.query(
        `UPDATE orders
         SET route_id = ?, from_location = ?, to_location = ?
         WHERE id = ?`,
        [route.id, route.from_location, route.to_location, order.id]
      );

      await connection.commit();

      res.json({
        success: true,
        message: 'Route assigned to order successfully',
        data: {
          orderNumber: order.order_number,
          route: {
            id: route.id,
            from_location: route.from_location,
            to_location: route.to_location,
            hubs: route.hubs || []
          }
        }
      });
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // ignore
      }
      console.error('Assign route to order error:', error);
      res.status(500).json({ success: false, message: 'Failed to assign route to order' });
    } finally {
      connection.release();
    }
  },

  assignVehicleToOrder: async (req, res) => {
    const connection = await pool.getConnection();
    try {
      const { orderNumber, vehiclePlate } = req.body;
      if (!String(orderNumber || '').trim() || !String(vehiclePlate || '').trim()) {
        return res.status(400).json({ success: false, message: 'orderNumber and vehiclePlate are required' });
      }

      await connection.beginTransaction();

      const [orders] = await connection.query(
        'SELECT id, order_number FROM orders WHERE order_number = ? LIMIT 1',
        [String(orderNumber).trim()]
      );
      if (orders.length === 0) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      const [vehicles] = await connection.query(
        'SELECT id, plate_number, is_active FROM vehicles WHERE plate_number = ? LIMIT 1',
        [String(vehiclePlate).trim()]
      );
      if (vehicles.length === 0 || Number(vehicles[0].is_active) !== 1) {
        await connection.rollback();
        return res.status(404).json({ success: false, message: 'Active vehicle not found' });
      }

      const [deliveries] = await connection.query(
        'SELECT id FROM deliveries WHERE order_id = ? LIMIT 1',
        [orders[0].id]
      );

      if (deliveries.length === 0) {
        // No delivery record yet — create a placeholder so vehicle can be assigned
        await connection.query(
          `INSERT INTO deliveries
             (order_id, order_number, vehicle_plate, assigned_by_user_id,
              weight_kg, size_feet, cost_weight, cost_size, cost_route, total_cost,
              delivery_boy_name, delivery_boy_phone, status)
           VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0, '', '', 'assigned')`,
          [orders[0].id, orders[0].order_number, vehicles[0].plate_number, req.user.id]
        );
      } else {
        await connection.query(
          'UPDATE deliveries SET vehicle_plate = ? WHERE id = ?',
          [vehicles[0].plate_number, deliveries[0].id]
        );
      }

      await connection.commit();

      res.json({
        success: true,
        message: 'Vehicle assigned to order successfully',
        data: {
          orderNumber: orders[0].order_number,
          vehiclePlate: vehicles[0].plate_number
        }
      });
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // ignore
      }
      console.error('Assign vehicle to order error:', error);
      res.status(500).json({ success: false, message: 'Failed to assign vehicle to order' });
    } finally {
      connection.release();
    }
  }
};

module.exports = deliveryRouteController;
