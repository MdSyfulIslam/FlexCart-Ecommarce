/**
 * Bulk-index all existing product images into the visual search service.
 * Run once after starting the Python service:
 *
 *   node scripts/bulk_index_products.js
 */

'use strict';

const http = require('http');
const https = require('https');
const { pool } = require('../config/db');

const VS_SERVICE_URL = process.env.VS_SERVICE_URL || 'http://localhost:5001';
const BACKEND_PUBLIC_URL = process.env.BACKEND_PUBLIC_URL || process.env.PUBLIC_BASE_URL || '';

function toAbsolutePublicUrl(pathOrUrl) {
  const value = String(pathOrUrl || '');
  if (!value) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (!BACKEND_PUBLIC_URL) return value;
  const base = String(BACKEND_PUBLIC_URL).replace(/\/+$/, '');
  const p = value.startsWith('/') ? value : `/${value}`;
  return `${base}${p}`;
}

async function post(urlString, body) {
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
      res.on('end', () => resolve(JSON.parse(raw)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  try {
    const [products] = await pool.query(
      `SELECT p.id, p.name, p.image_url FROM products p WHERE p.status = 'active' AND p.image_url IS NOT NULL`
    );

    console.log(`Found ${products.length} products to index…`);

    const chunkSize = 50;
    for (let i = 0; i < products.length; i += chunkSize) {
      const chunk = products.slice(i, i + chunkSize).map(p => ({
        product_id: p.id,
        image_url: toAbsolutePublicUrl(p.image_url),
        name: p.name
      }));

      const result = await post(`${VS_SERVICE_URL}/bulk-index`, { products: chunk });
      console.log(`Chunk ${Math.floor(i / chunkSize) + 1}: indexed ${result.indexed}, failed ${result.failed?.length || 0}`);
    }

    console.log('Bulk indexing complete.');
    process.exit(0);
  } catch (err) {
    console.error('Bulk index error:', err.message);
    process.exit(1);
  }
})();
