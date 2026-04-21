const path = require('path');
const vite = require(path.join(__dirname, 'frontend', 'node_modules', 'vite'));

(async () => {
  const server = await vite.createServer({
    root: path.join(__dirname, 'frontend'),
    server: { host: '0.0.0.0', port: 5173 },
  });
  await server.listen();
  console.log('Vite frontend running on http://localhost:5173');
})();
