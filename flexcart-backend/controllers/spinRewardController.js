const { pool } = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// ✅ Must match EXACTLY with frontend SPIN_WHEEL_SEGMENTS order
const WHEEL_SEGMENTS = [
  { type: 'points', value: 10,  label: '10 Pts'   },  // index 0
  { type: 'stars',  value: 0.2, label: '0.2 ★'   },  // index 1
  { type: 'points', value: 25,  label: '25 Pts'   },  // index 2
  { type: 'stars',  value: 0.5, label: '0.5 ★'   },  // index 3
  { type: 'points', value: 50,  label: '50 Pts'   },  // index 4
  { type: 'nothing',value: 0,   label: 'Try Again'},  // index 5
  { type: 'points', value: 100, label: '100 Pts'  },  // index 6
  { type: 'stars',  value: 1.0, label: '1.0 ★'   },  // index 7
  { type: 'points', value: 200, label: '200 Pts'  },  // index 8
  { type: 'stars',  value: 0.3, label: '0.3 ★'   },  // index 9
  { type: 'points', value: 150, label: '150 Pts'  },  // index 10
  { type: 'stars',  value: 2.0, label: '2.0 ★'   }   // index 11
];

// ✅ Probability for each segment (must match order above)
const SEGMENT_PROBABILITIES = [
  0.12,   // index 0  — 10 Pts
  0.12,   // index 1  — 0.2 ★
  0.10,   // index 2  — 25 Pts
  0.08,   // index 3  — 0.5 ★
  0.07,   // index 4  — 50 Pts
  0.24,   // index 5  — Try Again
  0.04,   // index 6  — 100 Pts
  0.05,   // index 7  — 1.0 ★
  0.02,   // index 8  — 200 Pts
  0.10,   // index 9  — 0.3 ★
  0.03,   // index 10 — 150 Pts
  0.03    // index 11 — 2.0 ★
];

const spinRewardController = {
  checkSpinEligibility: async (req, res) => {
    try {
      const [user] = await pool.query(
        'SELECT last_spin_date FROM users WHERE id = ?',
        [req.user.id]
      );
      const lastSpin = user[0].last_spin_date;
      let canSpin = true;
      let nextSpinTime = null;

      if (lastSpin) {
        const hoursSince = (new Date() - new Date(lastSpin)) / (1000 * 60 * 60);
        if (hoursSince < 24) {
          canSpin = false;
          nextSpinTime = new Date(new Date(lastSpin).getTime() + 24 * 60 * 60 * 1000);
        }
      }

      res.json({ success: true, data: { canSpin, nextSpinTime } });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  spin: async (req, res) => {
    try {
      const [user] = await pool.query(
        'SELECT last_spin_date FROM users WHERE id = ?',
        [req.user.id]
      );

      if (user[0].last_spin_date) {
        const hoursSince = (new Date() - new Date(user[0].last_spin_date)) / (1000 * 60 * 60);
        if (hoursSince < 24) {
          return res.status(400).json({
            success: false,
            message: 'Spin available every 24 hours'
          });
        }
      }

      // ✅ Select segment using weighted probability
      let cumulative = 0;
      const random = Math.random();
      let selectedIndex = WHEEL_SEGMENTS.length - 1; // default last
      
      for (let i = 0; i < SEGMENT_PROBABILITIES.length; i++) {
        cumulative += SEGMENT_PROBABILITIES[i];
        if (random <= cumulative) {
          selectedIndex = i;
          break;
        }
      }

      const selected = WHEEL_SEGMENTS[selectedIndex];

      let promoCode = null;
      let promoExpiry = null;

      // Handle discount type (if you add discount segments later)
      if (selected.type === 'discount') {
        promoCode = `SPIN-${uuidv4().slice(0, 8).toUpperCase()}`;
        promoExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await pool.query(
          `INSERT INTO promo_codes (code, discount_type, discount_value, max_uses, expires_at) 
           VALUES (?, 'percentage', ?, 1, ?)`,
          [promoCode, selected.value, promoExpiry]
        );
      }

      // Save spin reward record
      await pool.query(
        `INSERT INTO spin_rewards (user_id, reward_type, reward_value, promo_code, promo_expiry) 
         VALUES (?, ?, ?, ?, ?)`,
        [req.user.id, selected.type, selected.value, promoCode, promoExpiry]
      );

      // ✅ Update user based on reward type
      if (selected.type === 'points') {
        await pool.query(
          'UPDATE users SET points = points + ?, last_spin_date = NOW() WHERE id = ?',
          [selected.value, req.user.id]
        );
      } else if (selected.type === 'stars') {
        await pool.query(
          'UPDATE users SET stars = LEAST(5, stars + ?), last_spin_date = NOW() WHERE id = ?',
          [selected.value, req.user.id]
        );
      } else {
        await pool.query(
          'UPDATE users SET last_spin_date = NOW() WHERE id = ?',
          [req.user.id]
        );
      }

      // Notification
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, message) 
         VALUES (?, 'spin_reward', 'Spin Reward!', ?)`,
        [
          req.user.id,
          `You won: ${selected.label}!${promoCode ? ` Code: ${promoCode}` : ''}`
        ]
      );

      // ✅ Return segmentIndex so frontend knows WHERE to land
      res.json({
        success: true,
        data: {
          reward: {
            type: selected.type,
            value: selected.value,
            label: selected.label,
            segmentIndex: selectedIndex,
            promoCode,
            promoExpiry
          }
        }
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  },

  getSpinHistory: async (req, res) => {
    try {
      const [history] = await pool.query(
        'SELECT * FROM spin_rewards WHERE user_id = ? ORDER BY spun_at DESC LIMIT 30',
        [req.user.id]
      );
      res.json({ success: true, data: history });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
};

module.exports = spinRewardController;