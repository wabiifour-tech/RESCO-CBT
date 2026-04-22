const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

// ── Retry helper: wait for database to be reachable ──
async function connectWithRetry(maxRetries = 15, baseDelayMs = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const prisma = new PrismaClient({
        datasources: {
          db: {
            url: process.env.DATABASE_URL,
          },
        },
      });
      await prisma.$connect();
      console.log(`✅ Database connected (attempt ${attempt}/${maxRetries})`);
      return prisma;
    } catch (err) {
      console.warn(`⏳ DB connection attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(1.5, attempt - 1);
        console.log(`   Retrying in ${Math.round(delay / 1000)}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw new Error(
          `Database unreachable after ${maxRetries} attempts. Last error: ${err.message}`
        );
      }
    }
  }
}

async function seed() {
  console.log('Seeding RESCO CBT database...');

  const prisma = await connectWithRetry();

  // ── Admin account ──
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

  // ── Principal account ──
  const principalEmail = process.env.PRINCIPAL_EMAIL || 'principal@resco.local';
  const principalPass = process.env.PRINCIPAL_PASSWORD || 'principal123';
  const principalPw = await bcrypt.hash(principalPass, 10);

  await prisma.user.upsert({
    where: { email: principalEmail },
    update: {},
    create: {
      email: principalEmail,
      password: principalPw,
      role: 'PRINCIPAL',
      firstName: 'Aderonke Rachael',
      lastName: 'Odewabi',
    },
  });
  console.log('Principal account created: ' + principalEmail + ' (password: ' + principalPass + ')');

  console.log('Database seeding complete.');

  await prisma.$disconnect();
}

seed().catch((e) => {
  console.error('❌ Seed failed (non-fatal — server will start anyway):', e.message);
  // Exit 0 so nixpacks continues to start server.js
  process.exit(0);
});
