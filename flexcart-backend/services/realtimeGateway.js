const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

let ioInstance = null;

function parseOrigins() {
  const envOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';
  const origins = String(envOrigin)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!origins.includes('http://localhost:3000')) origins.push('http://localhost:3000');
  return origins;
}

function getTokenFromSocket(socket) {
  const authToken = socket.handshake?.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) return authToken.trim();

  const queryToken = socket.handshake?.query?.token;
  if (typeof queryToken === 'string' && queryToken.trim()) return queryToken.trim();

  const headerAuth = socket.handshake?.headers?.authorization;
  if (typeof headerAuth === 'string' && headerAuth.startsWith('Bearer ')) {
    return headerAuth.slice(7).trim();
  }

  return null;
}

async function resolveActiveUser(decoded) {
  const userId = decoded?.userId;
  if (!userId) return null;

  const [rows] = await pool.query(
    `SELECT id, role, assigned_branch_id, status
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );

  if (!rows.length) return null;
  const user = rows[0];
  if (user.status !== 'active') return null;
  return user;
}

async function joinCompanyRooms(socket, userId) {
  const [companies] = await pool.query(
    `SELECT id FROM companies
     WHERE user_id = ? AND status = 'active'`,
    [userId]
  );

  for (const company of companies) {
    socket.join(`company:${company.id}`);
  }
}

function initRealtimeGateway(httpServer) {
  if (ioInstance) return ioInstance;

  const io = new Server(httpServer, {
    cors: {
      origin: parseOrigins(),
      credentials: true,
      methods: ['GET', 'POST']
    }
  });

  io.use(async (socket, next) => {
    try {
      const token = getTokenFromSocket(socket);
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await resolveActiveUser(decoded);
      if (!user) return next(new Error('User is not active'));

      socket.user = user;
      return next();
    } catch {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const user = socket.user;
    if (!user) return;

    socket.join(`user:${user.id}`);

    if (user.role) {
      socket.join(`role:${user.role}`);
    }

    if (user.assigned_branch_id) {
      socket.join(`branch:${user.assigned_branch_id}`);
    }

    if (user.role === 'seller') {
      try {
        await joinCompanyRooms(socket, user.id);
      } catch {
        // no-op: sellers can still receive direct user events.
      }
    }

    socket.on('subscribe:company', (companyId) => {
      const id = Number(companyId);
      if (Number.isInteger(id) && id > 0) {
        socket.join(`company:${id}`);
      }
    });

    socket.on('subscribe:order', (orderNumber) => {
      const normalized = String(orderNumber || '').trim();
      if (normalized) {
        socket.join(`order:${normalized}`);
      }
    });

    socket.on('unsubscribe:order', (orderNumber) => {
      const normalized = String(orderNumber || '').trim();
      if (normalized) {
        socket.leave(`order:${normalized}`);
      }
    });
  });

  ioInstance = io;
  return ioInstance;
}

function getRealtimeGateway() {
  return ioInstance;
}

function emitToUser(userId, event, payload) {
  if (!ioInstance || !userId) return;
  ioInstance.to(`user:${userId}`).emit(event, payload);
}

function emitToBranch(branchId, event, payload) {
  if (!ioInstance || !branchId) return;
  ioInstance.to(`branch:${branchId}`).emit(event, payload);
}

function emitToCompany(companyId, event, payload) {
  if (!ioInstance || !companyId) return;
  ioInstance.to(`company:${companyId}`).emit(event, payload);
}

function emitToOrder(orderNumber, event, payload) {
  if (!ioInstance || !orderNumber) return;
  ioInstance.to(`order:${orderNumber}`).emit(event, payload);
}

module.exports = {
  initRealtimeGateway,
  getRealtimeGateway,
  emitToUser,
  emitToBranch,
  emitToCompany,
  emitToOrder
};
