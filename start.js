const { spawn } = require('child_process');
const path = require('path');

console.log('');
console.log('╔══════════════════════════════════════════════════════╗');
console.log('║         RESCO CBT Platform - Starting...            ║');
console.log('╚══════════════════════════════════════════════════════╝');
console.log('');

// Start backend
const backend = spawn('node', ['src/server.js'], {
  cwd: path.join(__dirname, 'backend'),
  stdio: 'pipe',
  env: { ...process.env },
});
backend.stdout.on('data', (d) => console.log('[Backend] ' + d.toString().trim()));
backend.stderr.on('data', (d) => console.error('[Backend] ' + d.toString().trim()));
backend.on('error', (err) => console.error('Backend failed:', err.message));

// Start frontend (Vite)
const frontend = spawn('npx', ['vite', '--host', '0.0.0.0', '--port', '5173'], {
  cwd: path.join(__dirname, 'frontend'),
  stdio: 'pipe',
});
frontend.stdout.on('data', (d) => console.log('[Frontend] ' + d.toString().trim()));
frontend.stderr.on('data', (d) => console.error('[Frontend] ' + d.toString().trim()));
frontend.on('error', (err) => console.error('Frontend failed:', err.message));

console.log('Backend:  http://localhost:5000');
console.log('Frontend: http://localhost:5173');
console.log('');
console.log('Press Ctrl+C to stop both servers.');
console.log('');

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  backend.kill();
  frontend.kill();
  process.exit(0);
});
