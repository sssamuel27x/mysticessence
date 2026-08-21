const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const email = process.argv[2];
if (!email) {
  console.error("Usage: node set-admin.js admin@example.com");
  process.exit(1);
}

initializeApp({ credential: applicationDefault() });

getAuth().getUserByEmail(email)
  .then(async (user) => {
    await getAuth().setCustomUserClaims(user.uid, { admin: true });
    console.log(`Admin permission granted to ${email}. Sign out and back in to refresh it.`);
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
