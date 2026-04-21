// ── Database schema heal: ensures columns/constraints match the new schema ──
// Uses $executeRawUnsafe which works regardless of schema mismatch.
// Prisma Client connection doesn't validate the DB schema — only model queries do.
// So we connect first, fix the schema, then all subsequent queries work.

async function healSchema(prisma) {
  try {
    console.log('[Schema Heal] Starting database schema repair...');

    // ── Step 1: Drop old foreign key constraints on exams.assignment_id ──
    // These point to teacher_assignments which is being removed
    try {
      const fks = await prisma.$queryRawUnsafe(`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'exams'
          AND constraint_type = 'FOREIGN KEY'
          AND constraint_name LIKE '%assignment%';
      `);
      for (const fk of fks) {
        await prisma.$executeRawUnsafe(`ALTER TABLE exams DROP CONSTRAINT IF EXISTS "${fk.constraint_name}"`);
        console.log(`[Schema Heal] Dropped FK constraint: ${fk.constraint_name}`);
      }
    } catch (e) {
      console.log('[Schema Heal] No assignment FK constraints to drop (OK):', e.message);
    }

    // ── Step 2: Drop assignment_id column from exams (new schema doesn't have it) ──
    try {
      const colCheck = await prisma.$queryRawUnsafe(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'exams' AND column_name = 'assignment_id';
      `);
      if (colCheck.length > 0) {
        await prisma.$executeRawUnsafe(`ALTER TABLE exams DROP COLUMN assignment_id`);
        console.log('[Schema Heal] Dropped assignment_id column from exams.');
      }
    } catch (e) {
      console.error('[Schema Heal] Could not drop assignment_id:', e.message);
    }

    // ── Step 3: Drop teacher_assignments table if it still exists ──
    try {
      const taExists = await prisma.$queryRawUnsafe(`
        SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'teacher_assignments') as exists;
      `);
      if (taExists[0].exists) {
        // Copy data to exams first (in case previous migration didn't run)
        try {
          await prisma.$executeRawUnsafe(`
            UPDATE exams e SET
              class_name = COALESCE(e.class_name, ta.class_name),
              subject = COALESCE(NULLIF(e.subject, 'General'), COALESCE(NULLIF(e.subject, ''), ta.subject)),
              teacher_id = COALESCE(e.teacher_id, ta.teacher_id)
            FROM teacher_assignments ta
            WHERE e.assignment_id = ta.id
          `);
          console.log('[Schema Heal] Copied data from teacher_assignments to exams.');
        } catch (copyErr) {
          console.log('[Schema Heal] Data copy note:', copyErr.message);
        }

        // Drop FK constraints pointing to teacher_assignments from other tables
        try {
          const otherFks = await prisma.$queryRawUnsafe(`
            SELECT constraint_name, table_name
            FROM information_schema.table_constraints
            WHERE constraint_type = 'FOREIGN KEY'
              AND constraint_name LIKE '%assignment%';
          `);
          for (const fk of otherFks) {
            await prisma.$executeRawUnsafe(`ALTER TABLE "${fk.table_name}" DROP CONSTRAINT IF EXISTS "${fk.constraint_name}"`);
            console.log(`[Schema Heal] Dropped FK ${fk.constraint_name} from ${fk.table_name}.`);
          }
        } catch (e) {
          console.log('[Schema Heal] No other FKs to drop:', e.message);
        }

        await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS teacher_assignments CASCADE`);
        console.log('[Schema Heal] Dropped teacher_assignments table.');
      }
    } catch (e) {
      console.log('[Schema Heal] teacher_assignments table note:', e.message);
    }

    // ── Step 4: Add new columns to exams if missing ──
    const cols = await prisma.$queryRawUnsafe(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'exams' AND column_name IN ('class_name', 'subject', 'teacher_id');
    `);
    const existingCols = cols.map(c => c.column_name);
    console.log('[Schema Heal] Columns on exams: class_name=' + (existingCols.includes('class_name') ? 'YES' : 'NO')
      + ', subject=' + (existingCols.includes('subject') ? 'YES' : 'NO')
      + ', teacher_id=' + (existingCols.includes('teacher_id') ? 'YES' : 'NO'));

    if (!existingCols.includes('class_name')) {
      await prisma.$executeRawUnsafe(`ALTER TABLE exams ADD COLUMN class_name VARCHAR(255) DEFAULT 'JSS1'`);
      console.log('[Schema Heal] Added class_name column.');
    }
    if (!existingCols.includes('subject')) {
      await prisma.$executeRawUnsafe(`ALTER TABLE exams ADD COLUMN subject VARCHAR(255) DEFAULT 'General'`);
      console.log('[Schema Heal] Added subject column.');
    }
    if (!existingCols.includes('teacher_id')) {
      await prisma.$executeRawUnsafe(`ALTER TABLE exams ADD COLUMN teacher_id VARCHAR(255)`);
      console.log('[Schema Heal] Added teacher_id column.');
    }

    // ── Step 5: Set safe defaults ──
    await prisma.$executeRawUnsafe(`UPDATE exams SET class_name = 'JSS1' WHERE class_name IS NULL OR class_name = ''`);
    await prisma.$executeRawUnsafe(`UPDATE exams SET subject = 'General' WHERE subject IS NULL OR subject = ''`);

    // Assign orphan exams to first active teacher
    try {
      await prisma.$executeRawUnsafe(`
        UPDATE exams e SET teacher_id = t.id
        FROM teachers t
        WHERE e.teacher_id IS NULL AND t.status = 'ACTIVE'
        AND t.id = (SELECT id FROM teachers WHERE status = 'ACTIVE' ORDER BY id ASC LIMIT 1);
      `);
    } catch (e) {
      console.log('[Schema Heal] Teacher assignment note:', e.message);
    }

    console.log('[Schema Heal] COMPLETE - database schema is ready.');
  } catch (err) {
    console.error('[Schema Heal] ERROR:', err.message);
    console.error('[Schema Heal] Stack:', err.stack);
  }
}

module.exports = { healSchema };
