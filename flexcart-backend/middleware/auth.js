const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

// Verify JWT Token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const [users] = await pool.query(
      'SELECT id, username, email, phone, points, stars, role, assigned_branch_id, is_approved, salary, is_seller, is_verified, theme, appearance_color, background_image, profile_image, status FROM users WHERE id = ? AND status = \'active\'',
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    // Block accounts explicitly set to not approved (is_approved = 0 only; null means not restricted)
    if (users[0] && users[0].is_approved !== null && users[0].is_approved !== undefined && Number(users[0].is_approved) === 0) {
      return res.status(403).json({
        success: false,
        message: 'Account access is restricted. Contact your administrator.'
      });
    }

    req.user = users[0];
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    return res.status(403).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

// Optional authentication - allows guest access
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const [users] = await pool.query(
        'SELECT id, username, email, points, stars, is_seller, theme, profile_image FROM users WHERE id = ? AND status = \'active\'',
        [decoded.userId]
      );
      if (users.length > 0) {
        req.user = users[0];
      }
    }
    next();
  } catch (error) {
    next();
  }
};

// Check if user is seller
const requireSeller = async (req, res, next) => {
  if (!req.user || !req.user.is_seller) {
    return res.status(403).json({
      success: false,
      message: 'Seller access required'
    });
  }
  next();
};

// Check if user has one of the required roles
const requireRoles = (...allowedRoles) => {
  const allowed = allowedRoles.flat().filter(Boolean);
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const role = req.user.role || 'customer';
    if (!allowed.includes(role)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    next();
  };
};

// Generate tokens
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );

  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );

  return { accessToken, refreshToken };
};

module.exports = { authenticateToken, optionalAuth, requireSeller, requireRoles, generateTokens };