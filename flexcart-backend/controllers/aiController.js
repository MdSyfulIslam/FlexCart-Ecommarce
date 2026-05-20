const { pool } = require('../config/db');
const http = require('http');
const https = require('https');
const { processImageForProducts } = require('../middleware/aiProcessor');

const VS_SERVICE_URL = process.env.VS_SERVICE_URL || 'http://localhost:5001';
const BACKEND_PUBLIC_URL = process.env.BACKEND_PUBLIC_URL || process.env.PUBLIC_BASE_URL || '';

function toAbsolutePublicUrl(p) {
  const v = String(p || '');
  if (!v || /^https?:\/\//i.test(v)) return v;
  if (!BACKEND_PUBLIC_URL) return v;
  const base = String(BACKEND_PUBLIC_URL).replace(/\/+$/, '');
  return `${base}${v.startsWith('/') ? v : `/${v}`}`;
}

async function httpPost(urlString, body) {
  const url = new URL(urlString);
  const lib = url.protocol === 'https:' ? https : http;
  const data = Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
    });
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const aiController = {
  processImage: async (req, res) => {
    try {
      const { description } = req.body;
      // imageStoredPath: full Cloudinary URL (production) or relative local path (dev)
      const imageStoredPath = req.file
        ? (/^https?:\/\//i.test(req.file.path) ? req.file.path : `/uploads/ai/${req.file.filename}`)
        : null;
      // imagePath is passed to processImageForProducts — must be the full URL or
      // relative path so that the Python visual search service can fetch the image.
      const imagePath = imageStoredPath || '';
      if (!req.file && !description) return res.status(400).json({ success: false, message: 'Please upload an image or provide a description' });

      const results = await processImageForProducts(imagePath, description || '');

      if (req.user) {
        try {
          await pool.query(
            `INSERT INTO ai_search_history (user_id, image_path, description, results) VALUES (?, ?, ?, ?)`,
            [req.user.id, imageStoredPath, description || null, JSON.stringify({ inStock: results.inStock.length, outOfStock: results.outOfStock.length })]
          );
        } catch { /* non-fatal — history logging failure must not break the search response */ }
      }

      res.json({ success: true, data: { inStock: results.inStock, outOfStock: results.outOfStock, totalResults: results.inStock.length + results.outOfStock.length } });
    } catch (error) { console.error(error); res.status(500).json({ success: false, message: 'AI processing error' }); }
  },

  getSearchHistory: async (req, res) => {
    try {
      const [history] = await pool.query('SELECT * FROM ai_search_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [req.user.id]);
      res.json({ success: true, data: history });
    } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
  },

  reindexProducts: async (req, res) => {
    try {
      // Health check first
      const healthUrl = new URL(`${VS_SERVICE_URL}/health`);
      const lib = healthUrl.protocol === 'https:' ? https : http;
      await new Promise((resolve, reject) => {
        const r = lib.get(healthUrl.href, resolve);
        r.setTimeout(5000, () => { r.destroy(); reject(new Error('Visual search service is not running. Start it with: python ai/visual_search.py')); });
        r.on('error', () => reject(new Error('Visual search service is not running. Start it with: python ai/visual_search.py')));
      });

      const [products] = await pool.query(
        `SELECT id, name, image_url FROM products WHERE status = 'active' AND image_url IS NOT NULL`
      );

      if (products.length === 0) {
        return res.json({ success: true, message: 'No products to index.', indexed: 0, total: 0 });
      }

      let totalIndexed = 0;
      let totalFailed = 0;
      const chunkSize = 50;
      for (let i = 0; i < products.length; i += chunkSize) {
        const chunk = products.slice(i, i + chunkSize).map(p => ({
          product_id: p.id,
          image_url: toAbsolutePublicUrl(p.image_url),
          name: p.name
        }));
        try {
          const result = await httpPost(`${VS_SERVICE_URL}/bulk-index`, { products: chunk });
          totalIndexed += result.indexed || 0;
          totalFailed += result.failed?.length || 0;
        } catch { totalFailed += chunk.length; }
      }

      res.json({ success: true, message: `Indexed ${totalIndexed} of ${products.length} products.`, indexed: totalIndexed, failed: totalFailed, total: products.length });
    } catch (err) {
      res.status(503).json({ success: false, message: err.message || 'Reindex failed' });
    }
  }
};

module.exports = aiController;