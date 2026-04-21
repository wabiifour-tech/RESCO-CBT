// ── Data migration: TeacherAssignment → Exam (direct fields) ──
// This script:
//   1. ALWAYS ensures className, subject, teacherId columns exist on exams
//   2. IF teacher_assignments still exists, copies data from it into those columns
//   3. Sets safe defaults for any rows that still lack values
//
// Must run BEFORE prisma db push (which drops teacher_assignments table).

const { PrismaClient } = require('@prisma/client');

async function migrate() {
  const prisma = new PrismaClient();
  try {
    // ── Step 1: ALWAYS ensure columns exist on exams table ──
    // This must run even if teacher_assignments is already gone,
    // because a previous deployment may have dropped it but failed to add these columns.
    console.log('[Migration] Ensuring required columns on exams table...');

    await prisma.$executeRawUnsafe(`
      ALTER TABLE exams ADD COLUMN IF NOT EXISTS class_name VARCHAR(255) DEFAULT 'JSS1';
    `);
    console.log('[Migration] class_name column ready.');

    await prisma.$executeRawUnsafe(`
      ALTER TABLE exams ADD COLUMN IF NOT EXISTS subject VARCHAR(255) DEFAULT 'General';
    `);
    console.log('[Migration] subject column ready.');

    await prisma.$executeRawUnsafe(`
      ALTER TABLE exams ADD COLUMN IF NOT EXISTS teacher_id VARCHAR(255);
    `);
    console.log('[Migration] teacher_id column ready.');

    // ── Step 2: Copy data from teacher_assignments IF it still exists ──
    const tableCheck = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'teacher_assignments'
      )
    `;

    if (tableCheck[0].exists) {
      console.log('[Migration] teacher_assignments found. Copying data...');

      const result = await prisma.$executeRaw`
        UPDATE exams e
        SET
          class_name = ta.class_name,
          subject = ta.subject,
          teacher_id = ta.teacher_id
        FROM teacher_assignments ta
        WHERE e.assignment_id = ta.id
      `;
      console.log(`[Migration] Copied data for ${result} exam records.`);
    } else {
      console.log('[Migration] teacher_assignments already removed — skipping data copy.');
    }

    // ── Step 3: Set safe defaults for any exams still missing values ──
    const classDefault = await prisma.$executeRaw`
      UPDATE exams SET class_name = 'JSS1' WHERE class_name IS NULL OR class_name = '';
    `;
    if (classDefault > 0) {
      console.log(`[Migration] Set default className for ${classDefault} exams.`);
    }

    const subjectDefault = await prisma.$executeRaw`
      UPDATE exams SET subject = 'General' WHERE subject IS NULL OR subject = '';
    `;
    if (subjectDefault > 0) {
      console.log(`[Migration] Set default subject for ${subjectDefault} exams.`);
    }

    // ── Step 4: For exams without a teacher_id, try to find any active teacher ──
    const orphanExams = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count FROM exams WHERE teacher_id IS NULL;
    `;
    if (orphanExams[0].count > 0) {
      console.log(`[Migration] Found ${orphanExams[0].count} exams without teacher_id. Attempting to assign...`);
      await prisma.$executeRawUnsafe(`
        UPDATE exams e
        SET teacher_id = t.id
        FROM teachers t
        WHERE e.teacher_id IS NULL
          AND t.status = 'ACTIVE'
          AND t.id = (
            SELECT id FROM teachers WHERE status = 'ACTIVE' ORDER BY id ASC LIMIT 1
          );
      `);
      const stillOrphan = await prisma.$queryRaw`
        SELECT COUNT(*)::int AS count FROM exams WHERE teacher_id IS NULL;
      `;
      if (stillOrphan[0].count > 0) {
        console.warn(`[Migration] WARNING: ${stillOrphan[0].count} exams still have no teacher_id.`);
      }
    }

    console.log('[Migration] Complete. Safe to run prisma db push.');
  } catch (err) {
    console.error('[Migration] Error:', err.message);
    // Don't throw — let the server start anyway
  } finally {
    await prisma.$disconnect();
  }
}

migrate();
