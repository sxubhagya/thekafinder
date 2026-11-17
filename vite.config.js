import { defineConfig, loadEnv } from 'vite';

/**
 * Dev-only: serve the real serverless functions in /api through Vite, so
 * /api/places, /api/place-hours, /api/feedback and /api/report-issue all work
 * locally exactly as they do on Vercel (same code, no second copy to keep in sync).
 * Values from .env / .env.local are exposed to them as process.env.
 */
function apiDevPlugin(env) {
  return {
    name: 'api-dev-middleware',
    configureServer(server) {
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }

      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next();

        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const name = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
        if (!/^[a-z0-9-]+$/i.test(name)) return next();

        let handler;
        try {
          handler = (await server.ssrLoadModule(`/api/${name}.js`)).default;
        } catch (err) {
          if (err && /Failed to load url|Cannot find module|does not exist/i.test(String(err.message))) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: `No such endpoint: /api/${name}` }));
          }
          console.error(`Vite Dev: failed to load /api/${name}`, err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'Failed to load API handler', message: err.message }));
        }

        // Minimal Vercel-style req/res shims
        req.query = Object.fromEntries(url.searchParams);
        if (req.method === 'POST' || req.method === 'PUT') {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const raw = Buffer.concat(chunks).toString('utf8');
          try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = undefined; }
        }
        res.status = (code) => { res.statusCode = code; return res; };
        res.json = (payload) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(payload)); return res; };

        try {
          await handler(req, res);
        } catch (err) {
          console.error(`Vite Dev: /api/${name} threw`, err);
          if (!res.headersSent) res.status(500).json({ error: 'Handler error', message: err.message });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    css: { postcss: { plugins: [] } },
    server: { host: true, port: 5173, strictPort: true },
    plugins: [apiDevPlugin(env)],
  };
});
