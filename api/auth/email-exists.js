export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const apiKey = process.env.FIREBASE_WEB_API_KEY;
    if (!apiKey) throw new Error("Missing FIREBASE_WEB_API_KEY env var");

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ success: false, message: "Missing email" });

    // Use Identity Toolkit "signInWithPassword" to infer existence:
    // - EMAIL_NOT_FOUND => does not exist
    // - INVALID_PASSWORD => exists (email is real but password wrong)
    // - TOO_MANY_ATTEMPTS_TRY_LATER => treat as exists/unknown (rate limit)
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password: "__dummy_password__never_correct__",
        returnSecureToken: false,
      }),
    });

    const data = await r.json().catch(() => ({}));

    if (r.ok) {
      // This would be unexpected with a dummy password, but handle anyway.
      return res.status(200).json({ success: true, exists: true });
    }

    const msg = data?.error?.message || "";

    if (msg === "EMAIL_NOT_FOUND") {
      return res.status(200).json({ success: true, exists: false });
    }

    if (msg === "INVALID_PASSWORD") {
      return res.status(200).json({ success: true, exists: true });
    }

    if (msg === "TOO_MANY_ATTEMPTS_TRY_LATER") {
      // Safer UX: assume exists (or block signup briefly) to avoid duplicates
      return res.status(200).json({ success: true, exists: true, note: "rate_limited" });
    }

    // Any other error: return details for debugging
    return res.status(200).json({ success: false, exists: null, error: msg || "unknown_error" });
  } catch (e) {
    return res.status(500).json({ success: false, message: e?.message || "Server error" });
  }
}
