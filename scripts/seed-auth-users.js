#!/usr/bin/env node

/**
 * Firebase Auth seeding script.
 *
 * Usage:
 *   node scripts/seed-auth-users.js ./seed-data/users.json
 *
 * Requirements:
 *   - npm install firebase-admin
 *   - FIREBASE_SERVICE_ACCOUNT env var pointing to your service-account json,
 *     or place ./serviceAccountKey.json next to this script.
 */

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const DEFAULT_USERS_FILE = path.resolve("seed-data/users.json");
const SERVICE_ACCOUNT_PATH =
    process.env.FIREBASE_SERVICE_ACCOUNT || path.resolve("serviceAccountKey.json");

function readJson(filePath, label) {
    try {
        const resolved = path.resolve(filePath);
        const raw = fs.readFileSync(resolved, "utf8");
        return JSON.parse(raw);
    } catch (err) {
        console.error(`\n✖ Failed to read ${label} at ${filePath}`);
        console.error(err.message);
        process.exit(1);
    }
}

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error(
        `\n✖ Service account JSON not found. Set FIREBASE_SERVICE_ACCOUNT or place serviceAccountKey.json next to this script.`,
    );
    process.exit(1);
}

const serviceAccount = readJson(SERVICE_ACCOUNT_PATH, "service account");
if (!serviceAccount.project_id) {
    console.error("\n✖ Service account JSON missing project_id.");
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const usersFile = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_USERS_FILE;
const users = readJson(usersFile, "users list");

if (!Array.isArray(users) || users.length === 0) {
    console.log("\n⚠ No users found to seed.");
    process.exit(0);
}

const auth = admin.auth();

async function upsertUser(entry) {
    const { claims, ...userData } = entry;
    if (!userData.email) throw new Error("user entry missing email");
    try {
        const existing = await auth.getUserByEmail(userData.email);
        await auth.updateUser(existing.uid, userData);
        if (claims) await auth.setCustomUserClaims(existing.uid, claims);
        console.log(`↻ Updated ${userData.email}`);
    } catch (err) {
        if (err.code === "auth/user-not-found") {
            const created = await auth.createUser(userData);
            if (claims) await auth.setCustomUserClaims(created.uid, claims);
            console.log(`✓ Created ${userData.email}`);
        } else {
            throw err;
        }
    }
}

(async () => {
    console.log(`\nSeeding ${users.length} Firebase Auth user(s)…`);
    for (const user of users) {
        try {
            await upsertUser(user);
        } catch (err) {
            console.error(`✖ Failed for ${user.email}: ${err.message}`);
        }
    }
    console.log("\nDone.");
    process.exit(0);
})();
