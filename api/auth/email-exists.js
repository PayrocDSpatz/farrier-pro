import admin from "firebase-admin";

function initFirebaseAdmin() {
  if (admin.apps.length) return;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON env var");

  const serviceAccount = JSON.parse(raw);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export default async function handler(req, res) {
  // Basic CORS (safe for same-domain; helpful for local dev)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, message: "Method not allowed" });

  try {
    initFirebaseAdmin();

    const { email } = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    if (!email) return res.status(400).json({ success: false, message: "Missing email" });

    try {
      await admin.auth().getUserByEmail(String(email).trim().toLowerCase());
      return res.status(200).json({ success: true, exists: true });
    } catch (err) {
      // Firebase throws auth/user-not-found when it doesn't exist
      if (err?.code === "auth/user-not-found") {
        return res.status(200).json({ success: true, exists: false });
      }
      throw err;
    }
  } catch (e) {
    return res.status(500).json({ success: false, message: e?.message || "Server error" });
  }
}
