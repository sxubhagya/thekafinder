import pg from 'pg';

const { Pool } = pg;

// Easing serverless connection limits by reusing pool across requests
let pool = null;
let schemaInitialized = false;

// Tiny in-memory database fallback for local/mock environments without DATABASE_URL
const memoryStore = new Map();

// Global cache to track request rates per IP in warm serverless containers
const ipCache = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 15; // Maximum 15 requests per minute per IP for feedback

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown-ip';
}

function isRateLimited(ip) {
  const now = Date.now();
  if (!ipCache.has(ip)) {
    ipCache.set(ip, []);
  }
  const timestamps = ipCache.get(ip).filter(time => now - time < RATE_LIMIT_WINDOW);
  timestamps.push(now);
  ipCache.set(ip, timestamps);
  return timestamps.length > MAX_REQUESTS;
}

/**
 * Ensures that the required table exists and matches the deduplicated upsert schema.
 */
async function ensureSchema(client) {
  if (schemaInitialized) return;
  
  // 1. Create table structure if not exists (new setups)
  await client.query(`
    CREATE TABLE IF NOT EXISTS store_reports (
      id SERIAL PRIMARY KEY,
      store_id VARCHAR(255) NOT NULL,
      user_id VARCHAR(255) NOT NULL,
      store_name VARCHAR(255),
      status VARCHAR(10) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_store_user UNIQUE (store_id, user_id)
    );
  `);
  
  // 2. ALTER table migrations (for existing setups created before this change)
  const checkUserCol = await client.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'store_reports' AND column_name = 'user_id'
  `);
  
  if (checkUserCol.rows.length === 0) {
    console.log('Migrating: Adding user_id column to store_reports...');
    await client.query(`ALTER TABLE store_reports ADD COLUMN user_id VARCHAR(255);`);
    await client.query(`UPDATE store_reports SET user_id = 'legacy_user' WHERE user_id IS NULL;`);
    await client.query(`ALTER TABLE store_reports ALTER COLUMN user_id SET NOT NULL;`);
  }

  const checkConstraint = await client.query(`
    SELECT constraint_name 
    FROM information_schema.table_constraints 
    WHERE table_name = 'store_reports' AND constraint_name = 'unique_store_user'
  `);
  
  if (checkConstraint.rows.length === 0) {
    console.log('Migrating: Adding unique_store_user constraint to store_reports...');
    // Delete older duplicate user feedback before creating constraint
    await client.query(`
      DELETE FROM store_reports a USING store_reports b 
      WHERE a.id < b.id AND a.store_id = b.store_id AND a.user_id = b.user_id;
    `);
    await client.query(`
      ALTER TABLE store_reports ADD CONSTRAINT unique_store_user UNIQUE (store_id, user_id);
    `);
  }
  
  // 3. Create index for fast lookups
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_store_reports_lookup 
    ON store_reports(store_id, created_at DESC);
  `);
  
  schemaInitialized = true;
  console.log('Database schema verified/created successfully.');
}

/**
 * Main API Route Handler for crowdsourced feedback
 */
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Apply IP-based Rate Limiting
  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp)) {
    console.warn(`Feedback Rate limit exceeded for IP: ${clientIp}`);
    return res.status(429).json({
      success: false,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please wait a minute before making more reports.'
    });
  }

  const hasDb = !!process.env.DATABASE_URL;

  // Lazy initialize database pool
  if (hasDb && !pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }

  try {
    if (req.method === 'GET') {
      const { store_id } = req.query;
      
      if (!store_id) {
        return res.status(400).json({ success: false, error: 'Missing store_id query parameter' });
      }

      if (!hasDb) {
        // Fallback: Read from in-memory memoryStore
        const reports = memoryStore.get(store_id) || [];
        const lastReport = reports[reports.length - 1] || null;
        
        // Filter reports in the last 12 hours
        const openCount = reports.filter(r => r.status === 'open').length;
        const closedCount = reports.filter(r => r.status === 'closed').length;
        const totalCount = reports.length;
        const openPercentage = totalCount > 0 ? Math.round((openCount / totalCount) * 100) : 0;

        return res.status(200).json({
          success: true,
          mode: 'offline-fallback',
          lastReport: lastReport ? { status: lastReport.status, createdAt: lastReport.createdAt } : null,
          stats12h: {
            openCount,
            closedCount,
            totalCount,
            openPercentage
          }
        });
      }

      // Query database
      const client = await pool.connect();
      try {
        await ensureSchema(client);

        // 1. Get the last report
        const lastReportRes = await client.query(`
          SELECT status, created_at 
          FROM store_reports 
          WHERE store_id = $1 
          ORDER BY created_at DESC 
          LIMIT 1
        `, [store_id]);
        
        const lastReport = lastReportRes.rows[0] || null;

        // 2. Get counts in last 12 hours
        const statsRes = await client.query(`
          SELECT status, COUNT(*) as count 
          FROM store_reports 
          WHERE store_id = $1 AND created_at >= NOW() - INTERVAL '12 hours' 
          GROUP BY status
        `, [store_id]);

        let openCount = 0;
        let closedCount = 0;
        
        statsRes.rows.forEach(row => {
          if (row.status === 'open') openCount = parseInt(row.count, 10);
          if (row.status === 'closed') closedCount = parseInt(row.count, 10);
        });

        const totalCount = openCount + closedCount;
        const openPercentage = totalCount > 0 ? Math.round((openCount / totalCount) * 100) : 0;

        return res.status(200).json({
          success: true,
          mode: 'database',
          lastReport: lastReport ? { status: lastReport.status, createdAt: lastReport.created_at } : null,
          stats12h: {
            openCount,
            closedCount,
            totalCount,
            openPercentage
          }
        });
      } finally {
        client.release();
      }

    } else if (req.method === 'POST') {
      const { store_id, user_id, store_name, status } = req.body || {};

      if (!store_id || !status) {
        return res.status(400).json({ success: false, error: 'Missing store_id or status in request body' });
      }

      const activeUserId = user_id || 'anonymous_user';

      if (status !== 'open' && status !== 'closed') {
        return res.status(400).json({ success: false, error: "Status must be either 'open' or 'closed'" });
      }

      if (!hasDb) {
        // Fallback: Save to in-memory memoryStore with upsert logic
        if (!memoryStore.has(store_id)) {
          memoryStore.set(store_id, []);
        }
        const reports = memoryStore.get(store_id);
        const existingIndex = reports.findIndex(r => r.user_id === activeUserId);
        
        if (existingIndex !== -1) {
          reports[existingIndex].status = status;
          reports[existingIndex].createdAt = new Date().toISOString();
        } else {
          reports.push({
            user_id: activeUserId,
            status,
            createdAt: new Date().toISOString()
          });
        }

        return res.status(200).json({
          success: true,
          mode: 'offline-fallback',
          message: 'Feedback recorded successfully (in-memory offline fallback)'
        });
      }

      // Write to database with UPSERT (ON CONFLICT DO UPDATE)
      const client = await pool.connect();
      try {
        await ensureSchema(client);
        
        await client.query(`
          INSERT INTO store_reports (store_id, user_id, store_name, status, created_at) 
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (store_id, user_id) 
          DO UPDATE SET status = EXCLUDED.status, created_at = NOW()
        `, [store_id, activeUserId, store_name || 'Unknown Store', status]);

        return res.status(200).json({
          success: true,
          mode: 'database',
          message: 'Feedback recorded successfully'
        });
      } finally {
        client.release();
      }
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
    }
  } catch (error) {
    console.error('API Error in /api/feedback:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
}
