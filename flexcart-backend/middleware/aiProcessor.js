// AI Image Processing Middleware
// Primary: calls the Python visual search microservice (ai/visual_search.py)
// Fallback: keyword matching against product names/descriptions

const { pool } = require('../config/db');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

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

const STRICT_INTENT = new Set([
  'shoe', 'shoes', 'sneaker', 'sneakers', 'boot', 'boots', 'heel', 'heels',
  'sandal', 'sandals', 'slipper', 'slippers', 'loafer', 'loafers',
  'runner', 'running', 'trainers', 'trainer'
  , 'mobile', 'mobiles', 'phone', 'phones', 'smartphone', 'smartphones', 'iphone', 'android'
]);

function expandStrictKeywords(tokens = []) {
  const out = new Set();
  for (const token of tokens) {
    const k = String(token || '').toLowerCase();
    if (!k) continue;
    out.add(k);
    // basic plural normalization
    if (k.endsWith('s') && k.length > 3) out.add(k.slice(0, -1));
  }
  return [...out];
}

function getStrictIntentKeywords(description = '') {
  const keywords = extractKeywords(description || '', '');
  const strict = (keywords || []).map(k => String(k).toLowerCase()).filter(k => STRICT_INTENT.has(k));
  return expandStrictKeywords(strict);
}

/**
 * POST multipart form data to the Python visual search service.
 * Sends the image file (or image URL) plus optional description text.
 * Python now handles combined image+text scoring, so we just forward everything.
 * Uses native http/https — no axios dependency needed.
 */
const searchByImageVector = async (imagePath, description = '') => {
  try {
    const CRLF = '\r\n';
    const boundary = `----FormBoundary${Date.now()}`;

    // Build multipart body
    const parts = [];

    // Part 1: image — either from local disk or send URL as a text field
    const isRemoteUrl = /^https?:\/\//i.test(imagePath);
    const localFullPath = !isRemoteUrl
      ? path.join(__dirname, '..', 'uploads', 'ai', path.basename(imagePath))
      : null;
    const localExists = localFullPath && fs.existsSync(localFullPath);

    if (localExists) {
      const fileData = fs.readFileSync(localFullPath);
      const header = Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="image"; filename="${path.basename(localFullPath)}"${CRLF}` +
        `Content-Type: image/jpeg${CRLF}${CRLF}`
      );
      parts.push(header, fileData, Buffer.from(CRLF));
    } else if (isRemoteUrl || imagePath) {
      // Pass the URL as an image_url form field for Python to fetch
      const urlVal = isRemoteUrl ? imagePath : toAbsolutePublicUrl(imagePath);
      if (urlVal) {
        const urlPart = Buffer.from(
          `--${boundary}${CRLF}` +
          `Content-Disposition: form-data; name="image_url"${CRLF}${CRLF}` +
          `${urlVal}${CRLF}`
        );
        parts.push(urlPart);
      }
    }

    if (!parts.length) return null;

    // Part 2: description text (combined image+text scoring happens in Python)
    if (description && description.trim()) {
      const descPart = Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="description"${CRLF}${CRLF}` +
        `${description.trim()}${CRLF}`
      );
      parts.push(descPart);
    }

    parts.push(Buffer.from(`--${boundary}--${CRLF}`));
    const body = Buffer.concat(parts);

    // min_score=0.15 — CLIP cosine similarities are on a different scale than
    // the old histogram approach (0.20 was too high and filtered real matches)
    const url = new URL(`${VS_SERVICE_URL}/search?top_k=20&min_score=0.15`);
    const lib = url.protocol === 'https:' ? https : http;

    const responseText = await new Promise((resolve, reject) => {
      const req = lib.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve(data));
      });
      req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    const parsed = JSON.parse(responseText);
    if (!parsed.success || !parsed.data || !parsed.data.length) return null;

    const productIds = parsed.data.map(r => r.product_id);
    const placeholders = productIds.map(() => '?').join(',');
    const [products] = await pool.query(
      `SELECT p.*, c.company_name, c.company_logo
       FROM products p
       JOIN companies c ON p.company_id = c.id
       WHERE p.id IN (${placeholders}) AND p.status = 'active'`,
      productIds
    );

    const scoreMap = Object.fromEntries(parsed.data.map(r => [String(r.product_id), r.score]));
    const exactMatchIds = new Set(parsed.data.filter(r => r.exact_match).map(r => String(r.product_id)));

    // Preserve Python's ranking order (Python already applied combined scoring)
    products.sort((a, b) => {
      const aExact = exactMatchIds.has(String(a.id)) ? 1 : 0;
      const bExact = exactMatchIds.has(String(b.id)) ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      return (scoreMap[String(b.id)] || 0) - (scoreMap[String(a.id)] || 0);
    });

    // Attach Python's fields onto each DB product object so the frontend
    // can display exact-match badges and sort by similarity score.
    products.forEach(p => {
      p.exact_match = exactMatchIds.has(String(p.id));
      p.score = scoreMap[String(p.id)] || 0;
    });

    return {
      inStock: products.filter(p => p.is_in_stock),
      outOfStock: products.filter(p => !p.is_in_stock)
    };
  } catch {
    // Service unavailable or timed out — silently fall back to keyword search
    return null;
  }
};

const processImageForProducts = async (imagePath, description = '') => {
  try {
    const strictIntentKeywords = getStrictIntentKeywords(description);

    // 1. Try visual search service (Python ML model) when an image was uploaded
    if (imagePath) {
      const visualResults = await searchByImageVector(imagePath, description);
      if (visualResults && (visualResults.inStock.length > 0 || visualResults.outOfStock.length > 0)) {
        return visualResults;
      }

      // If user intent is strict (e.g., "shoe"), do not fall back to unrelated results.
      if (strictIntentKeywords.length > 0) {
        return { inStock: [], outOfStock: [] };
      }
    }

    // 2. Keyword fallback — use only user-provided description, not image filename
    const keywords = extractKeywords(description);
    let results = { inStock: [], outOfStock: [] };

    if (keywords.length > 0) {
      // Build search query (p.tags excluded: JSON column can't use LIKE in PostgreSQL)
      const searchConditions = keywords.map(() =>
        '(p.name LIKE ? OR p.description LIKE ? OR p.brand LIKE ? OR p.model LIKE ? OR c.company_name LIKE ?)'
      ).join(' OR ');

      const searchParams = [];
      keywords.forEach(keyword => {
        const likeParam = `%${keyword}%`;
        searchParams.push(likeParam, likeParam, likeParam, likeParam, likeParam);
      });

      // Search in-stock products first
      const [inStockProducts] = await pool.query(
        `SELECT p.*, c.company_name, c.company_logo,
          CASE 
            WHEN p.name LIKE ? THEN 10
            WHEN p.brand LIKE ? THEN 8
            WHEN p.description LIKE ? THEN 5
            ELSE 1
          END as relevance_score
        FROM products p
        JOIN companies c ON p.company_id = c.id
        WHERE p.status = 'active' AND p.is_in_stock = 1 AND (${searchConditions})
        ORDER BY relevance_score DESC, p.rating DESC, p.total_sold DESC
        LIMIT 20`,
        [`%${keywords[0]}%`, `%${keywords[0]}%`, `%${keywords[0]}%`, ...searchParams]
      );

      // Search out-of-stock products
      const [outOfStockProducts] = await pool.query(
        `SELECT p.*, c.company_name, c.company_logo
        FROM products p
        JOIN companies c ON p.company_id = c.id
        WHERE p.status = 'active' AND p.is_in_stock = 0 AND (${searchConditions})
        ORDER BY p.rating DESC
        LIMIT 10`,
        searchParams
      );

      results.inStock = inStockProducts;
      results.outOfStock = outOfStockProducts;
    }

    // If no keyword matches:
    // - strict intent => return empty
    // - otherwise => return category-based suggestions
    if (results.inStock.length === 0 && results.outOfStock.length === 0) {
      if (strictIntentKeywords.length > 0) {
        return { inStock: [], outOfStock: [] };
      }

      const [defaultProducts] = await pool.query(
        `SELECT p.*, c.company_name, c.company_logo
        FROM products p
        JOIN companies c ON p.company_id = c.id
        WHERE p.status = 'active'
        ORDER BY p.rating DESC, p.total_sold DESC
        LIMIT 20`
      );
      results.inStock = defaultProducts.filter(p => p.is_in_stock);
      results.outOfStock = defaultProducts.filter(p => !p.is_in_stock);
    }

    return results;
  } catch (error) {
    console.error('AI Processing Error:', error);
    // Return empty results instead of crashing the endpoint
    return { inStock: [], outOfStock: [] };
  }
};

const extractKeywords = (description, imagePath = '') => {
  // Use only description text for keyword extraction; ignore image file path
  const text = description.toLowerCase();
  
  // Remove common words and special characters
  const stopWords = ['a', 'an', 'the', 'is', 'are', 'was', 'were', 'i', 'want', 'need', 'buy',
    'like', 'this', 'that', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'find', 'me', 'show', 'get', 'looking', 'search', 'similar', 'product', 'item', 'please',
    'can', 'you', 'my', 'it', 'image', 'photo', 'picture', 'jpg', 'png', 'jpeg', 'webp', 'gif'];
  
  const words = text
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.includes(word));

  return [...new Set(words)];
};

module.exports = { processImageForProducts, extractKeywords, indexProductImage };

/**
 * Fire-and-forget: index a product image in the visual search service.
 * Called after addProduct — errors are silently ignored.
 */
async function indexProductImage(productId, imageUrl, productName) {
  try {
    const url = new URL(`${VS_SERVICE_URL}/index-product`);
    const lib = url.protocol === 'https:' ? https : http;
    const absoluteImageUrl = toAbsolutePublicUrl(imageUrl);
    const body = Buffer.from(JSON.stringify({
      product_id: String(productId),
      image_url: absoluteImageUrl,
      name: productName
    }));

    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }
    });
    req.setTimeout(15000, () => req.destroy());
    req.on('error', () => { /* silent */ });
    req.write(body);
    req.end();
  } catch { /* silent */ }
}