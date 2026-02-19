module.exports = async (req, res) => {
  try {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(204).end();
    if (req.method !== "POST") {
      return res.status(405).json({ success: false, message: "Method not allowed" });
    }

    const apiKey = process.env.FIREBASE_WEB_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, message: "Missing FIREBASE_WEB_API_KEY env var" });
    }

    // Parse body safely
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    body = body || {};

    const email = String(body.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ success: false, message: "Missing email" });
    }

    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password: "__definitely_not_the_real_password__",
        returnSecureToken: false,
      }),
    });

    const data = await r.json().catch(() => ({}));
    const msg = data?.error?.message || "";

    if (msg === "EMAIL_NOT_FOUND") {
      return res.status(200).json({ success: true, exists: false });
    }

    if (msg === "INVALID_PASSWORD" || msg === "INVALID_LOGIN_CREDENTIALS") {
      return res.status(200).json({ success: true, exists: true });
    }

    return res.status(200).json({ success: false, exists: null, error: msg || "unknown_error" });
  } catch (e) {
    return res.status(500).json({ success: false, message: e?.message || "Function crashed" });
  }
};
