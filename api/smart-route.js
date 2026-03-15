// /api/smart-route.js
// Server-side Google Routes API call for Smart Route optimisation.
// Uses GOOGLE_MAPS_API_KEY env var (same key as the Maps JS key, kept server-side
// so it is NOT subject to browser HTTP-referrer restrictions).
//
// POST body: { origin: "123 Main St...", stops: ["addr1", "addr2", ...] }
// Response:  { ok: true, order: [2,0,1,...], distanceMiles: "12.4", durationMinutes: 38,
//              legs: [{ distanceMi: "3.2", durationMin: 8 }, ...] }
//            legs[0] = origin→stop1, legs[1] = stop1→stop2, etc. (excludes return leg)

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { origin, stops } = req.body || {};
    if (!origin) return res.status(400).json({ ok: false, error: 'Missing origin' });
    if (!stops || stops.length < 2) return res.status(400).json({ ok: false, error: 'Need at least 2 stops' });
    if (!GOOGLE_MAPS_API_KEY) return res.status(500).json({ ok: false, error: 'GOOGLE_MAPS_API_KEY not configured' });

    const intermediates = stops.map(addr => ({ address: addr }));

    const body = {
      origin: { address: origin },
      destination: { address: origin },
      intermediates,
      travelMode: 'DRIVE',
      optimizeWaypointOrder: true,
      routingPreference: 'TRAFFIC_AWARE',
    };

    const routesRes = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.optimizedIntermediateWaypointIndex,routes.legs.distanceMeters,routes.legs.duration',
      },
      body: JSON.stringify(body),
    });

    const data = await routesRes.json();

    if (!routesRes.ok || !data.routes?.length) {
      console.error('Routes API error:', JSON.stringify(data));
      return res.status(502).json({ ok: false, error: data.error?.message || 'Routes API returned no routes' });
    }

    const route = data.routes[0];
    const order = route.optimizedIntermediateWaypointIndex || stops.map((_, i) => i);
    const distanceMeters = route.distanceMeters || 0;
    const durationSeconds = parseInt(route.duration?.replace('s', '') || '0', 10);

    // Build per-leg breakdown (exclude the final return-to-origin leg)
    const legs = (route.legs || []).slice(0, stops.length).map(leg => ({
      distanceMi: (( leg.distanceMeters || 0) / 1609.34).toFixed(1),
      durationMin: Math.round(parseInt((leg.duration || '0s').replace('s', ''), 10) / 60),
    }));

    return res.status(200).json({
      ok: true,
      order,
      distanceMiles: (distanceMeters / 1609.34).toFixed(1),
      durationMinutes: Math.round(durationSeconds / 60),
      legs,
    });
  } catch (err) {
    console.error('smart-route error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
