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
    console.log('Admin account created.');
  } else {
    console.log('ADMIN_EMAIL and ADMIN_PASSWORD not set. Skipping admin creation.');
  }

  console.log('Database ready. No default students, teachers, exams, or questions created.');
}

seed()
  .catch((e) => { console.error('Seed error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
