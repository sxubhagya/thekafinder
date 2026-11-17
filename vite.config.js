import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Load environment variables from the current directory (including .env or .env.local)
  const env = loadEnv(mode, process.cwd(), '');

  return {
    css: {
      postcss: {
        plugins: []
      }
    },
    server: {
      host: true, // Listen on all local IP addresses
      port: 5173,
      strictPort: true
    },
    plugins: [
      {
        name: 'api-places-middleware',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            // Check if request is targeting the backend proxy path
            if (req.url && req.url.startsWith('/api/places')) {
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

              if (req.method === 'OPTIONS') {
                res.statusCode = 200;
                res.end();
                return;
              }

              try {
                const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
                const lat = urlObj.searchParams.get('lat');
                const lon = urlObj.searchParams.get('lon');
                const radius = urlObj.searchParams.get('radius') || '5000';

                if (!lat || !lon) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'Missing lat or lon query parameters' }));
                  return;
                }

                // Check for local API key
                const apiKey = env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
                if (!apiKey) {
                  console.warn('Vite Dev: GOOGLE_MAPS_API_KEY is not defined in your .env file. Returning empty list.');
                  res.statusCode = 200;
                  res.end(JSON.stringify({
                    error: 'Local key missing',
                    fallback: true,
                    results: []
                  }));
                  return;
                }

                const googleUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=${radius}&type=liquor_store&key=${apiKey}`;
                
                const response = await fetch(googleUrl);
                if (!response.ok) {
                  throw new Error(`Google API responded with status ${response.status}`);
                }

                const data = await response.json();

                if (data.status === 'ZERO_RESULTS') {
                  res.statusCode = 200;
                  res.end(JSON.stringify({ results: [] }));
                  return;
                }

                if (data.status !== 'OK') {
                  res.statusCode = 500;
                  res.end(JSON.stringify({
                    error: `Google API Error: ${data.status}`,
                    message: data.error_message,
                    fallback: true,
                    results: []
                  }));
                  return;
                }

                const results = (data.results || []).map(place => ({
                  id: place.place_id,
                  name: place.name || 'Liquor Store',
                  lat: place.geometry?.location?.lat,
                  lon: place.geometry?.location?.lng,
                  address: place.vicinity || 'Coordinates locked',
                  openNow: place.opening_hours?.open_now,
                  source: 'Google Maps'
                })).filter(place => place.lat !== undefined && place.lon !== undefined);

                res.statusCode = 200;
                res.end(JSON.stringify({ results }));

              } catch (error) {
                console.error('Vite Dev Server API proxy error:', error);
                res.statusCode = 500;
                res.end(JSON.stringify({
                  error: 'Local API proxy execution failed',
                  message: error.message,
                  fallback: true,
                  results: []
                }));
              }
            } else {
              next();
            }
          });
        }
      }
    ]
  };
});
