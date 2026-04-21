// ── Data migration: TeacherAssignment → Exam (direct fields) ──
// This script copies className, subject, teacherId from teacher_assignments
// onto the exams table BEFORE prisma db push drops the table.
// Run with: node prisma/migrate-assignments.js

const { PrismaClient } = require('@prisma/client');

async function migrate() {
  const prisma = new PrismaClient();
  try {
    // Check if teacher_assignments table still exists
    const tableCheck = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'teacher_assignments'
      )
    `;
    if (!tableCheck[0].exists) {
      console.log('teacher_assignments table already removed — nothing to migrate.');
      return;
    }

    console.log('Migrating assignment data to exams...');

    // Copy className, subject, teacherId from assignments to exams
    const result = await prisma.$executeRaw`
      UPDATE exams e
      SET
        class_name = ta.class_name,
        subject = ta.subject,
        teacher_id = ta.teacher_id
      FROM teacher_assignments ta
      WHERE e.assignment_id = ta.id
        AND (e.class_name IS NULL OR e.class_name = 'JSS1')
    `;

    console.log(`Migrated ${result} exam records from teacher_assignments.`);

    // Set default subject for any exams that still have no subject
    const fallback = await prisma.$executeRaw`
      UPDATE exams
      SET subject = 'General'
      WHERE subject IS NULL OR subject = ''
    `;
    if (fallback > 0) {
      console.log(`Set default subject for ${fallback} exams.`);
    }

    console.log('Data migration complete. Safe to run prisma db push.');
  } catch (err) {
    console.error('Migration error:', err.message);
    // Don't throw — let the server start anyway
  } finally {
    await prisma.$disconnect();
  }
}

migrate();
