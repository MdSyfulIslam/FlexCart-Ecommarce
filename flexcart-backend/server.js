const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const http = require('http');
require('dotenv').config();

const { testConnection } = require('./config/db');
const { initRealtimeGateway } = require('./services/realtimeGateway');
const { runStartupMigration } = require('./services/startup-migration');
const { validateSSLConfig } = require('./services/sslService');

// Import Routes
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const cartRoutes = require('./routes/cartRoutes');
const companyRoutes = require('./routes/companyRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const favouriteRoutes = require('./routes/favouriteRoutes');
const requestProductRoutes = require('./routes/requestProductRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const spinRewardRoutes = require('./routes/spinRewardRoutes');
const reviewGraphRoutes = require('./routes/reviewGraphRoutes');
const supportRoutes = require('./routes/supportRoutes');
const profileRoutes = require('./routes/profileRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const aiRoutes = require('./routes/aiRoutes');
const negotiationRoutes = require('./routes/negotiationRoutes');
const deliveryRoutes = require('./routes/deliveryRoutes');
const staffAdminRoutes = require('./routes/staffAdminRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// ── Visual Search AI Service (Python subprocess) ──────────────────────────
// Spawns ai/visual_search.py alongside Node.js so that ResNet50-based image
// search is available without a separate service. The process auto-restarts
// on crash (15 s delay). Set VS_AUTOSTART=false in .env to disable in dev
// when you want to run the Python service manually.
const { spawn } = require('child_process');
function startVisualSearchService() {
  const vsPort = process.env.VS_PORT || '5001';
  const pyBin  = process.platform === 'win32' ? 'python' : 'python3';
  const pyScript = path.join(__dirname, 'ai', 'visual_search.py');

  // Pass VS_PORT explicitly so the Python process binds to the right port.
  // Do NOT pass PORT — Render assigns PORT to Node.js, and Python should not
  // compete for the same port.  Use a separate VS_PORT (default 5001).
  const childEnv = { ...process.env };
  delete childEnv.PORT;           // Python reads VS_PORT, not Render's PORT
  childEnv.VS_PORT = vsPort;
  // Point Python to the packages installed via pip --target in the build step.
  // Without this, the subprocess python3 cannot find numpy, flask, etc.
  childEnv.PYTHONPATH = path.join(__dirname, 'ai', 'vendor');

  const proc = spawn(pyBin, [pyScript], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: childEnv,
  });

  proc.stdout.on('data', d => process.stdout.write(`[VS] ${d}`));
  proc.stderr.on('data', d => process.stderr.write(`[VS] ${d}`));
  proc.on('error', err => console.warn(`[VS] Failed to start: ${err.message}`));
  proc.on('close', code => {
    if (code !== 0 && code !== null) {
      console.warn(`[VS] Exited (code ${code}), restarting in 15 s…`);
      setTimeout(startVisualSearchService, 15000);
    }
  });
}
if (process.env.VS_AUTOSTART !== 'false') {
  // Delay slightly so the Node.js server binds its port first
  setTimeout(startVisualSearchService, 3000);
}


// Security Middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    frameguard: { action: 'sameorigin' },
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            'frame-ancestors': ["'self'"]
        }
    }
}));

// Gzip compression — reduces API response sizes significantly
// level 6 = good balance of speed vs size; threshold: skip tiny responses
app.use(compression({ level: 6, threshold: 1024 }));

// ── SSLCommerz payment callbacks ─────────────────────────────────────────────
// These MUST be registered BEFORE the global CORS middleware.
// SSLCommerz redirects the user's browser with a form POST after payment.
// The browser may send Origin: null (cross-protocol HTTPS→HTTP) or
// Origin: https://sandbox.sslcommerz.com — neither is in our normal allowlist.
// Since these endpoints are validated server-side (val_id + amount check),
// there is no security risk in accepting POSTs from any origin here.
app.use(
  ['/api/payment/success', '/api/payment/fail', '/api/payment/cancel', '/api/payment/ipn'],
  cors({ origin: true, methods: ['POST', 'GET'], credentials: false })
);

// CORS
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
    origin: (origin, cb) => {
      // Allow: no origin, 'null' origin (opaque redirect), allowed frontends,
      // Vercel previews, and SSLCommerz gateway domain
      if (
        !origin ||
        origin === 'null' ||
        allowedOrigins.some(o => origin === o || origin.endsWith('.vercel.app')) ||
        origin.endsWith('.sslcommerz.com')
      ) {
        cb(null, true);
      } else {
        cb(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Trust Render's reverse proxy so express-rate-limit reads the real client IP
// from X-Forwarded-For instead of the proxy's internal IP
app.set('trust proxy', 1);

// Rate Limiting
// Strict limiter for auth routes only (prevents brute-force on login/register)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, message: 'Too many requests, please try again later' },
    skip: () => process.env.NODE_ENV === 'test'
});

// General limiter — prevents abuse while allowing normal usage
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { success: false, message: 'Too many requests, please try again later' }
});
app.use('/api/', generalLimiter);

// Body Parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Serve uploaded files - block access to sensitive document folders
const { authenticateToken } = require('./middleware/auth');
const sensitiveUploads = ['/uploads/nids', '/uploads/faces'];
sensitiveUploads.forEach(p => {
  app.use(p, authenticateToken, express.static(path.join(__dirname, p.slice(1))));
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '7d',
  etag: true,
  lastModified: true
}));

// API Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/favourites', favouriteRoutes);
app.use('/api/product-requests', requestProductRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/spin-reward', spinRewardRoutes);
app.use('/api/review-graph', reviewGraphRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/negotiations', negotiationRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/staff-admin', staffAdminRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/payment', paymentRoutes); // callbacks already CORS-open (registered above)

// Public ads endpoint — active ads for all visitors
const superAdminController = require('./controllers/superAdminController');
app.get('/api/ads', superAdminController.getActiveAds);

// Health Check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'FlexCart API is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Root health check for Render
app.get('/', (req, res) => {
    res.json({ success: true, message: 'FlexCart API' });
});

// 404 Handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`
    });
});

// Multer Error Handler (must be before global error handler)
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File size too large. Maximum 25MB per file.'
            });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                message: 'Too many files. Maximum 10 files allowed.'
            });
        }
        return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Global Error:', err);

    if (err.type === 'entity.too.large') {
        return res.status(413).json({ success: false, message: 'File too large' });
    }

    if (err.message && err.message.includes('Only image files')) {
        return res.status(400).json({ success: false, message: err.message });
    }

    res.status(500).json({
        success: false,
        message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});
// Tune HTTP keep-alive so connections are reused properly on Render
server.keepAliveTimeout = 65000;
server.headersTimeout   = 66000;

// Start Server — listen immediately so health checks pass, then init DB
const startServer = async () => {
    // Fail fast (production) or warn (dev) if payment gateway URLs are misconfigured
    validateSSLConfig();

    initRealtimeGateway(server);
    server.listen(PORT, () => {
        console.log(`\n🚀 FlexCart Server running on http://localhost:${PORT}`);
        console.log(`📋 API Documentation: http://localhost:${PORT}/api/health`);
        console.log(`🔌 Realtime Gateway: enabled`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);

        // Self-ping every 14 min to prevent Render free-tier sleep
        // Render resets the 15-min idle timer on every incoming request,
        // so this keeps the server warm as long as it is already running.
        if (process.env.NODE_ENV !== 'development') {
            const selfUrl = process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_URL;
            if (selfUrl) {
                const pingClient = selfUrl.startsWith('https') ? require('https') : require('http');
                setInterval(() => {
                    pingClient.get(`${selfUrl}/api/health`, (res) => {
                        res.resume(); // drain & discard
                    }).on('error', () => {}); // silent fail — server may be busy
                }, 14 * 60 * 1000);
                console.log(`🏓 Keep-alive ping enabled → ${selfUrl}/api/health`);
            }
        }
    });
    // DB init runs after server is up (non-blocking for health check)
    testConnection().then(() => runStartupMigration()).catch(err => {
        console.error('❌ Startup DB init failed:', err.message);
    });
};

startServer();

module.exports = app;