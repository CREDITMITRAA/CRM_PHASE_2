// config/firebase.js
const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const serviceAccountPath = path.join(__dirname, "../calldialerapp-86ee1-firebase-adminsdk-fbsvc-ca8ae684b2.json");

if (!fs.existsSync(serviceAccountPath)) {
  console.error("❌ Missing Firebase Admin SDK JSON file:", serviceAccountPath);
  process.exit(1);
}

// Initialize Firebase only once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath)),
  });
  console.log("🔥 Firebase Admin initialized (singleton)");
} else {
  console.log("⚡ Firebase Admin already initialized, reusing instance");
}

module.exports = admin;