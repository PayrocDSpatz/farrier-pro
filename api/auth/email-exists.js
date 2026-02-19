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

    // Safely handle body whether it's already an object or a string
    const body =
      req.body && typeof req.body === "object"
        ? req.body
        : JSON.parse(req.body || "{}");

    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ success: false, message: "Missing email" });

    const url = `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${apiKey}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: email,
        continueUri: "https://localhost", // required field; any valid URL works
      }),
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      const msg = data?.error?.message || "unknown_error";
      return res.status(200).json({ success: false, exists: null, error: msg });
    }

    // This is the key field we want:
    const exists = Boolean(data?.registered);

    return res.status(200).json({ success: true, exists });
  } catch (e) {
    return res.status
