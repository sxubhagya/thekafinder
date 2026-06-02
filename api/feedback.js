import pg from 'pg';

const { Pool } = pg;

// Easing serverless connection limits by reusing pool across requests
let pool = null;
let schemaInitialized = false;

// Tiny in-memory database fallback for local/mock environments without DATABASE_URL
const memoryStore = new Map();

/**
 * Ensures that the required table exists in the PostgreSQL database.
 */
async function ensureSchema(client) {
  if (schemaInitialized) return;
  
  await client.query(`
    CREATE TABLE IF NOT EXISTS store_reports (
      id SERIAL PRIMARY KEY,
      store_id VARCHAR(255) NOT NULL,
      store_name VARCHAR(255),
      status VARCHAR(10) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
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
        
        // Filter reports in the last 12 hours (mock logic: all reports in memory are within 12h for ease)
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
      const { store_id, store_name, status } = req.body || {};

      if (!store_id || !status) {
        return res.status(400).json({ success: false, error: 'Missing store_id or status in request body' });
      }

      if (status !== 'open' && status !== 'closed') {
        return res.status(400).json({ success: false, error: "Status must be either 'open' or 'closed'" });
      }

      if (!hasDb) {
        // Fallback: Save to in-memory memoryStore
        if (!memoryStore.has(store_id)) {
          memoryStore.set(store_id, []);
        }
        memoryStore.get(store_id).push({
          status,
          createdAt: new Date().toISOString()
        });

        return res.status(200).json({
          success: true,
          mode: 'offline-fallback',
          message: 'Feedback recorded successfully (in-memory offline fallback)'
        });
      }

      // Write to database
      const client = await pool.connect();
      try {
        await ensureSchema(client);
        
        await client.query(`
          INSERT INTO store_reports (store_id, store_name, status) 
          VALUES ($1, $2, $3)
        `, [store_id, store_name || 'Unknown Store', status]);

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
