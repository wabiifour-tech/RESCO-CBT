const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function seed() {
  console.log('Seeding RESCO CBT database...');

  // Read credentials from environment variables (secure — no hardcoded passwords)
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPass = process.env.ADMIN_PASSWORD;
  const defaultPass = process.env.DEFAULT_USER_PASSWORD;

  if (!adminEmail || !adminPass) {
    console.log('Skipping user seed — ADMIN_EMAIL and ADMIN_PASSWORD not set.');
    console.log('Set these environment variables to auto-create users.');
    console.log('Seed complete (data only).');
    await prisma.$disconnect();
    return;
  }

  // ── Admin ──
  const adminPw = await bcrypt.hash(adminPass, 10);
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { email: adminEmail, password: adminPw, role: 'ADMIN' },
  });
  console.log('Admin account ready');

  // ── Teachers ──
  if (defaultPass) {
    const teacherPw = await bcrypt.hash(defaultPass, 10);

    const t1 = await prisma.user.upsert({
      where: { email: 'adeyemi@resco.edu.ng' },
      update: {},
      create: { email: 'adeyemi@resco.edu.ng', password: teacherPw, role: 'TEACHER' },
    });
    await prisma.teacher.upsert({
      where: { id: t1.id },
      update: { status: 'ACTIVE' },
      create: { id: t1.id, firstName: 'Adebayo', lastName: 'Adeyemi', status: 'ACTIVE', subjects: JSON.stringify(['Mathematics', 'Basic Science']) },
    });

    const t2 = await prisma.user.upsert({
      where: { email: 'ogunleye@resco.edu.ng' },
      update: {},
      create: { email: 'ogunleye@resco.edu.ng', password: teacherPw, role: 'TEACHER' },
    });
    await prisma.teacher.upsert({
      where: { id: t2.id },
      update: { status: 'ACTIVE' },
      create: { id: t2.id, firstName: 'Funke', lastName: 'Ogunleye', status: 'ACTIVE', subjects: JSON.stringify(['English Language', 'Social Studies']) },
    });

    // ── Students ──
    const studentPw = await bcrypt.hash(defaultPass, 10);
    const students = [
      { email: 'john@resco.edu.ng', first: 'John', last: 'Okonkwo', adm: 'RES/2025/JSS1/001', cls: 'JSS1' },
      { email: 'mary@resco.edu.ng', first: 'Mary', last: 'Adebayo', adm: 'RES/2025/JSS1/002', cls: 'JSS1' },
      { email: 'peter@resco.edu.ng', first: 'Peter', last: 'Ibrahim', adm: 'RES/2025/JSS2/001', cls: 'JSS2' },
      { email: 'grace@resco.edu.ng', first: 'Grace', last: 'Chukwu', adm: 'RES/2025/JSS2/002', cls: 'JSS2' },
      { email: 'david@resco.edu.ng', first: 'David', last: 'Okafor', adm: 'RES/2025/SSS1/001', cls: 'SSS1' },
    ];
    for (const s of students) {
      const u = await prisma.user.upsert({
        where: { email: s.email },
        update: {},
        create: { email: s.email, password: studentPw, role: 'STUDENT' },
      });
      await prisma.student.upsert({
        where: { id: u.id },
        update: {},
        create: { id: u.id, admissionNo: s.adm, firstName: s.first, lastName: s.last, className: s.cls },
      });
    }

    // ── Teacher Assignments ──
    await prisma.teacherAssignment.upsert({
      where: { teacherId_subject_className: { teacherId: t1.id, subject: 'Mathematics', className: 'JSS1' } },
      update: {},
      create: { teacherId: t1.id, subject: 'Mathematics', className: 'JSS1' },
    });
    await prisma.teacherAssignment.upsert({
      where: { teacherId_subject_className: { teacherId: t1.id, subject: 'Mathematics', className: 'JSS2' } },
      update: {},
      create: { teacherId: t1.id, subject: 'Mathematics', className: 'JSS2' },
    });
    const a3 = await prisma.teacherAssignment.upsert({
      where: { teacherId_subject_className: { teacherId: t2.id, subject: 'English Language', className: 'JSS1' } },
      update: {},
      create: { teacherId: t2.id, subject: 'English Language', className: 'JSS1' },
    });
    await prisma.teacherAssignment.upsert({
      where: { teacherId_subject_className: { teacherId: t2.id, subject: 'English Language', className: 'SSS1' } },
      update: {},
      create: { teacherId: t2.id, subject: 'English Language', className: 'SSS1' },
    });

    // ── Exams ──
    const now = new Date();
    const startStr = now.toISOString();
    const endStr = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();

    const mathA = await prisma.teacherAssignment.findFirst({ where: { teacherId: t1.id, subject: 'Mathematics', className: 'JSS1' } });
    const engA = await prisma.teacherAssignment.findFirst({ where: { teacherId: t2.id, subject: 'English Language', className: 'JSS1' } });

    if (mathA) {
      const mathExam = await prisma.exam.upsert({
        where: { id: 'exam-math-jss1-001' },
        update: {},
        create: {
          id: 'exam-math-jss1-001',
          title: 'JSS1 First Term Mathematics Assessment',
          description: 'First term CBT assessment for JSS1 Mathematics',
          type: 'EXAM', status: 'PUBLISHED', duration: 30, totalMarks: 50, passMark: 25,
          startDate: startStr, endDate: endStr, resultVisibility: 'IMMEDIATE', assignmentId: mathA.id,
        },
      });
      const mq = [
        { id: 'mq-1', question: 'What is 15 + 27?', optionA: '32', optionB: '42', optionC: '52', optionD: '38', answer: 'B', marks: 5 },
        { id: 'mq-2', question: 'What is the product of 8 and 6?', optionA: '44', optionB: '56', optionC: '48', optionD: '42', answer: 'C', marks: 5 },
        { id: 'mq-3', question: 'What is 100 divided by 4?', optionA: '20', optionB: '30', optionC: '15', optionD: '25', answer: 'D', marks: 5 },
        { id: 'mq-4', question: 'What is the square root of 81?', optionA: '7', optionB: '8', optionC: '9', optionD: '10', answer: 'C', marks: 5 },
        { id: 'mq-5', question: 'If x + 12 = 25, what is x?', optionA: '11', optionB: '13', optionC: '12', optionD: '14', answer: 'B', marks: 5 },
        { id: 'mq-6', question: 'What is 3/4 of 80?', optionA: '50', optionB: '70', optionC: '40', optionD: '60', answer: 'D', marks: 5 },
        { id: 'mq-7', question: 'How many degrees are in a right angle?', optionA: '45', optionB: '90', optionC: '180', optionD: '360', answer: 'B', marks: 5 },
        { id: 'mq-8', question: 'What is the next number: 2, 5, 8, 11, ...?', optionA: '13', optionB: '15', optionC: '14', optionD: '16', answer: 'C', marks: 5 },
        { id: 'mq-9', question: 'What is 25% of 200?', optionA: '25', optionB: '75', optionC: '100', optionD: '50', answer: 'D', marks: 5 },
        { id: 'mq-10', question: 'Perimeter of a rectangle (8cm x 5cm)?', optionA: '26cm', optionB: '40cm', optionC: '13cm', optionD: '20cm', answer: 'A', marks: 5 },
      ];
      for (const q of mq) {
        await prisma.examQuestion.upsert({ where: { id: q.id }, update: {}, create: { ...q, examId: mathExam.id } });
      }
    }

    if (engA) {
      const engExam = await prisma.exam.upsert({
        where: { id: 'exam-eng-jss1-001' },
        update: {},
        create: {
          id: 'exam-eng-jss1-001',
          title: 'JSS1 English Language Test',
          description: 'English Language CBT test for JSS1 students',
          type: 'TEST', status: 'PUBLISHED', duration: 20, totalMarks: 40, passMark: 20,
          startDate: startStr, endDate: endStr, resultVisibility: 'IMMEDIATE', assignmentId: engA.id,
        },
      });
      const eq = [
        { id: 'eq-1', question: 'Which word is a noun?', optionA: 'Quickly', optionB: 'Beautiful', optionC: 'Happiness', optionD: 'Running', answer: 'C', marks: 4 },
        { id: 'eq-2', question: 'Choose the correct spelling:', optionA: 'Accomodation', optionB: 'Accommodation', optionC: 'Acommodation', optionD: 'Accommadation', answer: 'B', marks: 4 },
        { id: 'eq-3', question: 'What is the past tense of "go"?', optionA: 'Goed', optionB: 'Gone', optionC: 'Went', optionD: 'Going', answer: 'C', marks: 4 },
        { id: 'eq-4', question: 'Which is a synonym of "happy"?', optionA: 'Sad', optionB: 'Joyful', optionC: 'Angry', optionD: 'Tired', answer: 'B', marks: 4 },
        { id: 'eq-5', question: 'Choose the correct sentence:', optionA: 'He don\'t like it', optionB: 'He doesn\'t likes it', optionC: 'He doesn\'t like it', optionD: 'He not like it', answer: 'C', marks: 4 },
        { id: 'eq-6', question: 'What type of word is "quickly"?', optionA: 'Noun', optionB: 'Verb', optionC: 'Adjective', optionD: 'Adverb', answer: 'D', marks: 4 },
        { id: 'eq-7', question: 'The opposite of "ancient" is:', optionA: 'Modern', optionB: 'Old', optionC: 'Historic', optionD: 'Classic', answer: 'A', marks: 4 },
        { id: 'eq-8', question: 'Which sentence uses the passive voice?', optionA: 'The cat chased the mouse', optionB: 'The mouse was chased by the cat', optionC: 'The cat is chasing the mouse', optionD: 'The mouse runs from the cat', answer: 'B', marks: 4 },
        { id: 'eq-9', question: '"She sings beautifully." The adverb is:', optionA: 'She', optionB: 'Sings', optionC: 'Beautifully', optionD: 'None', answer: 'C', marks: 4 },
        { id: 'eq-10', question: 'Choose the plural of "child":', optionA: 'Childs', optionB: 'Childes', optionC: 'Children', optionD: 'Childrens', answer: 'C', marks: 4 },
      ];
      for (const q of eq) {
        await prisma.examQuestion.upsert({ where: { id: q.id }, update: {}, create: { ...q, examId: engExam.id } });
      }
    }
  }

  console.log('Database seeded successfully.');
}

seed()
  .catch((e) => { console.error('Seed error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
