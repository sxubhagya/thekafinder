import pg from 'pg';
import { getClientIp, createRateLimiter, escapeHtml, clampStr, boundedNumber } from '../lib/http.js';

const { Pool } = pg;

// Easing serverless connection limits by reusing pool across requests
let pool = null;
let schemaInitialized = false;

const isLimited = createRateLimiter({ windowMs: 60 * 1000, max: 5 }); // 5 reports a minute per IP

/**
 * TLS to the database is verified by default. If your provider needs the old
 * behaviour, set DATABASE_SSL_INSECURE=1 in the environment (not recommended).
 */
const sslConfig = () => (process.env.DATABASE_SSL_INSECURE === '1' ? { rejectUnauthorized: false } : { rejectUnauthorized: true });

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (isLimited(getClientIp(req))) {
    return res.status(429).json({ error: 'Too many requests. Please wait before reporting another issue.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : null;
  if (!body) return res.status(400).json({ error: 'Expected a JSON body.' });

  // Everything user-supplied is trimmed and length-capped before it goes anywhere.
  const city = clampStr(body.city, 120) || null;
  const country = clampStr(body.country, 120) || null;
  const issueType = clampStr(body.issueType, 120);
  const description = clampStr(body.description, 2000) || null;
  const lat = boundedNumber(body.lat, -90, 90);
  const lon = boundedNumber(body.lon, -180, 180);

  if (!issueType) return res.status(400).json({ error: 'Missing required field: issueType' });

  let dbResult = null;
  const dbUrl = process.env.DATABASE_URL;

  if (dbUrl) {
    try {
      if (!pool) pool = new Pool({ connectionString: dbUrl, ssl: sslConfig() });
      const client = await pool.connect();
      try {
        await ensureSchema(client);
        const result = await client.query(
          `INSERT INTO issue_reports (city, country, lat, lon, issue_type, description)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;`,
          [city, country, lat, lon, issueType, description]
        );
        dbResult = { id: result.rows[0].id, savedToDb: true };
      } finally {
        client.release();
      }
    } catch (dbErr) {
      console.error('Database save error:', dbErr);
      // Still try to email so the report is not lost.
    }
  } else {
    console.warn('DATABASE_URL not set, running in memory-only simulation mode.');
  }

  let emailSent = false;
  let emailError = null;
  const recipient = process.env.NOTIFICATION_EMAIL;

  if (process.env.RESEND_API_KEY && recipient) {
    try {
      const sender = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
      const row = (label, value) => `<tr><td><strong>${label}</strong></td><td>${value}</td></tr>`;
      const emailPayload = {
        from: `Theka Finder <${sender}>`,
        to: recipient,
        subject: `[Theka Finder Issue] ${issueType.replace(/[\r\n]+/g, ' ')} in ${(city || 'Unknown City').replace(/[\r\n]+/g, ' ')}`,
        html: `
          <h2 style="color: #d9534f; font-family: sans-serif;">New Application Issue Report</h2>
          <p style="font-family: sans-serif; font-size: 14px;">A user has reported a problem on Theka Finder:</p>
          <table border="1" cellpadding="8" style="border-collapse: collapse; font-family: sans-serif; font-size: 14px; width: 100%; max-width: 600px;">
            <tr bgcolor="#f2f2f2"><td width="30%"><strong>Field</strong></td><td><strong>Value</strong></td></tr>
            ${row('City', escapeHtml(city || 'N/A'))}
            ${row('Country', escapeHtml(country || 'N/A'))}
            ${row('Coordinates', lat !== null && lon !== null ? `${lat}, ${lon}` : 'N/A')}
            ${row('Issue Type', `<span style="color: #d9534f; font-weight: bold;">${escapeHtml(issueType)}</span>`)}
            ${row('Description', description ? escapeHtml(description).replace(/\n/g, '<br>') : 'None provided')}
            ${row('Reported At', `${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)`)}
            ${row('Saved to Database', dbResult?.savedToDb ? 'Yes' : 'No')}
          </table>
          <hr style="border: none; border-top: 1px solid #ccc; margin-top: 20px;">
          <p style="font-size: 11px; color: #777; font-family: sans-serif;">Sent automatically from your Vercel serverless function.</p>`,
      };

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        body: JSON.stringify(emailPayload),
      });

      if (emailRes.ok) {
        emailSent = true;
      } else {
        emailError = await emailRes.text();
        console.error('Resend API error:', emailError);
      }
    } catch (emailErr) {
      console.error('Failed to send email:', emailErr);
      emailError = emailErr.message;
    }
  } else if (process.env.RESEND_API_KEY && !recipient) {
    console.warn('NOTIFICATION_EMAIL is not set, so issue emails are skipped. Set it in the Vercel project settings.');
  } else {
    console.log('RESEND_API_KEY not configured, skipping email dispatch.');
  }

  return res.status(200).json({
    success: true,
    message: 'Issue report processed.',
    dbStatus: dbResult || { savedToDb: false, reason: dbUrl ? 'DB Error' : 'No Database Connection' },
    emailStatus: { sent: emailSent, error: emailError || null },
  });
}
