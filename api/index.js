const admin = require('firebase-admin');

function getPrivateKey() {
  let key = process.env.FIREBASE_PRIVATE_KEY || '';
  // If the key is flattened into a single line, put the newlines back in
  if (!key.includes('\n') && key.includes('-----BEGIN PRIVATE KEY-----')) {
    key = key
      .replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
      .replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----');
    
    // Insert newlines every 64 characters for the body of the key
    const bodyMatch = key.match(/-----BEGIN PRIVATE KEY-----\n([\s\S]*)\n-----END PRIVATE KEY-----/);
    if (bodyMatch) {
      let body = bodyMatch[1].replace(/\s+/g, '');
      let formattedBody = body.match(/.{1,64}/g).join('\n');
      key = `-----BEGIN PRIVATE KEY-----\n${formattedBody}\n-----END PRIVATE KEY-----`;
    }
  }
  return key;
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: getPrivateKey(),
    }),
  });
}
