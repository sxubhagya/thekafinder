import pg from 'pg';

const { Pool } = pg;

// Easing serverless connection limits by reusing pool across requests
let pool = null;
let schemaInitialized = false;

// Global cache to track request rates per IP in warm serverless containers
const ipCache = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 5; // Maximum 5 issues per minute per IP to prevent spam

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
 * Ensures that the required table for issue reporting exists.
 */
async function ensureSchema(client) {
  if (schemaInitialized) return;
  
  await client.query(`
    CREATE TABLE IF NOT EXISTS issue_reports (
      id SERIAL PRIMARY KEY,
      city VARCHAR(255),
      country VARCHAR(255),
      lat DOUBLE PRECISION,
      lon DOUBLE PRECISION,
      issue_type VARCHAR(255) NOT NULL,
      description TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  
  schemaInitialized = true;
  console.log('Issue reports database schema verified/created successfully.');
}

/**
 * Main API Route Handler for reporting issues
 */
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Rate Limiting
  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait before reporting another issue.' });
  }

  const { city, country, lat, lon, issueType, description } = req.body;

  if (!issueType) {
    return res.status(400).json({ error: 'Missing required field: issueType' });
  }

  // Connect to Database
  let dbResult = null;
  const dbUrl = process.env.DATABASE_URL;

  if (dbUrl) {
    try {
      if (!pool) {
        pool = new Pool({
          connectionString: dbUrl,
          ssl: { rejectUnauthorized: false }
        });
      }
      const client = await pool.connect();
      try {
        await ensureSchema(client);
        const queryText = `
          INSERT INTO issue_reports (city, country, lat, lon, issue_type, description)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id;
        `;
        const values = [
          city || null,
          country || null,
          lat ? parseFloat(lat) : null,
          lon ? parseFloat(lon) : null,
          issueType,
          description || null
        ];
        const result = await client.query(queryText, values);
        dbResult = { id: result.rows[0].id, savedToDb: true };
      } finally {
        client.release();
      }
    } catch (dbErr) {
      console.error('Database save error:', dbErr);
      // Fallback: we still try to email even if database fails so the report isn't lost
    }
  } else {
    console.warn('DATABASE_URL not set, running in memory-only simulation mode.');
  }

  // Send Email using Resend if API key is present
  let emailSent = false;
  let emailError = null;

  if (process.env.RESEND_API_KEY) {
    try {
      const recipient = process.env.NOTIFICATION_EMAIL || 'work.soubhagya@gmail.com';
      const sender = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
      
      const emailPayload = {
        from: `Theka Finder <${sender}>`,
        to: recipient,
        subject: `🚨 [Theka Finder Issue] ${issueType} in ${city || 'Unknown City'}, ${country || 'Unknown Country'}`,
        html: `
          <h2 style="color: #d9534f; font-family: sans-serif;">New Application Issue Report</h2>
          <p style="font-family: sans-serif; font-size: 14px;">A user has reported a problem on Theka Finder:</p>
          <table border="1" cellpadding="8" style="border-collapse: collapse; font-family: sans-serif; font-size: 14px; width: 100%; max-width: 600px;">
            <tr bgcolor="#f2f2f2">
              <td width="30%"><strong>Field</strong></td>
              <td><strong>Value</strong></td>
            </tr>
            <tr>
              <td><strong>City</strong></td>
              <td>${city || 'N/A'}</td>
            </tr>
            <tr>
              <td><strong>Country</strong></td>
              <td>${country || 'N/A'}</td>
            </tr>
            <tr>
              <td><strong>Coordinates</strong></td>
              <td>${lat && lon ? `${lat}, ${lon}` : 'N/A'}</td>
            </tr>
            <tr>
              <td><strong>Issue Type</strong></td>
              <td style="color: #d9534f; font-weight: bold;">${issueType}</td>
            </tr>
            <tr>
              <td><strong>Description</strong></td>
              <td>${description ? description.replace(/\n/g, '<br>') : 'None provided'}</td>
            </tr>
            <tr>
              <td><strong>Reported At</strong></td>
              <td>${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)</td>
            </tr>
            <tr>
              <td><strong>Saved to Database</strong></td>
              <td>${dbResult?.savedToDb ? 'Yes' : 'No'}</td>
            </tr>
          </table>
          <hr style="border: none; border-top: 1px solid #ccc; margin-top: 20px;">
          <p style="font-size: 11px; color: #777; font-family: sans-serif;">This email was sent automatically from your Vercel serverless function.</p>
        `
      };

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify(emailPayload)
      });

      if (emailRes.ok) {
        emailSent = true;
      } else {
        const errText = await emailRes.text();
        emailError = errText;
        console.error('Resend API error:', errText);
      }
    } catch (emailErr) {
      console.error('Failed to send email:', emailErr);
      emailError = emailErr.message;
    }
  } else {
    console.log('RESEND_API_KEY not configured, skipping email dispatch.');
  }

  return res.status(200).json({
    success: true,
    message: 'Issue report processed.',
    dbStatus: dbResult || { savedToDb: false, reason: dbUrl ? 'DB Error' : 'No Database Connection' },
    emailStatus: { sent: emailSent, error: emailError || null }
  });
}
