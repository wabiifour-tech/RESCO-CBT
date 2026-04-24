#!/usr/bin/env node
/**
 * RESCO-CBT LAN Setup Helper
 * Run this on the server PC to configure local network access.
 * Usage: node setup-lan.js
 */
const os = require('os');
const fs = require('fs');
const path = require('path');

function getLanIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

function updateEnvFile(filePath, updates) {
  let content = '';
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf-8');
  }
  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  }
  fs.writeFileSync(filePath, content.trim() + '\n', 'utf-8');
  console.log(`  Updated: ${filePath}`);
}

const lanIP = getLanIP();

if (!lanIP) {
  console.error('ERROR: Could not detect LAN IP address.');
  console.error('Make sure this PC is connected to a network (WiFi or Ethernet).');
  process.exit(1);
}

console.log('');
console.log('========================================');
console.log('  RESCO-CBT LAN Setup');
console.log('========================================');
console.log('');
console.log(`  Detected LAN IP: ${lanIP}`);
console.log('');

// Update frontend/.env
const frontendEnv = path.join(__dirname, 'frontend', '.env');
updateEnvFile(frontendEnv, {
  VITE_API_URL: `http://${lanIP}:5000/api`,
});

// Update backend .env
const backendEnv = path.join(__dirname, '.env');
updateEnvFile(backendEnv, {
  CLIENT_URL: `http://${lanIP}:5173`,
});

console.log('');
console.log('========================================');
console.log('  Setup Complete!');
console.log('========================================');
console.log('');
console.log(`  OTHER PCs should open: http://${lanIP}:5173`);
console.log('');
console.log('  To start the server, run:');
console.log('    node start.js');
console.log('');
console.log('  Make sure:');
console.log('    1. All PCs are on the same network');
console.log('    2. Windows Firewall allows ports 5000 and 5173');
console.log('    3. The server PC stays on during exams');
console.log('');
