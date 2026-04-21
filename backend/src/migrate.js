// ── Schema sync: Ensure database matches Prisma schema ──
// This runs prisma db push INSIDE the Node.js process before Prisma Client connects.
// This is the most reliable approach because prisma CLI is already installed and
// handles all column additions/drops/foreign key changes automatically.

const { execSync } = require('child_process');

function syncSchema() {
  try {
    console.log('[Schema Sync] Running prisma db push to sync database schema...');

    const output = execSync(
      'npx prisma db push --skip-generate --accept-data-loss 2>&1',
      {
        encoding: 'utf-8',
        timeout: 60000,
        cwd: require('path').join(__dirname, '..'),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      }
    );

    console.log('[Schema Sync] Output:', output.trim());
    console.log('[Schema Sync] Completed successfully.');
  } catch (err) {
    // prisma db push may return non-zero exit code even on success for some operations
    const output = (err.stdout || '') + (err.stderr || '');
    console.log('[Schema Sync] Output:', output.trim());

    if (output.includes('The database is already in sync') || output.includes('Everything is now in sync') || output.includes('Your database is now in sync')) {
      console.log('[Schema Sync] Database was already in sync. OK.');
    } else {
      console.error('[Schema Sync] WARNING: prisma db push had issues. See output above.');
    }
  }
}

// Run immediately on require
syncSchema();

module.exports = { syncSchema };
