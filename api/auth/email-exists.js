module.exports = async (req, res) => {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") return res.status(405).json({ success: false, message: "Method not allowed" });

    const apiKey = process.env.FIREBASE_WEB_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: "Missing FIREBASE_WEB_API_KEY env var (set it in this Vercel project, then redeploy)",
      });
    }

    // Robust body handling
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    body = body || {};

    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ success: false, message: "Missing email" });

    const url = `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${apiKey}`;

    // Use global fetch if available (Node 18+). If not, this will throw and we'll report it.
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: email, continueUri: "https://localhost" }),
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      return res.status(200).json({
  success: true,
  exists: Boolean(data?.registered),
  debug: {
    receivedEmail: email,
    apiKeyPrefix: apiKey.slice(0, 10),
    firebaseResponseKeys: Object.keys(data || {}),
    registeredRaw: data?.registered
  }
});
