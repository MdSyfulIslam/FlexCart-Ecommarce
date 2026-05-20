'use strict';
/**
 * Supabase full database setup script
 * Uses Supabase Management API to:
 *  1. Restore the project if paused
 *  2. Run the full schema via SQL API
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || '';
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || '';
const BASE_URL = 'api.supabase.com';

function apiRequest(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: BASE_URL,
      path: urlPath,
      method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== FlexCart Supabase Setup ===\n');

  // 1. Check project status
  console.log('1. Checking project status...');
  const info = await apiRequest('GET', `/v1/projects/${PROJECT_REF}`);
  console.log(`   Status: ${info.status}`, typeof info.body === 'object' ? info.body.status || info.body.message : info.body);

  if (info.status === 200 && info.body.status === 'INACTIVE') {
    console.log('   Project is paused. Restoring...');
    const restore = await apiRequest('POST', `/v1/projects/${PROJECT_REF}/restore`);
    console.log(`   Restore response: ${restore.status}`, restore.body);

    // Wait for it to come back online
    console.log('   Waiting for project to resume (this can take 1-2 minutes)...');
    for (let i = 0; i < 24; i++) {
      await sleep(5000);
      const check = await apiRequest('GET', `/v1/projects/${PROJECT_REF}`);
      const st = check.body && check.body.status;
      process.stdout.write(`   [${(i+1)*5}s] Status: ${st || '?'}\r`);
      if (st === 'ACTIVE_HEALTHY') {
        console.log('\n   ✅ Project is active!');
        break;
      }
    }
  } else if (info.status === 200 && info.body.status === 'ACTIVE_HEALTHY') {
    console.log('   ✅ Project is already active.');
  } else {
    console.log('   Response:', JSON.stringify(info.body, null, 2));
  }

  // 2. Run schema via SQL API
  console.log('\n2. Setting up database schema...');

  // Read the SQL files
  const sqlPath = path.join(__dirname, '..', 'models', 'database.sql');
  let sql = fs.readFileSync(sqlPath, 'utf8');

  // Convert MySQL → PostgreSQL
  sql = sql
    .replace(/CREATE\s+DATABASE\s+[^;]+;\s*/gi, '')
    .replace(/USE\s+`?[^\s;`]+`?\s*;\s*/gi, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\bINT\s+AUTO_INCREMENT\s+PRIMARY\s+KEY\b/gi, 'SERIAL PRIMARY KEY')
    .replace(/\bINT\s+AUTO_INCREMENT\b/gi, 'SERIAL')
    .replace(/TINYINT\s*\(\s*1\s*\)/gi, 'SMALLINT')
    .replace(/\bTINYINT\b/gi, 'SMALLINT')
    .replace(/ENUM\s*\([^)]+\)/gi, 'VARCHAR(100)')
    .replace(/\bDATETIME\b/gi, 'TIMESTAMP')
    .replace(/\)\s*ENGINE\s*=\s*InnoDB[^;]*/gi, ')')
    .replace(/\s+ON\s+UPDATE\s+CURRENT_TIMESTAMP/gi, '')
    .replace(/\bUNIQUE\s+KEY\s+(\w+)\s*(\([^)]+\))/gi, 'CONSTRAINT $1 UNIQUE $2')
    .replace(/,\s*(?:KEY|INDEX)\s+\w+\s*\([^)]+\)/gi, '')
    .replace(/,\s*FULLTEXT\s+\w+\s*\([^)]+\)/gi, '')
    .replace(/\bON\s+DUPLICATE\s+KEY\s+UPDATE\b[\s\S]*?(?=;|$)/gi, 'ON CONFLICT DO NOTHING')
    .replace(/INT\s*\(\d+\)/gi, 'INT')
    .replace(/VARCHAR\s*\(\s*255\s*\)/gi, 'VARCHAR(255)');

  // Extract only CREATE TABLE statements (skip INSERTs for now)
  const stmts = sql.split(';')
    .map(s => s.trim())
    .filter(s => s.length > 5 && /^\s*(CREATE|ALTER|DROP)/i.test(s));

  console.log(`   Found ${stmts.length} DDL statements to run.`);

  let ok = 0, errors = 0;
  for (const stmt of stmts) {
    const res = await apiRequest('POST', `/v1/projects/${PROJECT_REF}/database/query`, { query: stmt + ';' });
    if (res.status === 200) {
      ok++;
    } else {
      const msg = typeof res.body === 'object' ? res.body.message || res.body.error : res.body;
      if (msg && !msg.includes('already exists') && !msg.includes('duplicate')) {
        console.log(`   ⚠ ${msg.slice(0, 120)}`);
        errors++;
      } else {
        ok++; // already exists is fine
      }
    }
  }
  console.log(`   ✅ Schema: ${ok} OK, ${errors} errors`);

  // 3. Seed platform_settings
  console.log('\n3. Seeding platform settings...');
  const seedSQL = `
    INSERT INTO platform_settings (setting_key, setting_value, description) VALUES
    ('commission_rate','5.00','Commission percentage'),
    ('cost_per_kg','0.40','Delivery cost per kg'),
    ('cost_per_foot','0.60','Delivery cost per foot'),
    ('packaging_plastic','1.00','Packaging - plastic'),
    ('packaging_glass','1.50','Packaging - glass'),
    ('packaging_fragile','2.00','Packaging - fragile'),
    ('packaging_standard','1.00','Packaging - standard')
    ON CONFLICT (setting_key) DO NOTHING;
  `;
  const seedRes = await apiRequest('POST', `/v1/projects/${PROJECT_REF}/database/query`, { query: seedSQL });
  console.log(seedRes.status === 200 ? '   ✅ Settings seeded' : `   ⚠ ${JSON.stringify(seedRes.body)}`);

  // 4. Get connection string
  console.log('\n4. Fetching connection details...');
  const connInfo = await apiRequest('GET', `/v1/projects/${PROJECT_REF}/database/connection-pooling-config`);
  console.log('   Connection pooling:', JSON.stringify(connInfo.body, null, 2));

  const secrets = await apiRequest('GET', `/v1/projects/${PROJECT_REF}/secrets`);
  if (secrets.status === 200) {
    console.log('   Secrets available:', secrets.body.length);
  }

  console.log('\n=== Done ===');
  console.log(`\nDirect DB URL format:`);
  console.log(`postgresql://postgres:[YOUR-DB-PASSWORD]@db.${PROJECT_REF}.supabase.co:5432/postgres`);
  console.log(`\nPooler URL format (use if direct fails):`);
  console.log(`postgresql://postgres.[PROJECT_REF]:[YOUR-DB-PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
