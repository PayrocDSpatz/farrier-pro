import admin from "firebase-admin";

// 1) Download a service account JSON from Firebase Console:
// Project Settings → Service Accounts → Generate new private key
// Save it as: ./serviceAccountKey.json (DON'T commit it)

admin.initializeApp({
  credential: admin.credential.cert("./serviceAccountKey.json"),
});

const db = admin.firestore();
const auth = admin.auth();

function normEmail(e) {
  return (e || "").trim().toLowerCase();
}

async function main() {
  const farriersSnap = await db.collection("farriers").get();

  let scanned = 0;
  let updated = 0;
  let skippedMissingEmail = 0;
  let skippedAlreadySet = 0;
  let notFoundAuth = 0;
  let multipleAuth = 0;

  for (const doc of farriersSnap.docs) {
    scanned++;

    const data = doc.data() || {};
    const email = normEmail(data.email);

    if (!email) {
      skippedMissingEmail++;
      continue;
    }

    // If already set, skip
    if (data.ownerUid && String(data.ownerUid).trim() !== "") {
      skippedAlreadySet++;
      continue;
    }

    // Find Auth user by email
    try {
      const user = await auth.getUserByEmail(email);

      // Write ownerUid
      await doc.ref.update({
        ownerUid: user.uid,
        // optional: store normalized email if you want consistency
        // email: email,
      });

      updated++;
      console.log(`✅ Updated farrier ${doc.id}: ownerUid=${user.uid} (${email})`);
    } catch (err) {
      // If user not found
      if (String(err?.code || "").includes("auth/user-not-found")) {
        notFoundAuth++;
        console.log(`⚠️ No Auth user for farrier ${doc.id} email=${email}`);
        continue;
      }
      console.error(`❌ Error on farrier ${doc.id} email=${email}`, err);
    }
  }

  console.log("\n--- Summary ---");
  console.log({ scanned, updated, skippedMissingEmail, skippedAlreadySet, notFoundAuth, multipleAuth });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
