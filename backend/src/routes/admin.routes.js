const express = require('express');
const multer = require('multer');
const prisma = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleMiddleware');
const bcrypt = require('bcryptjs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const router = express.Router();

// ============================================================
// Multer for file uploads (CSV, PDF, DOCX, TXT)
// ============================================================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.csv', '.pdf', '.docx', '.doc', '.txt'];
    const originalName = file.originalname || '';
    const ext = originalName.toLowerCase().slice(originalName.lastIndexOf('.'));
    if (allowedExtensions.includes(ext)) cb(null, true);
    else cb(new Error('Only CSV, PDF, DOCX, and TXT files are allowed.'));
  },
});

// ============================================================
// CSV & Question helpers
// ============================================================
function parseCSV(buffer) {
  const content = buffer.toString('utf-8').trim();
  const lines = content.split(/\r?\n/);
  if (lines.length < 2) return { error: 'CSV must have a header row and at least one data row.' };
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const expected = ['question', 'optiona', 'optionb', 'optionc', 'optiond', 'answer', 'marks'];
  const missing = expected.filter((h) => !headers.includes(h));
  if (missing.length > 0) return { error: `Missing headers: ${missing.join(', ')}. Required: ${expected.join(', ')}` };
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(',').map((v) => v.trim());
    if (values.length < 7) { rows.push({ _rawIndex: i + 1, _parseError: `Row ${i + 1}: Expected 7 columns, found ${values.length}.` }); continue; }
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = values[idx] || ''; });
    obj._rawIndex = i + 1;
    rows.push(obj);
  }
  return { rows };
}

function validateQuestion(q, index) {
  const errors = [];
  if (!q.question || !q.question.trim()) errors.push(`Row ${index}: "question" is required.`);
  if (!q.optionA || !q.optionA.trim()) errors.push(`Row ${index}: "optionA" is required.`);
  if (!q.optionB || !q.optionB.trim()) errors.push(`Row ${index}: "optionB" is required.`);
  if (!q.optionC || !q.optionC.trim()) errors.push(`Row ${index}: "optionC" is required.`);
  if (!q.optionD || !q.optionD.trim()) errors.push(`Row ${index}: "optionD" is required.`);
  if (!q.answer || !['A','B','C','D'].includes(q.answer.toUpperCase())) errors.push(`Row ${index}: "answer" must be A, B, C, or D.`);
  const marks = parseInt(q.marks, 10);
  if (isNaN(marks) || marks <= 0) errors.push(`Row ${index}: "marks" must be a positive integer.`);
  return { valid: errors.length === 0, errors, data: { question: q.question.trim(), optionA: q.optionA.trim(), optionB: q.optionB.trim(), optionC: q.optionC.trim(), optionD: q.optionD.trim(), answer: q.answer.toUpperCase(), marks } };
}

// All admin routes require authentication and ADMIN role
router.use(authenticate, requireRole('ADMIN'));

// ============================================================
// 1. GET /dashboard — Admin Dashboard Stats
// ============================================================
router.get('/dashboard', async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [
      totalStudents,
      totalTeachers,
      activeTeachers,
      pendingTeachers,
      totalExams,
      publishedExams,
      totalResults,
      recentRegistrations,
    ] = await Promise.all([
      prisma.student.count(),
      prisma.teacher.count(),
      prisma.teacher.count({ where: { status: 'ACTIVE' } }),
      prisma.teacher.count({ where: { status: 'PENDING' } }),
      prisma.exam.count(),
      prisma.exam.count({ where: { status: 'PUBLISHED' } }),
      prisma.result.count(),
      prisma.user.count({
        where: {
          role: { in: ['STUDENT', 'TEACHER'] },
          createdAt: { gte: sevenDaysAgo.toISOString() },
        },
      }),
    ]);

    res.json({
      totalStudents,
      totalTeachers,
      activeTeachers,
      pendingTeachers,
      totalExams,
      publishedExams,
      totalResults,
      recentRegistrations,
    });
  } catch (error) {
    console.error('[Admin Dashboard Error]', error);
    res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
});

// ============================================================
// 2. GET /teachers — List All Teachers
// ============================================================
router.get('/teachers', async (req, res) => {
  try {
    const {
      status,
      search,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where = {};

    if (status) {
      const validStatuses = ['PENDING', 'ACTIVE', 'REJECTED'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }
      where.status = status;
    }

    if (search) {
      const term = search.trim();
      where.OR = [
        { firstName: { contains: term } },
        { lastName: { contains: term } },
        { username: { contains: term } },
        { user: { email: { contains: term } } },
      ];
    }

    const [teachers, total] = await Promise.all([
      prisma.teacher.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { id: 'desc' },
        include: {
          user: { select: { email: true, createdAt: true } },
          _count: { select: { exams: true } },
        },
      }),
      prisma.teacher.count({ where }),
    ]);

    res.json({
      teachers: teachers.map((t) => ({
        id: t.id,
        firstName: t.firstName,
        lastName: t.lastName,
        username: t.username,
        email: t.user.email,
        status: t.status,
        subjects: (() => { try { return JSON.parse(t.subjects || '[]'); } catch (_) { return []; } })(),
        createdAt: t.user.createdAt,
        examCount: t._count.exams,
      })),
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('[Admin List Teachers Error]', error);
    res.status(500).json({ error: 'Failed to list teachers' });
  }
});

// ============================================================
// 2b. POST /teachers/create — Create Teacher
// ============================================================
router.post('/teachers/create', async (req, res) => {
  try {
    const { firstName, lastName, username, password } = req.body;

    if (!firstName || !lastName || !username || !password) {
      return res.status(400).json({
        error: 'Missing required fields: firstName, lastName, username, password',
      });
    }

    const trimmedUsername = username.trim().toLowerCase();
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check username uniqueness
    const existingTeacher = await prisma.teacher.findUnique({
      where: { username: trimmedUsername },
    });
    if (existingTeacher) {
      return res.status(409).json({ error: 'A teacher with this username already exists' });
    }

    // Generate a unique email from username (required by User model)
    const generatedEmail = `${trimmedUsername}@resco.local`;

    const hashedPassword = await bcrypt.hash(password, 12);

    const teacher = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: generatedEmail,
          password: hashedPassword,
          role: 'TEACHER',
        },
      });

      return tx.teacher.create({
        data: {
          id: user.id,
          firstName: trimmedFirstName,
          lastName: trimmedLastName,
          username: trimmedUsername,
          status: 'ACTIVE',
          subjects: '[]',
        },
        include: {
          user: { select: { email: true, createdAt: true } },
        },
      });
    });

    res.status(201).json({
      id: teacher.id,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      username: teacher.username,
      status: teacher.status,
      createdAt: teacher.user.createdAt,
      message: 'Teacher created successfully',
    });
  } catch (error) {
    console.error('[Admin Create Teacher Error]', error);
    res.status(500).json({ error: 'Failed to create teacher' });
  }
});

// ============================================================
// 3. PATCH /teachers/:id/approve — Approve Teacher
// ============================================================
router.patch('/teachers/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;

    const teacher = await prisma.teacher.findUnique({
      where: { id },
      include: { user: { select: { email: true } } },
    });

    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    if (teacher.status !== 'PENDING') {
      return res.status(400).json({
        error: `Cannot approve teacher. Current status is ${teacher.status}. Only PENDING teachers can be approved.`,
      });
    }

    const updated = await prisma.teacher.update({
      where: { id },
      data: { status: 'ACTIVE' },
      include: { user: { select: { email: true } } },
    });

    res.json({
      id: updated.id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.user.email,
      status: updated.status,
      message: 'Teacher approved successfully',
    });
  } catch (error) {
    console.error('[Admin Approve Teacher Error]', error);
    res.status(500).json({ error: 'Failed to approve teacher' });
  }
});

// ============================================================
// 4. PATCH /teachers/:id/reject — Reject Teacher
// ============================================================
router.patch('/teachers/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;

    const teacher = await prisma.teacher.findUnique({
      where: { id },
      include: { user: { select: { email: true } } },
    });

    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    if (teacher.status !== 'PENDING') {
      return res.status(400).json({
        error: `Cannot reject teacher. Current status is ${teacher.status}. Only PENDING teachers can be rejected.`,
      });
    }

    const updated = await prisma.teacher.update({
      where: { id },
      data: { status: 'REJECTED' },
      include: { user: { select: { email: true } } },
    });

    res.json({
      id: updated.id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.user.email,
      status: updated.status,
      message: 'Teacher rejected successfully',
    });
  } catch (error) {
    console.error('[Admin Reject Teacher Error]', error);
    res.status(500).json({ error: 'Failed to reject teacher' });
  }
});

// ============================================================
// 5. DELETE /teachers/:id — Delete Teacher
// ============================================================
router.delete('/teachers/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const teacher = await prisma.teacher.findUnique({
      where: { id },
      include: {
        _count: { select: { exams: true } },
      },
    });

    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    // Prevent deleting admin user (the User row might have role ADMIN)
    const user = await prisma.user.findUnique({ where: { id } });
    if (user && user.role === 'ADMIN') {
      return res.status(403).json({ error: 'Cannot delete an admin user' });
    }

    // Delete in a transaction: first remove dependent records, then teacher + user
    await prisma.$transaction(async (tx) => {
      // Delete exams owned by this teacher (and their questions/results/answers)
      const exams = await tx.exam.findMany({ where: { teacherId: id }, select: { id: true } });
      if (exams.length > 0) {
        const examIds = exams.map(e => e.id);
        await tx.resultAnswer.deleteMany({ where: { question: { examId: { in: examIds } } } });
        await tx.result.deleteMany({ where: { examId: { in: examIds } } });
        await tx.examQuestion.deleteMany({ where: { examId: { in: examIds } } });
        await tx.exam.deleteMany({ where: { teacherId: id } });
      }
      await tx.teacher.delete({ where: { id } });
      await tx.user.delete({ where: { id } });
    });

    res.json({ message: 'Teacher and associated account deleted successfully' });
  } catch (error) {
    console.error('[Admin Delete Teacher Error]', error);
    res.status(500).json({ error: 'Failed to delete teacher' });
  }
});

// ============================================================
// 6. GET /students — List All Students
// ============================================================
router.get('/students', async (req, res) => {
  try {
    const {
      className,
      search,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where = {};

    if (className) {
      where.className = className.trim();
    }

    if (search) {
      const term = search.trim();
      where.OR = [
        { firstName: { contains: term } },
        { lastName: { contains: term } },
        { admissionNo: { contains: term } },
        { user: { email: { contains: term } } },
      ];
    }

    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { id: 'desc' },
        include: {
          user: { select: { email: true, createdAt: true } },
          _count: { select: { results: true } },
        },
      }),
      prisma.student.count({ where }),
    ]);

    res.json({
      students: students.map((s) => ({
        id: s.id,
        admissionNo: s.admissionNo,
        firstName: s.firstName,
        lastName: s.lastName,
        className: s.className,
        email: s.user.email,
        createdAt: s.user.createdAt,
        resultCount: s._count.results,
      })),
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('[Admin List Students Error]', error);
    res.status(500).json({ error: 'Failed to list students' });
  }
});

// ============================================================
// 7. POST /students/create — Create Single Student
// ============================================================
router.post('/students/create', async (req, res) => {
  try {
    const { email, password, firstName, lastName, className, admissionNo } = req.body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName || !className || !admissionNo) {
      return res.status(400).json({
        error: 'Missing required fields: email, password, firstName, lastName, className, admissionNo',
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Trim string fields
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedClassName = className.trim();
    const trimmedAdmissionNo = admissionNo.trim();
    const trimmedEmail = email.trim().toLowerCase();

    // Check uniqueness
    const existingUser = await prisma.user.findUnique({ where: { email: trimmedEmail } });
    if (existingUser) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const existingStudent = await prisma.student.findUnique({ where: { admissionNo: trimmedAdmissionNo } });
    if (existingStudent) {
      return res.status(409).json({ error: 'A student with this admission number already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create User and Student in a transaction
    const student = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: trimmedEmail,
          password: hashedPassword,
          role: 'STUDENT',
        },
      });

      return tx.student.create({
        data: {
          id: user.id,
          admissionNo: trimmedAdmissionNo,
          firstName: trimmedFirstName,
          lastName: trimmedLastName,
          className: trimmedClassName,
        },
        include: {
          user: { select: { email: true, createdAt: true } },
        },
      });
    });

    res.status(201).json({
      id: student.id,
      email: student.user.email,
      admissionNo: student.admissionNo,
      firstName: student.firstName,
      lastName: student.lastName,
      className: student.className,
      createdAt: student.user.createdAt,
      message: 'Student created successfully',
    });
  } catch (error) {
    console.error('[Admin Create Student Error]', error);
    res.status(500).json({ error: 'Failed to create student' });
  }
});

// ============================================================
// 8. POST /students/bulk — Create Students in Bulk
// ============================================================
router.post('/students/bulk', async (req, res) => {
  try {
    const { students } = req.body;

    if (!students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'Request body must contain a non-empty "students" array' });
    }

    if (students.length > 500) {
      return res.status(400).json({ error: 'Maximum 500 students can be created in a single request' });
    }

    const errors = [];
    const validStudents = [];

    // Validate each student record
    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      const row = i + 1;

      if (!s.email || !s.password || !s.firstName || !s.lastName || !s.className || !s.admissionNo) {
        errors.push({
          row,
          admissionNo: s.admissionNo || 'N/A',
          error: 'Missing required fields: email, password, firstName, lastName, className, admissionNo',
        });
        continue;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(s.email)) {
        errors.push({
          row,
          admissionNo: s.admissionNo,
          error: `Invalid email format: ${s.email}`,
        });
        continue;
      }

      if (s.password.length < 6) {
        errors.push({
          row,
          admissionNo: s.admissionNo,
          error: 'Password must be at least 6 characters',
        });
        continue;
      }

      validStudents.push({
        email: s.email.trim().toLowerCase(),
        password: s.password,
        firstName: s.firstName.trim(),
        lastName: s.lastName.trim(),
        className: s.className.trim(),
        admissionNo: s.admissionNo.trim(),
      });
    }

    if (validStudents.length === 0) {
      return res.status(400).json({
        created: 0,
        errors,
        message: 'No valid student records to create',
      });
    }

    // Check for duplicate admission numbers within the batch
    const admissionNos = validStudents.map((s) => s.admissionNo);
    const emailList = validStudents.map((s) => s.email);
    const duplicateAdmissionNos = admissionNos.filter((n, idx) => admissionNos.indexOf(n) !== idx);
    const duplicateEmails = emailList.filter((e, idx) => emailList.indexOf(e) !== idx);

    if (duplicateAdmissionNos.length > 0) {
      for (const dup of [...new Set(duplicateAdmissionNos)]) {
        const row = validStudents.findIndex((s) => s.admissionNo === dup) + 1;
        errors.push({
          row,
          admissionNo: dup,
          error: `Duplicate admission number in batch: ${dup}`,
        });
      }
    }

    if (duplicateEmails.length > 0) {
      for (const dup of [...new Set(duplicateEmails)]) {
        const row = validStudents.findIndex((s) => s.email === dup) + 1;
        errors.push({
          row,
          admissionNo: validStudents[row - 1].admissionNo,
          error: `Duplicate email in batch: ${dup}`,
        });
      }
    }

    // Filter out records that have internal duplicates
    const cleanStudents = validStudents.filter((s) => {
      const admissionDup = duplicateAdmissionNos.includes(s.admissionNo);
      const emailDup = duplicateEmails.includes(s.email);
      return !admissionDup && !emailDup;
    });

    if (cleanStudents.length === 0) {
      return res.status(400).json({
        created: 0,
        errors,
        message: 'All records have duplicates or validation errors',
      });
    }

    // Check for existing records in the database
    const existingAdmissionNos = await prisma.student.findMany({
      where: { admissionNo: { in: cleanStudents.map((s) => s.admissionNo) } },
      select: { admissionNo: true },
    });

    const existingEmails = await prisma.user.findMany({
      where: { email: { in: cleanStudents.map((s) => s.email) } },
      select: { email: true },
    });

    const existingAdmissionSet = new Set(existingAdmissionNos.map((s) => s.admissionNo));
    const existingEmailSet = new Set(existingEmails.map((u) => u.email));

    const toCreate = cleanStudents.filter((s) => {
      if (existingAdmissionSet.has(s.admissionNo)) {
        errors.push({
          admissionNo: s.admissionNo,
          error: 'A student with this admission number already exists',
        });
        return false;
      }
      if (existingEmailSet.has(s.email)) {
        errors.push({
          admissionNo: s.admissionNo,
          error: 'A user with this email already exists',
        });
        return false;
      }
      return true;
    });

    // Create all valid students in a transaction
    let createdCount = 0;

    if (toCreate.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const s of toCreate) {
          const hashedPassword = await bcrypt.hash(s.password, 12);

          const user = await tx.user.create({
            data: {
              email: s.email,
              password: hashedPassword,
              role: 'STUDENT',
            },
          });

          await tx.student.create({
            data: {
              id: user.id,
              admissionNo: s.admissionNo,
              firstName: s.firstName,
              lastName: s.lastName,
              className: s.className,
            },
          });

          createdCount++;
        }
      });
    }

    res.status(201).json({
      created: createdCount,
      total: students.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `${createdCount} student(s) created successfully${errors.length > 0 ? ` with ${errors.length} error(s)` : ''}`,
    });
  } catch (error) {
    console.error('[Admin Bulk Create Students Error]', error);
    res.status(500).json({ error: 'Failed to create students in bulk' });
  }
});

// ============================================================
// 9. DELETE /students/:id — Delete Student
// ============================================================
router.delete('/students/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const student = await prisma.student.findUnique({
      where: { id },
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // Prevent deleting admin user
    const user = await prisma.user.findUnique({ where: { id } });
    if (user && user.role === 'ADMIN') {
      return res.status(403).json({ error: 'Cannot delete an admin user' });
    }

    // Delete student and user in transaction
    // ResultAnswers cascade on Result deletion, Result has no cascade from Student
    // so we need to handle results manually
    await prisma.$transaction(async (tx) => {
      // Delete result answers first (through results)
      const results = await tx.result.findMany({
        where: { studentId: id },
        select: { id: true },
      });

      if (results.length > 0) {
        const resultIds = results.map((r) => r.id);
        await tx.resultAnswer.deleteMany({
          where: { resultId: { in: resultIds } },
        });
        await tx.result.deleteMany({
          where: { id: { in: resultIds } },
        });
      }

      await tx.student.delete({ where: { id } });
      await tx.user.delete({ where: { id } });
    });

    res.json({ message: 'Student and associated account deleted successfully' });
  } catch (error) {
    console.error('[Admin Delete Student Error]', error);
    res.status(500).json({ error: 'Failed to delete student' });
  }
});

// ============================================================
// 13. GET /analytics — System Analytics
// ============================================================
router.get('/analytics', async (req, res) => {
  try {
    // 1. Performance by class — average scores per class
    // groupBy does NOT support include in Prisma, so we use findMany instead
    const allResults = await prisma.result.findMany({
      include: {
        student: { select: { className: true } },
        exam: { select: { subject: true, className: true } },
      },
    });

    // Aggregate by class
    const classScores = {};
    const studentAvgMap = {};
    for (const r of allResults) {
      const cls = r.student?.className || 'Unknown';
      const key = r.studentId;
      if (!studentAvgMap[key]) {
        studentAvgMap[key] = { cls: cls, percentages: [] };
      }
      studentAvgMap[key].percentages.push(r.percentage);
    }

    for (const key of Object.keys(studentAvgMap)) {
      const data = studentAvgMap[key];
      const avg = data.percentages.reduce((a, b) => a + b, 0) / data.percentages.length;
      if (!classScores[data.cls]) {
        classScores[data.cls] = { total: 0, count: 0 };
      }
      classScores[data.cls].total += avg;
      classScores[data.cls].count += 1;
    }

    const performanceByClass = Object.entries(classScores).map(([className, data]) => ({
      className,
      averageScore: data.count > 0 ? Math.round((data.total / data.count) * 100) / 100 : 0,
      studentCount: data.count,
    }));

    // 2. Performance by subject — reuse allResults
    const subjectScores = {};
    for (const r of allResults) {
      if (!r.exam) continue; // Skip orphaned results
      const subj = r.exam?.subject || 'Unknown';
      if (!subjectScores[subj]) {
        subjectScores[subj] = { total: 0, count: 0 };
      }
      subjectScores[subj].total += r.percentage;
      subjectScores[subj].count += 1;
    }

    const performanceBySubject = Object.entries(subjectScores).map(([subject, data]) => ({
      subject,
      averageScore: data.count > 0 ? Math.round((data.total / data.count) * 100) / 100 : 0,
      resultCount: data.count,
    }));

    // 3. Exam completion rates
    const exams = await prisma.exam.findMany({
      where: { status: 'PUBLISHED' },
      select: {
        id: true,
        title: true,
        _count: { select: { results: true } },
        className: true,
      },
    });

    // Get total students per class
    const studentClassCounts = await prisma.student.groupBy({
      by: ['className'],
      _count: { id: true },
    });

    const classStudentMap = {};
    for (const s of studentClassCounts) {
      classStudentMap[s.className] = s._count.id;
    }

    const examCompletionRates = exams.map((exam) => {
      const totalStudents = classStudentMap[exam.className] || 0;
      const completedCount = exam._count.results;
      const completionRate = totalStudents > 0
        ? Math.round((completedCount / totalStudents) * 10000) / 100
        : 0;

      return {
        examId: exam.id,
        title: exam.title,
        className: exam.className,
        totalStudents,
        completedCount,
        completionRate,
      };
    });

    // 4. Top performing students
    const topStudents = await prisma.result.groupBy({
      by: ['studentId'],
      _avg: { percentage: true },
      _count: { id: true },
      orderBy: {
        _avg: { percentage: 'desc' },
      },
      take: 20,
    });

    const topStudentsData = await Promise.all(
      topStudents.map(async (ts) => {
        const student = await prisma.student.findUnique({
          where: { id: ts.studentId },
          include: { user: { select: { email: true } } },
        });
        return {
          studentId: ts.studentId,
          admissionNo: student?.admissionNo,
          firstName: student?.firstName,
          lastName: student?.lastName,
          className: student?.className,
          email: student?.user?.email,
          averageScore: Math.round((ts._avg.percentage || 0) * 100) / 100,
          examsTaken: ts._count.id,
        };
      })
    );

    // 5. Recently active exams (published exams with results in the last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentActiveExams = await prisma.exam.findMany({
      where: {
        status: 'PUBLISHED',
        results: {
          some: {
            submittedAt: { gte: thirtyDaysAgo.toISOString() },
          },
        },
      },
      include: {
        teacher: { select: { firstName: true, lastName: true } },
        _count: {
          select: { results: true, questions: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

    const recentExams = recentActiveExams.map((exam) => ({
      examId: exam.id,
      title: exam.title,
      type: exam.type,
      status: exam.status,
      subject: exam.subject,
      className: exam.className,
      teacherName: exam.teacher ? `${exam.teacher.firstName} ${exam.teacher.lastName}` : 'Unknown',
      questionCount: exam._count.questions,
      resultCount: exam._count.results,
      startDate: exam.startDate,
      endDate: exam.endDate,
    }));

    // 6. Pass/Fail overview
    const passedCount = allResults.filter(r => r.percentage >= (r.exam?.passMark || 50)).length;
    const passFail = { passed: passedCount, failed: allResults.length - passedCount, total: allResults.length };

    res.json({
      performanceByClass,
      performanceBySubject,
      examCompletionRates,
      topStudents: topStudentsData,
      recentlyActiveExams: recentExams,
      passFail,
    });
  } catch (error) {
    console.error('[Admin Analytics Error]', error);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

// ============================================================
// 14. GET /exams — List All Exams (Admin View)
// ============================================================
router.get('/exams', async (req, res) => {
  try {
    const {
      status,
      type,
      subject,
      class: className,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where = {};

    if (status) {
      const validStatuses = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }
      where.status = status;
    }

    if (type) {
      const validTypes = ['TEST', 'EXAM'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
      }
      where.type = type;
    }

    if (subject) {
      where.subject = { contains: subject.trim() };
    }

    if (className) {
      where.className = className.trim();
    }

    const [exams, total] = await Promise.all([
      prisma.exam.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          teacher: {
            select: { firstName: true, lastName: true },
          },
          _count: {
            select: {
              questions: true,
              results: true,
            },
          },
        },
      }),
      prisma.exam.count({ where }),
    ]);

    res.json({
      exams: exams.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        type: e.type,
        status: e.status,
        duration: e.duration,
        totalMarks: e.totalMarks,
        passMark: e.passMark,
        startDate: e.startDate,
        endDate: e.endDate,
        resultVisibility: e.resultVisibility,
        teacherName: e.teacher ? `${e.teacher.firstName} ${e.teacher.lastName}` : 'Unknown',
        subject: e.subject,
        className: e.className,
        questionCount: e._count.questions,
        resultCount: e._count.results,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      })),
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('[Admin List Exams Error]', error);
    res.status(500).json({ error: 'Failed to list exams' });
  }
});

// ============================================================
// 15. POST /exams/create — Create Exam
// ============================================================
router.post('/exams/create', async (req, res) => {
  try {
    const { subject, className, teacherId, title, description, type, duration, totalMarks, passMark, startDate, endDate, resultVisibility } = req.body;

    if (!title || !duration || !subject || !className) {
      return res.status(400).json({ error: 'Missing required fields: title, duration, subject, className' });
    }

    const dur = parseInt(duration, 10);
    if (isNaN(dur) || dur < 1) return res.status(400).json({ error: 'Duration must be a positive integer (minutes).' });

    // Determine the teacherId
    let targetTeacherId = teacherId;
    if (!targetTeacherId) {
      const anyTeacher = await prisma.teacher.findFirst({
        where: { status: 'ACTIVE' },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      if (!anyTeacher) {
        return res.status(400).json({ error: 'No active teachers found. Create a teacher first or provide teacherId.' });
      }
      targetTeacherId = anyTeacher.id;
    }

    const exam = await prisma.exam.create({
      data: {
        title: title.trim(),
        description: (description || '').trim() || null,
        type: type || 'TEST',
        status: 'DRAFT',
        duration: dur,
        totalMarks: parseInt(totalMarks, 10) || 100,
        passMark: parseInt(passMark, 10) || 50,
        startDate: startDate || '',
        endDate: endDate || '',
        resultVisibility: resultVisibility || 'IMMEDIATE',
        className: className.trim(),
        subject: subject.trim(),
        teacherId: targetTeacherId,
      },
      include: {
        teacher: { select: { firstName: true, lastName: true } },
      },
    });

    res.status(201).json({
      id: exam.id,
      title: exam.title,
      status: exam.status,
      type: exam.type,
      duration: exam.duration,
      totalMarks: exam.totalMarks,
      passMark: exam.passMark,
      subject: exam.subject,
      className: exam.className,
      teacherName: exam.teacher ? `${exam.teacher.firstName} ${exam.teacher.lastName}` : 'Unknown',
      message: 'Exam created successfully. Add questions to it before publishing.',
    });
  } catch (error) {
    console.error('[Admin Create Exam Error]', error);
    const msg = error.code?.startsWith('P')
      ? 'Database error: ' + (error.meta?.target || error.message)
      : error.message || 'Failed to create exam.';
    res.status(500).json({ error: msg });
  }
});

// ============================================================
// 15b. PATCH /exams/:id/publish — Publish Exam
// ============================================================
router.patch('/exams/:id/publish', async (req, res) => {
  try {
    const exam = await prisma.exam.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { questions: true } } },
    });
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (exam.status === 'PUBLISHED') return res.status(400).json({ error: 'Exam is already published.' });
    if (exam.status === 'ARCHIVED') return res.status(400).json({ error: 'Cannot re-publish an archived exam. Create a new one.' });
    if (exam._count.questions === 0) return res.status(400).json({ error: 'Cannot publish exam with 0 questions. Add questions first.' });

    const updated = await prisma.exam.update({ where: { id: req.params.id }, data: { status: 'PUBLISHED' } });
    res.json({ id: updated.id, status: updated.status, message: 'Exam published successfully.' });
  } catch (error) {
    console.error('[Admin Publish Exam Error]', error);
    res.status(500).json({ error: 'Failed to publish exam.' });
  }
});

// ============================================================
// 15b2. PATCH /exams/:id/dates — Update Exam Schedule
// ============================================================
router.patch('/exams/:id/dates', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    const exam = await prisma.exam.findUnique({
      where: { id: req.params.id },
    });

    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (exam.status === 'ARCHIVED') return res.status(400).json({ error: 'Cannot edit dates for an archived exam.' });

    // Validate dates if provided
    if (startDate !== undefined && startDate !== null && startDate !== '') {
      const start = new Date(startDate);
      if (isNaN(start.getTime())) {
        return res.status(400).json({ error: 'Invalid start date.' });
      }
    }

    if (endDate !== undefined && endDate !== null && endDate !== '') {
      const end = new Date(endDate);
      if (isNaN(end.getTime())) {
        return res.status(400).json({ error: 'Invalid end date.' });
      }
    }

    // If both dates provided, validate that end is after start
    if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
      return res.status(400).json({ error: 'End date must be after start date.' });
    }

    const updateData = {};
    if (startDate !== undefined) updateData.startDate = startDate || '';
    if (endDate !== undefined) updateData.endDate = endDate || '';

    const updated = await prisma.exam.update({
      where: { id: req.params.id },
      data: updateData,
      select: {
        id: true, title: true, status: true,
        startDate: true, endDate: true,
      },
    });

    res.json({
      id: updated.id,
      title: updated.title,
      status: updated.status,
      startDate: updated.startDate,
      endDate: updated.endDate,
      message: 'Exam schedule updated successfully.',
    });
  } catch (error) {
    console.error('[Admin Update Exam Dates Error]', error);
    res.status(500).json({ error: 'Failed to update exam schedule.' });
  }
});

// ============================================================
// 15c. PATCH /exams/:id/archive — Archive Exam
// ============================================================
router.patch('/exams/:id/archive', async (req, res) => {
  try {
    const exam = await prisma.exam.findUnique({ where: { id: req.params.id } });
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (exam.status === 'ARCHIVED') return res.status(400).json({ error: 'Exam is already archived.' });
    if (exam.status === 'DRAFT') return res.status(400).json({ error: 'Cannot archive a draft exam. Delete it instead.' });

    const updated = await prisma.exam.update({ where: { id: req.params.id }, data: { status: 'ARCHIVED' } });
    res.json({ id: updated.id, status: updated.status, message: 'Exam archived successfully.' });
  } catch (error) {
    console.error('[Admin Archive Exam Error]', error);
    res.status(500).json({ error: 'Failed to archive exam.' });
  }
});

// ============================================================
// 15d. DELETE /exams/:id — Delete a DRAFT Exam
// ============================================================
router.delete('/exams/:id', async (req, res) => {
  try {
    const exam = await prisma.exam.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { results: true } } },
    });
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (exam.status === 'PUBLISHED') return res.status(400).json({ error: 'Cannot delete a published exam. Archive it first.' });

    // Delete questions first, then exam
    await prisma.examQuestion.deleteMany({ where: { examId: req.params.id } });
    await prisma.exam.delete({ where: { id: req.params.id } });
    res.json({ message: 'Exam deleted successfully.' });
  } catch (error) {
    console.error('[Admin Delete Exam Error]', error);
    res.status(500).json({ error: 'Failed to delete exam.' });
  }
});

// ============================================================
// 16. GET /questions/exams — List DRAFT exams for question management
// ============================================================
router.get('/questions/exams', async (req, res) => {
  try {
    const exams = await prisma.exam.findMany({
      where: { status: 'DRAFT' },
      orderBy: { createdAt: 'desc' },
      include: {
        teacher: { select: { firstName: true, lastName: true } },
        _count: { select: { questions: true } },
      },
    });
    res.json(exams.map(e => ({
      id: e.id, title: e.title, type: e.type,
      subject: e.subject, className: e.className,
      teacherName: e.teacher ? `${e.teacher.firstName} ${e.teacher.lastName}` : 'Unknown',
      questionCount: e._count.questions, duration: e.duration, totalMarks: e.totalMarks,
      createdAt: e.createdAt,
    })));
  } catch (error) {
    console.error('[Admin Questions Exams Error]', error);
    res.status(500).json({ error: 'Failed to load exams' });
  }
});

// ============================================================
// 16. GET /questions/:examId — View questions for an exam
// ============================================================
router.get('/questions/:examId', async (req, res) => {
  try {
    const exam = await prisma.exam.findUnique({
      where: { id: req.params.examId },
      include: { teacher: { select: { firstName: true, lastName: true } } },
    });
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const questions = await prisma.examQuestion.findMany({
      where: { examId: req.params.examId },
      orderBy: { id: 'asc' },
    });
    res.json({
      exam: { id: exam.id, title: exam.title, status: exam.status, subject: exam.subject, className: exam.className },
      questions,
    });
  } catch (error) {
    console.error('[Admin View Questions Error]', error);
    res.status(500).json({ error: 'Failed to load questions' });
  }
});

// ============================================================
// PDF/DOCX/TXT Parsers
// ============================================================
async function parsePDF(buffer) {
  try {
    const data = await pdfParse(buffer);
    return parseTextQuestions(data.text);
  } catch (err) {
    return { error: 'Failed to parse PDF: ' + err.message };
  }
}

async function parseDOCX(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return parseTextQuestions(result.value);
  } catch (err) {
    return { error: 'Failed to parse DOCX: ' + err.message };
  }
}

function parseTXT(buffer) {
  return parseTextQuestions(buffer.toString('utf-8'));
}

// ============================================================
// Unified text question parser (PDF, DOCX, TXT)
// Supports these formats:
//   1) Numbered questions with A/B/C/D options and answer key
//   2) Each line: question | optionA | optionB | optionC | optionD | answer | marks
// ============================================================
function parseTextQuestions(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);
  if (lines.length === 0) return { error: 'No content found in the file.' };

  const questions = [];
  let current = null;

  // Detect format: if first line has pipes or tabs, treat as delimited
  const firstLine = lines[0];
  const isDelimited = (firstLine.includes('|') && (firstLine.match(/\|/g) || []).length >= 5) ||
                       (firstLine.includes('\t') && (firstLine.match(/\t/g) || []).length >= 5);

  if (isDelimited) {
    // Delimited format: question | optionA | optionB | optionC | optionD | answer | marks
    // Skip header if it looks like one
    let startIdx = 0;
    const headerCheck = firstLine.toLowerCase();
    if (headerCheck.includes('question') && (headerCheck.includes('option') || headerCheck.includes('answer'))) {
      startIdx = 1;
    }
    for (let i = startIdx; i < lines.length; i++) {
      const sep = lines[i].includes('|') ? '|' : '\t';
      const parts = lines[i].split(sep).map(p => p.trim());
      if (parts.length >= 6 && parts[0] && parts[1] && parts[2] && parts[3] && parts[4] && parts[5]) {
        questions.push({
          question: parts[0], optionA: parts[1], optionB: parts[2],
          optionC: parts[3], optionD: parts[4], answer: parts[5].toUpperCase(),
          marks: parseInt(parts[6]) || 1, _rawIndex: i + 1,
        });
      }
    }
    return questions.length > 0 ? { rows: questions } : { error: 'Could not parse any questions from delimited file. Expected: question | optionA | optionB | optionC | optionD | answer | marks' };
  }

  // Numbered question format
  // Supported patterns:
  //   1. What is 2+2?
  //   A. 2
  //   B. 3
  //   C. 4
  //   D. 5
  //   Answer: C
  //   Marks: 2
  //
  // Or inline: 1. What is 2+2? A.2 B.3 C.4 D.5 Ans:C Marks:2
  const qPattern = /^(\d+)[.\)]\s*(.+)/;
  const optPattern = /^\s*([A-Da-d])[.\):]\s*(.+)/;
  const ansPattern = /^\s*(?:answer|ans|correct)[.\s:]+\s*([A-Da-d])/i;
  const marksPattern = /^\s*(?:mark|score|point)[s]?[.\s:]+\s*(\d+)/i;

  for (const line of lines) {
    const qMatch = line.match(qPattern);
    if (qMatch) {
      if (current && current.question) questions.push(current);
      current = { question: qMatch[2].trim(), optionA: '', optionB: '', optionC: '', optionD: '', answer: '', marks: 1, _rawIndex: parseInt(qMatch[1]) };
      // Check if options are on same line: 1. Question? A.opt1 B.opt2 C.opt3 D.opt4 Ans:C
      const inlineOpts = line.substring(qMatch[0].length).match(/([A-Da-d])[.\):]\s*([^A-D]*?)(?=\s+[A-D][.\):]|\s+Ans|$)/gi);
      if (inlineOpts && inlineOpts.length >= 4) {
        const keys = ['optionA', 'optionB', 'optionC', 'optionD'];
        inlineOpts.forEach((opt, idx) => {
          if (idx < 4) {
            const m = opt.match(/([A-Da-d])[.\):]\s*(.*)/);
            if (m) current[keys[idx]] = m[2].trim();
          }
        });
      }
      continue;
    }
    if (!current) continue;

    const optMatch = line.match(optPattern);
    if (optMatch) {
      const key = 'option' + optMatch[1].toUpperCase();
      if (current.hasOwnProperty(key)) current[key] = optMatch[2].trim();
      continue;
    }
    const ansMatch = line.match(ansPattern);
    if (ansMatch) { current.answer = ansMatch[1].toUpperCase(); continue; }
    const marksMatch = line.match(marksPattern);
    if (marksMatch) { current.marks = parseInt(marksMatch[1]) || 1; continue; }
  }
  if (current && current.question) questions.push(current);

  return questions.length > 0 ? { rows: questions } : { error: 'Could not parse any questions from the file. Expected numbered questions (1. Question text) with options A-D and an Answer line.' };
}

// ============================================================
// 19. POST /questions/upload — Multi-format upload (CSV, PDF, DOCX, TXT)
// ============================================================
router.post('/questions/upload', upload.single('file'), async (req, res) => {
  try {
    const { examId } = req.body;
    if (!examId) return res.status(400).json({ error: 'examId is required.' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (exam.status !== 'DRAFT') return res.status(400).json({ error: 'Only DRAFT exams can be modified.' });

    const originalName = req.file.originalname || '';
    const ext = originalName.toLowerCase().slice(originalName.lastIndexOf('.'));
    let parsed;

    if (ext === '.csv') {
      parsed = parseCSV(req.file.buffer);
    } else if (ext === '.pdf') {
      parsed = await parsePDF(req.file.buffer);
    } else if (ext === '.docx' || ext === '.doc') {
      if (ext === '.doc') return res.status(400).json({ error: 'Old .doc format is not supported. Please save as .docx or .pdf.' });
      parsed = await parseDOCX(req.file.buffer);
    } else if (ext === '.txt') {
      parsed = parseTXT(req.file.buffer);
    } else {
      return res.status(400).json({ error: 'Unsupported file format.' });
    }

    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const errors = [];
    const validQuestions = [];
    for (const row of parsed.rows) {
      if (row._parseError) { errors.push(row._parseError); continue; }
      const result = validateQuestion(row, row._rawIndex);
      if (result.valid) validQuestions.push({ examId, ...result.data });
      else errors.push(...result.errors);
    }
    let created = [];
    if (validQuestions.length > 0) {
      // Batch creates in groups of 50 to avoid transaction timeouts
      const BATCH_SIZE = 50;
      for (let i = 0; i < validQuestions.length; i += BATCH_SIZE) {
        const batch = validQuestions.slice(i, i + BATCH_SIZE);
        const batchCreated = await prisma.$transaction(
          batch.map(q => prisma.examQuestion.create({ data: q }))
        );
        created = created.concat(batchCreated);
      }
    }
    res.status(201).json({ success: true, data: { total: parsed.rows.length, created: created.length, errors } });
  } catch (error) {
    console.error('[Admin Upload Questions Error]', error);
    const msg = error.code?.startsWith('P')
      ? 'Database error: ' + (error.meta?.target || error.message)
      : error.message || 'Failed to upload questions.';
    res.status(500).json({ error: msg });
  }
});

// ============================================================
// 18. POST /questions/manual — Manual question creation (admin)
// ============================================================
router.post('/questions/manual', async (req, res) => {
  try {
    const { examId, questions } = req.body;
    if (!examId) return res.status(400).json({ error: 'examId is required.' });
    if (!Array.isArray(questions) || questions.length === 0) return res.status(400).json({ error: 'questions must be a non-empty array.' });
    if (questions.length > 500) return res.status(400).json({ error: 'Max 500 questions at once.' });
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });
    if (exam.status !== 'DRAFT') return res.status(400).json({ error: 'Only DRAFT exams can be modified.' });
    const validationErrors = [];
    const validQuestions = [];
    for (let i = 0; i < questions.length; i++) {
      const result = validateQuestion(questions[i], i + 1);
      if (result.valid) validQuestions.push({ examId, ...result.data });
      else validationErrors.push(...result.errors);
    }
    if (validQuestions.length === 0) return res.status(400).json({ error: 'No valid questions.', errors: validationErrors });
    const created = await prisma.$transaction(validQuestions.map(q => prisma.examQuestion.create({ data: q })));
    res.status(201).json({ success: true, message: `${created.length} question(s) created.`, data: { count: created.length, examId }, ...(validationErrors.length > 0 && { warnings: { errors: validationErrors } }) });
  } catch (error) {
    console.error('[Admin Manual Questions Error]', error);
    res.status(500).json({ error: 'Failed to add questions.' });
  }
});

// ============================================================
// 19. DELETE /questions/:questionId — Delete a question (admin)
// ============================================================
router.delete('/questions/:questionId', async (req, res) => {
  try {
    const question = await prisma.examQuestion.findUnique({
      where: { id: req.params.questionId },
      include: { exam: true },
    });
    if (!question) return res.status(404).json({ error: 'Question not found.' });
    if (question.exam.status !== 'DRAFT') return res.status(400).json({ error: 'Cannot delete questions from a published exam.' });
    await prisma.examQuestion.delete({ where: { id: req.params.questionId } });
    res.json({ message: 'Question deleted.' });
  } catch (error) {
    console.error('[Admin Delete Question Error]', error);
    res.status(500).json({ error: 'Failed to delete question.' });
  }
});

// ============================================================
// 20. POST /fix-shuffle — Disable option shuffling & set MANUAL result visibility on existing exams
// ============================================================
router.post('/fix-shuffle', async (req, res) => {
  try {
    const shuffleResult = await prisma.exam.updateMany({
      where: { shuffleOptions: 1 },
      data: { shuffleOptions: 0 },
    });
    const visibilityResult = await prisma.exam.updateMany({
      where: { resultVisibility: 'IMMEDIATE' },
      data: { resultVisibility: 'MANUAL' },
    });
    res.json({
      success: true,
      message: `Updated ${shuffleResult.count} exam(s) to disable option shuffling, ${visibilityResult.count} exam(s) to MANUAL result visibility.`
    });
  } catch (error) {
    console.error('[Fix Shuffle Error]', error);
    res.status(500).json({ error: 'Failed to update exams.' });
  }
});

module.exports = router;
