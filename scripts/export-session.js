const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const AUTH_DIR = path.join(__dirname, '..', 'data', 'auth_info_baileys');

function exportSession() {
  if (!fs.existsSync(AUTH_DIR)) {
    console.error('Error: Auth directory not found at', AUTH_DIR);
    process.exit(1);
  }

  const files = fs.readdirSync(AUTH_DIR);
  if (files.length === 0) {
    console.error('Error: No authentication files found. Connect your WhatsApp first.');
    process.exit(1);
  }

  const sessionObj = {};
  for (const file of files) {
    const fullPath = path.join(AUTH_DIR, file);
    if (fs.statSync(fullPath).isFile()) {
      sessionObj[file] = fs.readFileSync(fullPath, 'utf-8');
    }
  }

  const jsonStr = JSON.stringify(sessionObj);
  const compressed = zlib.gzipSync(Buffer.from(jsonStr, 'utf-8'));
  const base64 = compressed.toString('base64');

  console.log('\n========================================================================');
  console.log('       🔐 WHATSAPP CLOUD SESSION EXPORT (COPY THE VALUE BELOW)');
  console.log('========================================================================\n');
  console.log(`WA_SESSION_BASE64=${base64}\n`);
  console.log('========================================================================');
  console.log('💡 How to use:');
  console.log('Paste this variable (WA_SESSION_BASE64) into your Railway / Render');
  console.log('Environment Variables dashboard. Your cloud scheduler will boot up');
  console.log('automatically connected without needing to scan any QR code again!');
  console.log('========================================================================\n');
}

exportSession();
