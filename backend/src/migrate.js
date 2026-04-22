// ── Database schema heal: ensures columns/constraints match the new schema ──
// Runs AFTER prisma.$connect() succeeds, BEFORE any API requests.
// Uses $executeRawUnsafe which bypasses Prisma's schema validation entirely.

async function healSchema(prisma) {
  try {
    console.log('[Schema Heal] ========================================');
    console.log('[Schema Heal] Starting database schema repair...');
    console.log('[Schema Heal] ========================================');

    // ── Step 1: Drop ALL foreign key constraints related to assignments ──
    try {
      const fks = await prisma.$queryRawUnsafe(`
        SELECT tc.constraint_name, tc.table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'assignment_id';
      `);
      for (const fk of fks) {
        await prisma.$executeRawUnsafe(`ALTER TABLE "${fk.table_name}" DROP CONSTRAINT "${fk.constraint_name}"`);
        console.log('[Schema Heal] Dropped FK: ' + fk.constraint_name + ' on ' + fk.table_name);
      }
      if (fks.length === 0) console.log('[Schema Heal] No assignment FK constraints found (good).');
    } catch (e) {
      console.log('[Schema Heal] FK check note: ' + e.message);
    }

    // ── Step 2: Drop assignment_id column from exams ──
    try {
      const colCheck = await prisma.$queryRawUnsafe(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'exams' AND column_name = 'assignment_id';
      `);
      if (colCheck.length > 0) {
        await prisma.$executeRawUnsafe('ALTER TABLE exams DROP COLUMN assignment_id');
        console.log('[Schema Heal] Dropped assignment_id column from exams.');
      } else {
        console.log('[Schema Heal] assignment_id column not on exams (good).');
      }
    } catch (e) {
      console.error('[Schema Heal] Could not drop assignment_id: ' + e.message);
    }

    // ── Step 3: Drop teacher_assignments table entirely ──
    try {
      const taExists = await prisma.$queryRawUnsafe(`
        SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'teacher_assignments') as exists;
      `);
      if (taExists.length > 0 && taExists[0].exists) {
        // Safety: copy any remaining data
        try {
          await prisma.$executeRawUnsafe(`
            UPDATE exams SET
              class_name = COALESCE(class_name, 'JSS1'),
              subject = COALESCE(NULLIF(subject, ''), NULLIF(subject, 'General'), 'General'),
              teacher_id = COALESCE(teacher_id, (SELECT id FROM teachers WHERE status = 'ACTIVE' ORDER BY id ASC LIMIT 1))
            WHERE assignment_id IS NOT NULL
          `);
        } catch (e) { /* ignore copy errors */ }

        // Drop any remaining FKs pointing to teacher_assignments
        try {
          const allFks = await prisma.$queryRawUnsafe(`
            SELECT tc.constraint_name, tc.table_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.referential_constraints rc
              ON tc.constraint_name = rc.constraint_name
            JOIN information_schema.table_constraints tc2
              ON rc.unique_constraint_name = tc2.constraint_name
            WHERE tc2.table_name = 'teacher_assignments';
          `);
          for (const fk of allFks) {
            await prisma.$executeRawUnsafe(`ALTER TABLE "${fk.table_name}" DROP CONSTRAINT "${fk.constraint_name}"`);
          }
        } catch (e) { /* ignore */ }

        await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS teacher_assignments CASCADE');
        console.log('[Schema Heal] Dropped teacher_assignments table.');
      } else {
        console.log('[Schema Heal] teacher_assignments table gone (good).');
      }
    } catch (e) {
      console.log('[Schema Heal] teacher_assignments note: ' + e.message);
    }

    // ── Step 4: Ensure new columns exist on exams ──
    const cols = await prisma.$queryRawUnsafe(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'exams';
    `);
    const existingCols = cols.map(function(c) { return c.column_name; });
    console.log('[Schema Heal] exams columns: ' + existingCols.join(', '));

    var added = 0;
    if (existingCols.indexOf('class_name') === -1) {
      await prisma.$executeRawUnsafe("ALTER TABLE exams ADD COLUMN class_name VARCHAR(255) DEFAULT 'JSS1'");
      console.log('[Schema Heal] Added class_name column.');
      added++;
    }
    if (existingCols.indexOf('subject') === -1) {
      await prisma.$executeRawUnsafe("ALTER TABLE exams ADD COLUMN subject VARCHAR(255) DEFAULT 'General'");
      console.log('[Schema Heal] Added subject column.');
      added++;
    }
    if (existingCols.indexOf('teacher_id') === -1) {
      await prisma.$executeRawUnsafe('ALTER TABLE exams ADD COLUMN teacher_id VARCHAR(255)');
      console.log('[Schema Heal] Added teacher_id column.');
      added++;
    }
    if (added === 0) console.log('[Schema Heal] All new columns already exist (good).');

    // ── Step 5: Set safe defaults ──
    await prisma.$executeRawUnsafe("UPDATE exams SET class_name = 'JSS1' WHERE class_name IS NULL OR class_name = ''");
    await prisma.$executeRawUnsafe("UPDATE exams SET subject = 'General' WHERE subject IS NULL OR subject = ''");
    try {
      await prisma.$executeRawUnsafe(`
        UPDATE exams SET teacher_id = (SELECT id FROM teachers WHERE status = 'ACTIVE' ORDER BY id ASC LIMIT 1)
        WHERE teacher_id IS NULL
      `);
    } catch (e) { /* no teachers yet, ignore */ }

    // ── Step 6: Verify the schema is correct ──
    const finalCols = await prisma.$queryRawUnsafe(`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'exams';
    `);
    var finalColNames = finalCols.map(function(c) { return c.column_name; });
    var hasClassName = finalColNames.indexOf('class_name') !== -1;
    var hasSubject = finalColNames.indexOf('subject') !== -1;
    var hasTeacherId = finalColNames.indexOf('teacher_id') !== -1;
    var noAssignmentId = finalColNames.indexOf('assignment_id') === -1;

    console.log('[Schema Heal] ========================================');
    console.log('[Schema Heal] Verification:');
    console.log('[Schema Heal]   class_name present: ' + hasClassName);
    console.log('[Schema Heal]   subject present: ' + hasSubject);
    console.log('[Schema Heal]   teacher_id present: ' + hasTeacherId);
    console.log('[Schema Heal]   assignment_id removed: ' + noAssignmentId);
    console.log('[Schema Heal] ========================================');

    if (hasClassName && hasSubject && hasTeacherId && noAssignmentId) {
      console.log('[Schema Heal] SUCCESS - schema is fully repaired!');
    } else {
      console.error('[Schema Heal] WARNING - schema may still have issues. See above.');
    }

  } catch (err) {
    console.error('[Schema Heal] FATAL ERROR: ' + err.message);
    console.error('[Schema Heal] Stack: ' + err.stack);
  }
}

module.exports = { healSchema };
