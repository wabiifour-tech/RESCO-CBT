// ── Database schema heal: ensures columns exist after Prisma connects ──
// Uses $executeRawUnsafe which works regardless of schema mismatch.
// Prisma Client connection doesn't validate the DB schema — only model queries do.
// So we connect first, then ALTER TABLE, then all subsequent queries work.

async function healSchema(prisma) {
  try {
    console.log('[Schema Heal] Checking database schema...');

    // Check if class_name column exists on exams
    const cols = await prisma.$queryRawUnsafe(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'exams' AND column_name IN ('class_name', 'subject', 'teacher_id');
    `);
    const existingCols = cols.map(c => c.column_name);
    console.log('[Schema Heal] Existing columns on exams:', existingCols.length > 0 ? existingCols.join(', ') : 'none of class_name, subject, teacher_id');

    const needed = [];
    if (!existingCols.includes('class_name')) needed.push('class_name VARCHAR(255) DEFAULT \'JSS1\'');
    if (!existingCols.includes('subject')) needed.push('subject VARCHAR(255) DEFAULT \'General\'');
    if (!existingCols.includes('teacher_id')) needed.push('teacher_id VARCHAR(255)');

    if (needed.length === 0) {
      console.log('[Schema Heal] All required columns exist. Schema is OK.');
      return;
    }

    console.log(`[Schema Heal] Adding missing columns: ${needed.join(', ')}`);
    for (const col of needed) {
      await prisma.$executeRawUnsafe(`ALTER TABLE exams ADD COLUMN ${col}`);
      console.log(`[Schema Heal] Added column: ${col.split(' ')[0]}`);
    }

    // Copy data from teacher_assignments if it still exists
    const taExists = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'teacher_assignments') as exists;
    `);
    if (taExists[0].exists) {
      console.log('[Schema Heal] teacher_assignments table found, copying data...');
      try {
        const r = await prisma.$executeRawUnsafe(`
          UPDATE exams e SET
            class_name = ta.class_name,
            subject = ta.subject,
            teacher_id = ta.teacher_id
          FROM teacher_assignments ta
          WHERE e.assignment_id = ta.id
        `);
        console.log(`[Schema Heal] Copied data for ${r} exam records.`);
      } catch (e) {
        console.error('[Schema Heal] Copy failed:', e.message);
      }
    }

    // Set safe defaults
    await prisma.$executeRawUnsafe(`UPDATE exams SET class_name = 'JSS1' WHERE class_name IS NULL OR class_name = ''`);
    await prisma.$executeRawUnsafe(`UPDATE exams SET subject = 'General' WHERE subject IS NULL OR subject = ''`);

    // Assign orphan exams to first active teacher
    await prisma.$executeRawUnsafe(`
      UPDATE exams e SET teacher_id = t.id
      FROM teachers t
      WHERE e.teacher_id IS NULL AND t.status = 'ACTIVE'
      AND t.id = (SELECT id FROM teachers WHERE status = 'ACTIVE' ORDER BY id ASC LIMIT 1);
    `);

    console.log('[Schema Heal] Complete. All columns ready.');
  } catch (err) {
    console.error('[Schema Heal] Error:', err.message);
    console.error('[Schema Heal] Stack:', err.stack);
  }
}

module.exports = { healSchema };
