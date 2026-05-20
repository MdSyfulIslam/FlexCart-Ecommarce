// Python Recommendation Service client
// Calls flexcart-backend/ai/recommender_service.py
// Fallback: return null so JS recommender can be used.

const http = require('http');
const https = require('https');

const REC_SERVICE_URL = process.env.REC_SERVICE_URL || 'http://localhost:5003';

const postJson = async (path, bodyObj, timeoutMs = 8000) => {
  const url = new URL(`${REC_SERVICE_URL}${path}`);
  const lib = url.protocol === 'https:' ? https : http;
  const body = Buffer.from(JSON.stringify(bodyObj || {}));

  const responseText = await new Promise((resolve, reject) => {
    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': body.length
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  return JSON.parse(responseText);
};

const getPythonRecommendations = async (payload) => {
  try {
    const parsed = await postJson('/recommend', payload, 8000);
    if (!parsed || !parsed.success) return null;
    const recs = parsed.data && parsed.data.recommendations;
    const meta = parsed.data && parsed.data.meta;
    if (!Array.isArray(recs)) return null;
    return { recommendations: recs, meta };
  } catch {
    return null;
  }
};

module.exports = { getPythonRecommendations };
