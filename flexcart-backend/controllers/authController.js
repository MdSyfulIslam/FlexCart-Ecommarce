const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { pool } = require('../config/db');
const { generateTokens } = require('../middleware/auth');
const jwt = require('jsonwebtoken');
const { sendOtpEmail } = require('../services/emailService');
const { isValidEmail, isValidUsername } = require('../utils/validators');

const ADMIN_ROLES = ['super_admin', 'staff_admin', 'delivery_admin', 'delivery_boy'];

const authController = {
  register: async (req, res) => {
    try {
      const { username, email, password, phone, address } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ success: false, message: 'Username, email, and password are required' });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({ success: false, message: 'Invalid email address format' });
      }

      if (!isValidUsername(username)) {
        return res.status(400).json({ success: false, message: 'Username must be 3–50 characters and contain only letters, numbers, or underscores' });
      }

      if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      }

      const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
      if (existing.length > 0) {
        return res.status(409).json({ success: false, message: 'Email already registered' });
      }

      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(password, salt);

      const [result] = await pool.query(
        'INSERT INTO users (username, email, password_hash, phone, address) VALUES (?, ?, ?, ?, ?)',
        [username, email, passwordHash, phone || null, address || null]
      );

      await pool.query('INSERT INTO user_settings (user_id) VALUES (?)', [result.insertId]);

      const tokens = generateTokens(result.insertId);

      await pool.query(
        'INSERT INTO user_sessions (user_id, token, device_info) VALUES (?, ?, ?)',
        [result.insertId, tokens.refreshToken, req.headers['user-agent'] || 'unknown']
      );

      res.status(201).json({
        success: true,
        message: 'Registration successful',
        data: {
          user: { id: result.insertId, username, email, points: 0, stars: 0, theme: 'light', profile_image: null },
          ...tokens
        }
      });
    } catch (error) {
      console.error('Register Error:', error);
      res.status(500).json({ success: false, message: 'Server error during registration' });
    }
  },

  login: async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({ success: false, message: 'Invalid email address format' });
      }

      const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

      if (users.length === 0) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      const user = users[0];

      if (user.status !== 'active') {
        return res.status(403).json({ success: false, message: 'Account is suspended or inactive' });
      }

      // Block accounts explicitly set to not approved (is_approved = 0 only; null means not set)
      if (user.is_approved !== null && user.is_approved !== undefined && Number(user.is_approved) === 0) {
        return res.status(403).json({
          success: false,
          message: 'Account access is restricted. Contact your administrator.'
        });
      }

      // Block admin accounts from the user-facing login endpoint BEFORE doing bcrypt (timing safety)
      if (ADMIN_ROLES.includes(user.role)) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      const tokens = generateTokens(user.id);

      await pool.query(
        'INSERT INTO user_sessions (user_id, token, device_info) VALUES (?, ?, ?)',
        [user.id, tokens.refreshToken, req.headers['user-agent'] || 'unknown']
      );

      // Strip sensitive fields before sending to client
      const { password_hash, plain_password, ...userData } = user;

      res.json({ success: true, message: 'Login successful', data: { user: userData, ...tokens } });
    } catch (error) {
      console.error('Login Error:', error);
      res.status(500).json({ success: false, message: 'Server error during login' });
    }
  },

  // Admin-only login — blocks customer/seller accounts
  adminLogin: async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({ success: false, message: 'Invalid email address format' });
      }

      const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

      if (users.length === 0) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      const user = users[0];

      if (!ADMIN_ROLES.includes(user.role)) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      if (user.status !== 'active') {
        return res.status(403).json({ success: false, message: 'Account is suspended or inactive' });
      }

      if (user.is_approved !== null && user.is_approved !== undefined && Number(user.is_approved) === 0) {
        return res.status(403).json({ success: false, message: 'Account access is restricted. Contact your administrator.' });
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      const tokens = generateTokens(user.id);

      await pool.query(
        'INSERT INTO user_sessions (user_id, token, device_info) VALUES (?, ?, ?)',
        [user.id, tokens.refreshToken, req.headers['user-agent'] || 'unknown']
      );

      const { password_hash, plain_password, ...userData } = user;

      res.json({ success: true, message: 'Login successful', data: { user: userData, ...tokens } });
    } catch (error) {
      console.error('Login Error:', error);
      res.status(500).json({ success: false, message: 'Server error during login' });
    }
  },

  refreshToken: async (req, res) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({ success: false, message: 'Refresh token required' });
      }

      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

      const [sessions] = await pool.query(
        'SELECT * FROM user_sessions WHERE user_id = ? AND token = ? AND is_active = 1',
        [decoded.userId, refreshToken]
      );

      if (sessions.length === 0) {
        return res.status(401).json({ success: false, message: 'Invalid refresh token' });
      }

      const tokens = generateTokens(decoded.userId);

      await pool.query('UPDATE user_sessions SET token = ? WHERE id = ?', [tokens.refreshToken, sessions[0].id]);

      res.json({ success: true, data: tokens });
    } catch (error) {
      res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }
  },

  logout: async (req, res) => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Only invalidate the current device session, not all sessions
        const refreshToken = req.body?.refreshToken;
        if (refreshToken) {
          await pool.query(
            'UPDATE user_sessions SET is_active = 0 WHERE user_id = ? AND token = ?',
            [decoded.userId, refreshToken]
          );
        } else {
          // Fallback: invalidate all sessions for this user if no refresh token provided
          await pool.query('UPDATE user_sessions SET is_active = 0 WHERE user_id = ?', [decoded.userId]);
        }
      }
      res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
      res.json({ success: true, message: 'Logged out' });
    }
  },

  getLinkedAccounts: async (req, res) => {
    try {
      const [accounts] = await pool.query(
        `SELECT u.id, u.username, u.email, u.profile_image 
         FROM linked_accounts la JOIN users u ON la.linked_user_id = u.id
         WHERE la.primary_user_id = ? AND u.status = 'active'`,
        [req.user.id]
      );
      res.json({ success: true, data: accounts });
    } catch (error) {
      console.error('Get Linked Accounts Error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  linkAccount: async (req, res) => {
    try {
      const { email, password } = req.body;
      const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
      if (users.length === 0) return res.status(404).json({ success: false, message: 'Account not found' });

      const user = users[0];
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid password' });
      if (user.id === req.user.id) return res.status(400).json({ success: false, message: 'Cannot link to same account' });

      // Prevent linking between admin accounts and regular user accounts (privilege escalation guard)
      const isCurrentUserAdmin = ADMIN_ROLES.includes(req.user.role);
      const isTargetUserAdmin = ADMIN_ROLES.includes(user.role);
      if (isCurrentUserAdmin !== isTargetUserAdmin) {
        return res.status(403).json({ success: false, message: 'Cannot link admin and non-admin accounts' });
      }

      await pool.query('INSERT INTO linked_accounts (primary_user_id, linked_user_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [req.user.id, user.id]);
      await pool.query('INSERT INTO linked_accounts (primary_user_id, linked_user_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [user.id, req.user.id]);

      res.json({ success: true, message: 'Account linked successfully' });
    } catch (error) {
      console.error('Link Account Error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  switchAccount: async (req, res) => {
    try {
      const { accountId } = req.body;
      const [linked] = await pool.query(
        'SELECT * FROM linked_accounts WHERE primary_user_id = ? AND linked_user_id = ?',
        [req.user.id, accountId]
      );

      if (linked.length === 0) return res.status(403).json({ success: false, message: 'Account not linked' });

      const [users] = await pool.query(
        "SELECT id, username, email, phone, role, points, stars, is_seller, theme, profile_image, appearance_color, background_image FROM users WHERE id = ? AND status = 'active'",
        [accountId]
      );

      if (users.length === 0) return res.status(404).json({ success: false, message: 'Account not found' });

      const tokens = generateTokens(accountId);
      await pool.query(
        'INSERT INTO user_sessions (user_id, token, device_info) VALUES (?, ?, ?)',
        [accountId, tokens.refreshToken, req.headers['user-agent'] || 'unknown']
      );
      res.json({ success: true, message: 'Switched account successfully', data: { user: users[0], ...tokens } });
    } catch (error) {
      console.error('Switch Account Error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  unlinkAccount: async (req, res) => {
    try {
      const { accountId } = req.body;

      if (!accountId) {
        return res.status(400).json({ success: false, message: 'accountId is required' });
      }

      const targetAccountId = Number(accountId);
      if (!Number.isInteger(targetAccountId)) {
        return res.status(400).json({ success: false, message: 'accountId must be a valid number' });
      }

      if (targetAccountId === req.user.id) {
        return res.status(400).json({ success: false, message: 'Cannot unlink your current account' });
      }

      const [linked] = await pool.query(
        'SELECT 1 FROM linked_accounts WHERE primary_user_id = ? AND linked_user_id = ? LIMIT 1',
        [req.user.id, targetAccountId]
      );

      if (linked.length === 0) {
        return res.status(404).json({ success: false, message: 'Account is not linked' });
      }

      await pool.query(
        `DELETE FROM linked_accounts
         WHERE (primary_user_id = ? AND linked_user_id = ?)
            OR (primary_user_id = ? AND linked_user_id = ?)`,
        [req.user.id, targetAccountId, targetAccountId, req.user.id]
      );

      res.json({ success: true, message: 'Account unlinked successfully' });
    } catch (error) {
      console.error('Unlink Account Error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  // ─── Password Reset (OTP-based) ──────────────────────────────────────────

  forgotPassword: async (req, res) => {
    try {
      const { email, portal } = req.body;
      if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

      const [users] = await pool.query(
        "SELECT id, email, username, role FROM users WHERE email = ? AND status = 'active'",
        [email.toLowerCase().trim()]
      );

      if (users.length > 0) {
        const user = users[0];
        const isAdminUser = ADMIN_ROLES.includes(user.role);
        const isAdminPortal = portal === 'admin';

        if (isAdminUser === isAdminPortal) {
          const otp = String(Math.floor(100000 + Math.random() * 900000));
          const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

          await pool.query(
            'UPDATE password_reset_otps SET is_used = 1 WHERE user_id = ? AND is_used = 0',
            [user.id]
          );
          await pool.query(
            'INSERT INTO password_reset_otps (user_id, email, otp_code, expires_at) VALUES (?, ?, ?, ?)',
            [user.id, user.email, otp, expiresAt]
          );

          try {
            await sendOtpEmail(user.email, otp, user.username);
          } catch (emailErr) {
            console.error('OTP email send error:', emailErr.message);
          }
        }
      }

      res.json({ success: true, message: 'If that email is registered, an OTP has been sent to it.' });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  verifyOtp: async (req, res) => {
    try {
      const { email, otp, portal } = req.body;
      if (!email || !otp) {
        return res.status(400).json({ success: false, message: 'Email and OTP are required' });
      }

      const [users] = await pool.query(
        "SELECT id, role FROM users WHERE email = ? AND status = 'active'",
        [email.toLowerCase().trim()]
      );

      if (users.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid OTP or email' });
      }

      const user = users[0];
      const isAdminUser = ADMIN_ROLES.includes(user.role);
      const isAdminPortal = portal === 'admin';

      if (isAdminUser !== isAdminPortal) {
        return res.status(400).json({ success: false, message: 'Invalid OTP or email' });
      }

      const [records] = await pool.query(
        `SELECT id FROM password_reset_otps
         WHERE user_id = ? AND otp_code = ? AND is_used = 0 AND is_verified = 0
           AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [user.id, otp.trim()]
      );

      if (records.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      const tokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await pool.query(
        'UPDATE password_reset_otps SET is_verified = 1, reset_token = ?, token_expires_at = ? WHERE id = ?',
        [resetToken, tokenExpiresAt, records[0].id]
      );

      res.json({ success: true, message: 'OTP verified', data: { reset_token: resetToken } });
    } catch (error) {
      console.error('Verify OTP error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  resetPassword: async (req, res) => {
    try {
      const { reset_token, new_password } = req.body;

      if (!reset_token || !new_password) {
        return res.status(400).json({ success: false, message: 'Reset token and new password are required' });
      }
      if (new_password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      }

      const [records] = await pool.query(
        `SELECT p.id, p.user_id, u.role
         FROM password_reset_otps p
         JOIN users u ON u.id = p.user_id
         WHERE p.reset_token = ? AND p.is_verified = 1 AND p.is_used = 0
           AND p.token_expires_at > NOW()`,
        [reset_token]
      );

      if (records.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
      }

      const { id: recordId, user_id, role } = records[0];
      const hash = await bcrypt.hash(new_password, 12);

      await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, user_id]);

      await pool.query('UPDATE password_reset_otps SET is_used = 1 WHERE id = ?', [recordId]);
      await pool.query('UPDATE user_sessions SET is_active = 0 WHERE user_id = ?', [user_id]);

      res.json({ success: true, message: 'Password reset successfully. Please log in with your new password.' });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
};

module.exports = authController;