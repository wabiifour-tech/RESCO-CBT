// ── Self-healing migration for TeacherAssignment removal ──
// Runs raw SQL directly via psql, completely independent of Prisma Client.
// This MUST complete before Prisma Client connects, because the Prisma schema
// expects class_name/subject/teacher_id columns on the exams table.

const { execSync } = require('child_process');
const path = require('path');

function runMigration() {
  const sqlFile = path.join(__dirname, 'prisma', 'migration.sql');

  try {
    console.log('[Migration] Starting database schema migration...');

    // Extract the connection details from DATABASE_URL
    // Format: postgresql://user:password@host:port/database
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error('[Migration] ERROR: DATABASE_URL not set. Skipping migration.');
      return;
    }

    // Run the SQL file using psql
    const result = execSync(
      `psql "${dbUrl}" -f "${sqlFile}" 2>&1`,
      {
        encoding: 'utf-8',
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    console.log('[Migration] Output:', result.trim());
    console.log('[Migration] Completed successfully.');
  } catch (err) {
    console.error('[Migration] Error running migration:', err.stderr || err.stdout || err.message);
    console.error('[Migration] Attempting to continue anyway...');
  }
}

// Run immediately on require (before server.js does anything with Prisma)
runMigration();

module.exports = { runMigration };
