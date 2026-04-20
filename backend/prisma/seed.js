const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function seed() {
  console.log('Seeding RESCO CBT database...');

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPass = process.env.ADMIN_PASSWORD;

  if (adminEmail && adminPass) {
    const adminPw = await bcrypt.hash(adminPass, 10);
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: { email: adminEmail, password: adminPw, role: 'ADMIN' },
    });
    console.log('Admin account created: ' + adminEmail);
  } else {
    console.log('ADMIN_EMAIL and ADMIN_PASSWORD not set. Skipping admin creation.');
  }

  // ── Create a sample teacher for testing ──
  const teacherUsername = 'teacher1';
  const teacherEmail = 'teacher1@resco.local';
  const teacherPw = await bcrypt.hash('teacher123', 10);

  const teacherUser = await prisma.user.upsert({
    where: { email: teacherEmail },
    update: {},
    create: { email: teacherEmail, password: teacherPw, role: 'TEACHER' },
  });

  await prisma.teacher.upsert({
    where: { username: teacherUsername },
    update: {},
    create: {
      id: teacherUser.id,
      firstName: 'Samuel',
      lastName: 'Adebayo',
      username: teacherUsername,
      status: 'ACTIVE',
      subjects: '["Mathematics","General Mathematics"]',
    },
  });
  console.log('Sample teacher created: username=' + teacherUsername + ', password=teacher123');

  // ── Create a sample student for testing ──
  const studentEmail = 'student1@resco.edu.ng';
  const studentPw = await bcrypt.hash('student123', 10);

  const studentUser = await prisma.user.upsert({
    where: { email: studentEmail },
    update: {},
    create: { email: studentEmail, password: studentPw, role: 'STUDENT' },
  });

  await prisma.student.upsert({
    where: { admissionNo: 'RES/2025/001' },
    update: {},
    create: {
      id: studentUser.id,
      admissionNo: 'RES/2025/001',
      firstName: 'John',
      lastName: 'Okafor',
      className: 'JSS1',
    },
  });
  console.log('Sample student created: full name=John Okafor, password=student123');

  console.log('Database seeding complete.');
}

seed()
  .catch((e) => { console.error('Seed error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
