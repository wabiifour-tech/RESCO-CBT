const express = require('express');
const multer = require('multer');
const prisma = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleMiddleware');
const bcrypt = require('bcryptjs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const PDFDocument = require('pdfkit');

const router = express.Router();

// ============================================================
// Multer for file uploads (CSV, PDF, DOCX, TXT)
// ============================================================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.csv', '.pdf', '.docx', '.txt'];
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
    let line = lines[i].trim();
    if (!line) continue;
    // Handle quoted CSV fields (commas inside double-quoted strings)
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') {
        if (inQuotes && c + 1 < line.length && line[c + 1] === '"') {
          current += '"'; // escaped quote
          c++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    values.push(current.trim()); // last field
    
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

// Multer for logo uploads (images only)
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files (PNG, JPG, GIF, WebP) are allowed'));
  },
});

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
          classAssignments: true,
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
        email: t.user?.email || 'N/A',
        status: t.status,
        subjects: (() => { try { return JSON.parse(t.subjects || '[]'); } catch (_) { return []; } })(),
        classAssignments: t.classAssignments ? t.classAssignments.map(ca => ({ className: ca.className, subject: ca.subject })) : [],
        createdAt: t.user?.createdAt || null,
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
    const { firstName, lastName, username, password, classAssignments } = req.body;

    if (!firstName || !lastName || !username || !password) {
      return res.status(400).json({
        error: 'Missing required fields: firstName, lastName, username, password',
      });
    }

    // Validate classAssignments if provided
    if (classAssignments && Array.isArray(classAssignments)) {
      for (let i = 0; i < classAssignments.length; i++) {
        const ca = classAssignments[i];
        if (!ca.className || !ca.subject) {
          return res.status(400).json({
            error: `classAssignments[${i}]: each item must have className and subject`,
          });
        }
      }
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

    // Check if generated email already exists (e.g., from a student account)
    const existingEmail = await prisma.user.findUnique({ where: { email: generatedEmail } });
    if (existingEmail) {
      return res.status(409).json({ error: 'A user with the generated email already exists. Please choose a different username.' });
    }

    // Build subjects array from unique subjects in classAssignments
    const subjectsArray = classAssignments && Array.isArray(classAssignments)
      ? [...new Set(classAssignments.map(ca => ca.subject.trim()))]
      : [];

    const teacher = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: generatedEmail,
          password: await bcrypt.hash(password, 10),
          role: 'TEACHER',
          firstName: trimmedFirstName,
          lastName: trimmedLastName,
        },
      });

      const createdTeacher = await tx.teacher.create({
        data: {
          id: user.id,
          firstName: trimmedFirstName,
          lastName: trimmedLastName,
          username: trimmedUsername,
          status: 'ACTIVE',
          subjects: JSON.stringify(subjectsArray),
        },
        include: {
          user: { select: { email: true, createdAt: true } },
        },
      });

      // Create TeacherClass records if classAssignments provided
      if (classAssignments && Array.isArray(classAssignments) && classAssignments.length > 0) {
        await tx.teacherClass.createMany({
          data: classAssignments.map(ca => ({
            teacherId: user.id,
            className: ca.className.trim(),
            subject: ca.subject.trim(),
          })),
        });
      }

      return createdTeacher;
    });

    res.status(201).json({
      id: teacher.id,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      username: teacher.username,
      status: teacher.status,
      createdAt: teacher.user?.createdAt || null,
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
      email: updated.user?.email || 'N/A',
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
      email: updated.user?.email || 'N/A',
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
      await tx.teacherClass.deleteMany({ where: { teacherId: id } });
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
        email: s.user?.email || 'N/A',
        createdAt: s.user?.createdAt || null,
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

    // Create User and Student in a transaction
    const student = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: trimmedEmail,
          password: await bcrypt.hash(password, 10),
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
      email: student.user?.email || 'N/A',
      admissionNo: student.admissionNo,
      firstName: student.firstName,
      lastName: student.lastName,
      className: student.className,
      createdAt: student.user?.createdAt || null,
      message: 'Student created successfully',
    });
  } catch (error) {
    console.error('[Admin Create Student Error]', error);
    if (error.code === 'P2002') {
      const target = error.meta?.target || [];
      if (target.includes('email')) {
        return res.status(409).json({ error: 'A user with this email already exists.' });
      }
      if (target.includes('admission_no')) {
        return res.status(409).json({ error: 'A student with this admission number already exists.' });
      }
      return res.status(409).json({ error: 'A record with this identifier already exists.' });
    }
    const msg = error.code?.startsWith('P')
      ? 'Database error: ' + (error.meta?.target || error.message)
      : error.message || 'Failed to create student.';
    res.status(500).json({ error: msg });
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

      // Type guard: ensure required fields are strings
      if (typeof s !== 'object' || s === null) {
        errors.push({ row, admissionNo: 'N/A', error: `Row ${row}: Invalid record format.` });
        continue;
      }
      if (typeof s.email !== 'string' || typeof s.password !== 'string' || typeof s.firstName !== 'string' || typeof s.lastName !== 'string' || typeof s.className !== 'string' || typeof s.admissionNo !== 'string') {
        errors.push({ row, admissionNo: String(s.admissionNo || 'N/A'), error: `Row ${row}: All fields must be strings.` });
        continue;
      }

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
        const matchIdx = validStudents.findIndex((s) => s.email === dup);
        if (matchIdx === -1) continue;
        const row = matchIdx + 1;
        errors.push({
          row,
          admissionNo: validStudents[matchIdx].admissionNo,
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
          const user = await tx.user.create({
            data: {
              email: s.email,
              password: await bcrypt.hash(s.password, 10),
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
    if (error.code === 'P2002') {
      const target = error.meta?.target || [];
      const field = target.includes('email') ? 'email' : 'admission number';
      return res.status(409).json({ error: `Duplicate ${field} detected during creation.` });
    }
    const msg = error.code?.startsWith('P')
      ? 'Database error: ' + (error.meta?.target || error.message)
      : error.message || 'Failed to create students in bulk.';
    res.status(500).json({ error: msg });
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
    // 1. Performance by class — use aggregation instead of loading all results
    const classAgg = await prisma.result.groupBy({
      by: ['studentId'],
      _avg: { percentage: true },
    });

    // Get student class info in batch
    const studentIds = classAgg.map(r => r.studentId);
    const studentRecords = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, className: true },
    });
    const studentClassMap = {};
    studentRecords.forEach(s => { studentClassMap[s.id] = s.className; });

    const classScores = {};
    for (const r of classAgg) {
      const cls = studentClassMap[r.studentId] || 'Unknown';
      if (!classScores[cls]) {
        classScores[cls] = { total: 0, count: 0 };
      }
      classScores[cls].total += r._avg.percentage || 0;
      classScores[cls].count += 1;
    }

    const performanceByClass = Object.entries(classScores).map(([className, data]) => ({
      className,
      averageScore: data.count > 0 ? Math.round((data.total / data.count) * 100) / 100 : 0,
      studentCount: data.count,
    }));

    // 2. Performance by subject — use per-exam aggregation
    const examScoreAgg = await prisma.result.groupBy({
      by: ['examId'],
      _avg: { percentage: true },
      _count: true,
    });
    const examIds = examScoreAgg.map(r => r.examId);
    const examRecords = await prisma.exam.findMany({
      where: { id: { in: examIds } },
      select: { id: true, subject: true, passMark: true },
    });
    const examMap = {};
    examRecords.forEach(e => { examMap[e.id] = e; });

    const subjectScores = {};
    for (const r of examScoreAgg) {
      const exam = examMap[r.examId];
      const subj = exam?.subject || 'Unknown';
      if (!subjectScores[subj]) {
        subjectScores[subj] = { total: 0, count: 0 };
      }
      subjectScores[subj].total += (r._avg.percentage || 0) * r._count;
      subjectScores[subj].count += r._count;
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
    const studentResultCounts = await prisma.result.groupBy({
      by: ['studentId'],
      _count: { id: true },
      _avg: { percentage: true },
      orderBy: { _avg: { percentage: 'desc' } },
      take: 20,
    });
    const topStudentIds = studentResultCounts.map(ts => ts.studentId);
    const topStudentRecords = await prisma.student.findMany({
      where: { id: { in: topStudentIds } },
      include: { user: { select: { email: true } } },
    });
    const topStudentMap = {};
    topStudentRecords.forEach(s => { topStudentMap[s.id] = s; });

    const topStudents = studentResultCounts
      .map(ts => {
        const student = topStudentMap[ts.studentId];
        if (!student) return null;
        return {
          studentId: ts.studentId,
          admissionNo: student.admissionNo,
          firstName: student.firstName,
          lastName: student.lastName,
          className: student.className,
          email: student.user?.email,
          averageScore: Math.round((ts._avg.percentage || 0) * 100) / 100,
          examsTaken: ts._count.id,
        };
      })
      .filter(Boolean);

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

    // 6. Pass/Fail overview — load only needed fields for accuracy
    const resultPassFail = await prisma.result.findMany({
      select: { examId: true, percentage: true },
    });
    let passed = 0;
    let failed = 0;
    for (const r of resultPassFail) {
      const exam = examMap[r.examId];
      if (!exam) continue; // Skip orphan results from deleted exams
      const passMark = exam.passMark || 50;
      if (r.percentage >= passMark) {
        passed++;
      } else {
        failed++;
      }
    }
    const passFail = { passed, failed, total: resultPassFail.length };

    res.json({
      performanceByClass,
      performanceBySubject,
      examCompletionRates,
      topStudents,
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

    if (teacherId) {
      const targetTeacher = await prisma.teacher.findUnique({
        where: { id: teacherId },
        select: { id: true, status: true },
      });
      if (!targetTeacher) {
        return res.status(404).json({ error: 'Specified teacher not found.' });
      }
      if (targetTeacher.status !== 'ACTIVE') {
        return res.status(400).json({ error: 'Cannot assign exam to a non-active teacher.' });
      }
    }

    const validTypes = ['TEST', 'EXAM'];
    if (type && !validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
    }

    const dur = parseInt(duration, 10);
    if (isNaN(dur) || dur < 1) return res.status(400).json({ error: 'Duration must be a positive integer (minutes).' });

    // Validate startDate/endDate
    if (startDate) {
      const sd = new Date(startDate);
      if (isNaN(sd.getTime())) return res.status(400).json({ error: 'Invalid startDate format' });
    }
    if (endDate) {
      const ed = new Date(endDate);
      if (isNaN(ed.getTime())) return res.status(400).json({ error: 'Invalid endDate format' });
    }

    // Validate passMark range
    if (passMark !== undefined && passMark !== null) {
      const pm = parseInt(passMark, 10);
      if (isNaN(pm) || pm < 0 || pm > 100) {
        return res.status(400).json({ error: 'passMark must be between 0 and 100' });
      }
    }

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
        totalMarks: !isNaN(parseInt(totalMarks, 10)) ? parseInt(totalMarks, 10) : 100,
        passMark: !isNaN(parseInt(passMark, 10)) ? parseInt(passMark, 10) : 50,
        startDate: startDate || '',
        endDate: endDate || '',
        resultVisibility: resultVisibility || 'MANUAL',
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

    // Delete questions, result answers, results, then exam
    await prisma.$transaction(async (tx) => {
      await tx.resultAnswer.deleteMany({ where: { question: { examId: req.params.id } } });
      await tx.result.deleteMany({ where: { examId: req.params.id } });
      await tx.examQuestion.deleteMany({ where: { examId: req.params.id } });
      await tx.exam.delete({ where: { id: req.params.id } });
    });
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
          marks: parts.length >= 7 ? (parseInt(parts[6]) || 1) : 1, _rawIndex: i + 1,
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
    } else if (ext === '.docx') {
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
    let created = [];
    const BATCH_SIZE = 50;
    for (let i = 0; i < validQuestions.length; i += BATCH_SIZE) {
      const batch = validQuestions.slice(i, i + BATCH_SIZE);
      const batchCreated = await prisma.$transaction(
        batch.map(q => prisma.examQuestion.create({ data: q }))
      );
      created = created.concat(batchCreated);
    }
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

// ============================================================
// Results: Filter Options & PDF Export
// ============================================================

// GET /results/filter-options — Return distinct classes and subjects with results
router.get('/results/filter-options', async (req, res) => {
  try {
    const examsWithResults = await prisma.exam.findMany({
      where: { status: 'PUBLISHED', results: { some: {} } },
      select: { className: true, subject: true, id: true, title: true, _count: { select: { results: true } } },
      distinct: ['className', 'subject'],
      orderBy: { className: 'asc' },
    });

    // Build unique class list
    const classSet = new Set();
    const classes = [];
    for (const e of examsWithResults) {
      if (e.className && !classSet.has(e.className)) {
        classSet.add(e.className);
        classes.push(e.className);
      }
    }

    // Build subject list per exam for dropdown
    const subjectSet = new Set();
    const subjects = [];
    for (const e of examsWithResults) {
      if (e.subject && !subjectSet.has(e.subject)) {
        subjectSet.add(e.subject);
        subjects.push(e.subject);
      }
    }

    // Exams grouped by class for cascading dropdown
    const examsByClass = {};
    for (const e of examsWithResults) {
      if (!examsByClass[e.className]) examsByClass[e.className] = [];
      examsByClass[e.className].push({
        id: e.id,
        title: e.title,
        subject: e.subject,
        resultCount: e._count.results,
      });
    }

    res.json({ classes, subjects, examsByClass });
  } catch (error) {
    console.error('[Admin Filter Options Error]', error);
    res.status(500).json({ error: 'Failed to load filter options' });
  }
});

// GET /results/:examId — Get results for a specific exam (admin access)
router.get('/results/:examId', async (req, res) => {
  try {
    const { examId } = req.params;
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        teacher: { select: { firstName: true, lastName: true } },
      },
    });
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });

    const results = await prisma.result.findMany({
      where: { examId },
      include: {
        student: { select: { admissionNo: true, firstName: true, lastName: true, className: true } },
      },
      orderBy: { percentage: 'desc' },
    });

    const passMark = exam.passMark || 50;
    const passed = results.filter(r => r.percentage >= passMark).length;
    const avgScore = results.length > 0 ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / results.length * 10) / 10 : 0;

    res.json({
      exam: {
        id: exam.id, title: exam.title, subject: exam.subject, className: exam.className,
        type: exam.type, totalMarks: exam.totalMarks, passMark, duration: exam.duration,
        teacherName: exam.teacher ? `${exam.teacher.firstName} ${exam.teacher.lastName}` : 'Unknown',
      },
      results,
      summary: { total: results.length, passed, failed: results.length - passed, average: avgScore },
    });
  } catch (error) {
    console.error('[Admin Exam Results Error]', error);
    res.status(500).json({ error: 'Failed to load results.' });
  }
});

// GET /results/export/:examId — Export exam results as professional PDF
router.get('/results/export/:examId', async (req, res) => {
  try {
    const { examId } = req.params;
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: { teacher: { select: { firstName: true, lastName: true } } },
    });
    if (!exam) return res.status(404).json({ error: 'Exam not found.' });

    const results = await prisma.result.findMany({
      where: { examId },
      include: {
        student: { select: { admissionNo: true, firstName: true, lastName: true, className: true } },
      },
      orderBy: { percentage: 'desc' },
    });

    if (results.length === 0) return res.status(404).json({ error: 'No results found for this exam.' });

    const passMark = exam.passMark || 50;
    const teacherName = exam.teacher ? `${exam.teacher.firstName} ${exam.teacher.lastName}` : 'Teacher';
    const now = new Date();
    const downloadDate = now.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });
    const downloadTime = now.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const doc = new PDFDocument({
      size: 'A4',
      bufferPages: true,
      margins: { top: 40, bottom: 40, left: 45, right: 45 },
      info: {
        Title: `${exam.title} - Results`,
        Author: 'RESCO CBT System',
        Subject: `${exam.subject} - ${exam.className}`,
        Creator: `RESCO CBT System - ${downloadDate}`,
      },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${exam.title.replace(/[^a-zA-Z0-9]/g, '_')}_results.pdf"`);
    doc.pipe(res);

    const pw = doc.page.width - 90; // page width minus margins

    // --- Watermark helper (per page) ---
    const drawWatermark = () => {
      doc.save();
      doc.fontSize(72).fillColor('#e8e8e8', 0.18);
      doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc.text('RESCO CBT', doc.page.width / 2 - 170, doc.page.height / 2 - 40, {
        width: 340, align: 'center',
      });
      doc.restore();
    };

    // --- School Header (shared) ---
    const drawSchoolHeader = (yStart) => {
      // Purple top bar
      doc.rect(0, 0, doc.page.width, 8).fill('#6366f1');
      doc.rect(0, 8, doc.page.width, 3).fill('#8b5cf6');

      // School name
      doc.fontSize(15).fillColor('#1e1b4b').font('Helvetica-Bold')
         .text("REDEEMER'S SCHOOLS AND COLLEGE, OWOTORO", 45, yStart, { align: 'center', width: pw });

      // Motto
      doc.fontSize(9).fillColor('#6b21a8').font('Helvetica-Oblique')
         .text('"Raising Generations of Excellence"', 45, yStart + 18, { align: 'center', width: pw });

      // Decorative line
      const lineY = yStart + 34;
      doc.moveTo(45, lineY).lineTo(45 + pw, lineY)
         .strokeColor('#8b5cf6').lineWidth(1.5).stroke();
      return lineY + 8;
    };

    // --- Helper: format date ---
    const fmtDate = (d) => d ? d.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: '2-digit' }) : 'N/A';
    const fmtTime = (d) => d ? d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : 'N/A';

    // --- Exam Info Block ---
    const infoY = drawSchoolHeader(35);
    doc.fontSize(13).fillColor('#1e1b4b').font('Helvetica-Bold')
       .text(exam.title, 45, infoY, { align: 'center', width: pw });
    doc.fontSize(8).fillColor('#475569').font('Helvetica')
       .text(`${exam.type} | Class: ${exam.className} | Subject: ${exam.subject} | Duration: ${exam.duration} min | Total Marks: ${exam.totalMarks} | Pass Mark: ${passMark}%`, 45, infoY + 16, { align: 'center', width: pw });

    // Download info
    const dlY = infoY + 32;
    doc.moveTo(45, dlY).lineTo(45 + pw, dlY).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
    doc.fontSize(7).fillColor('#94a3b8')
       .text(`Downloaded: ${downloadDate} at ${downloadTime}`, 45, dlY + 4, { align: 'left', width: pw / 2 });
    doc.fontSize(7).fillColor('#94a3b8')
       .text(`Students: ${results.length} | Generated by RESCO CBT System`, 45, dlY + 4, { align: 'right', width: pw / 2 });

    // --- Summary Stats Row ---
    const passed = results.filter(r => r.percentage >= passMark).length;
    const avgScore = results.length > 0 ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / results.length * 10) / 10 : 0;
    const highest = results.length > 0 ? Math.max(...results.map(r => r.percentage)) : 0;
    const lowest = results.length > 0 ? Math.min(...results.map(r => r.percentage)) : 0;
    const summaryY = dlY + 16;
    doc.rect(45, summaryY, pw, 18).fill('#f0f0ff').stroke('#c7d2fe');
    doc.fontSize(8).fillColor('#3730a3').font('Helvetica-Bold');
    const statW = pw / 5;
    doc.text(`Total: ${results.length}`, 48, summaryY + 5, { width: statW });
    doc.text(`Passed: ${passed}`, 48 + statW, summaryY + 5, { width: statW });
    doc.text(`Failed: ${results.length - passed}`, 48 + statW * 2, summaryY + 5, { width: statW });
    doc.text(`Highest: ${highest}%`, 48 + statW * 3, summaryY + 5, { width: statW });
    doc.text(`Avg: ${avgScore}%`, 48 + statW * 4, summaryY + 5, { width: statW });

    // --- Results Table Header ---
    const tableTop = summaryY + 26;
    const cols = [25, 95, 80, 70, 40, 40, 40, 40, 55, 55]; // sum = 500
    const headers = ['#', 'Student Name', 'Admission No', 'Class', 'Score', 'Total', '%', 'Grade', 'Status', 'Time'];
    const colX = [45];
    for (let i = 0; i < cols.length - 1; i++) colX.push(colX[i] + cols[i]);

    doc.rect(45, tableTop - 2, pw, 16).fill('#4338ca');
    doc.fontSize(7).fillColor('#ffffff').font('Helvetica-Bold');
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], colX[i] + 3, tableTop, { width: cols[i] - 6 });
    }

    // --- Table Rows ---
    let rowY = tableTop + 16;
    const rowH = 13;
    for (let idx = 0; idx < results.length; idx++) {
      const r = results[idx];
      const student = r.student;
      const pct = r.percentage || 0;
      const isPassed = pct >= passMark;
      const grade = pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : pct >= passMark ? 'E' : 'F';
      const timeMins = Math.round(r.timeSpent / 60);

      // Alternate row background
      if (idx % 2 === 0) {
        doc.rect(45, rowY - 1, pw, rowH).fill('#f8fafc');
      }

      doc.fontSize(7).font('Helvetica');
      const cy = rowY + 1;
      doc.fillColor('#374151').text(String(idx + 1), colX[0] + 3, cy, { width: cols[0] - 6, align: 'center' });
      doc.fillColor('#1e293b').text(`${student?.firstName || 'Unknown'} ${student?.lastName || ''}`, colX[1] + 3, cy, { width: cols[1] - 6 });
      doc.fillColor('#475569').text(student?.admissionNo || 'N/A', colX[2] + 3, cy, { width: cols[2] - 6 });
      doc.text(student?.className || 'N/A', colX[3] + 3, cy, { width: cols[3] - 6 });
      doc.fillColor('#374151').text(String(r.score), colX[4] + 3, cy, { width: cols[4] - 6, align: 'center' });
      doc.text(String(r.totalMarks), colX[5] + 3, cy, { width: cols[5] - 6, align: 'center' });
      doc.fillColor(isPassed ? '#059669' : '#dc2626').font('Helvetica-Bold').text(`${pct}%`, colX[6] + 3, cy, { width: cols[6] - 6, align: 'center' });
      doc.fillColor(isPassed ? '#059669' : '#dc2626').text(grade, colX[7] + 3, cy, { width: cols[7] - 6, align: 'center' });
      doc.fillColor(isPassed ? '#166534' : '#991b1b').font('Helvetica-Bold').text(isPassed ? 'PASSED' : 'FAILED', colX[8] + 3, cy, { width: cols[8] - 6, align: 'center' });
      doc.fillColor('#475569').font('Helvetica').text(`${timeMins} min`, colX[9] + 3, cy, { width: cols[9] - 6, align: 'center' });

      rowY += rowH;

      // New page if needed
      if (rowY > doc.page.height - 100) {
        doc.addPage();
        drawWatermark();
        drawSchoolHeader(35);
        rowY = 100;
      }
    }

    // --- Border around table area ---
    doc.rect(45, tableTop - 2, pw, rowY - tableTop + 2).stroke('#cbd5e1').lineWidth(0.5);

    // --- Summary Statistics ---
    let statY = rowY + 10;
    if (statY > doc.page.height - 80) {
      doc.addPage();
      drawWatermark();
      drawSchoolHeader(35);
      statY = 60;
    }

    doc.moveTo(45, statY - 4).lineTo(45 + pw, statY - 4).strokeColor('#8b5cf6').lineWidth(1).stroke();
    doc.fontSize(9).fillColor('#1e1b4b').font('Helvetica-Bold').text('SUMMARY STATISTICS', 45, statY, { width: pw });

    statY += 16;
    doc.rect(45, statY - 4, pw, 45).fill('#f8fafc').stroke('#e2e8f0');
    doc.fontSize(7.5).fillColor('#374151').font('Helvetica');
    doc.text(`Total Students: ${results.length}`, 55, statY);
    doc.text(`Passed: ${passed} (${results.length > 0 ? Math.round(passed / results.length * 10000) / 100 : 0}%)`, 55 + pw / 3, statY);
    doc.text(`Failed: ${results.length - passed} (${results.length > 0 ? Math.round((results.length - passed) / results.length * 10000) / 100 : 0}%)`, 55 + pw * 2 / 3, statY);
    doc.text(`Average Score: ${avgScore}%`, 55, statY + 13);
    doc.text(`Highest Score: ${highest}%`, 55 + pw / 3, statY + 13);
    doc.text(`Lowest Score: ${lowest}%`, 55 + pw * 2 / 3, statY + 13);
    doc.text(`Pass Mark: ${passMark}%`, 55, statY + 26);
    doc.text(`Exam: ${exam.type}`, 55 + pw / 3, statY + 26);
    doc.text(`Subject: ${exam.subject}`, 55 + pw * 2 / 3, statY + 26);
    doc.text(`Class: ${exam.className}`, 55, statY + 39);
    doc.text(`Date Generated: ${downloadDate} at ${downloadTime}`, 55 + pw / 3, statY + 39);

    // --- Official Stamp ---
    const stampY = statY + 56;
    doc.moveTo(45, stampY).lineTo(45 + pw, stampY).strokeColor('#8b5cf6').lineWidth(1).stroke();
    doc.fontSize(7).fillColor('#4338ca').font('Helvetica-Bold');
    doc.text('OFFICIAL DOCUMENT', 45, stampY + 6, { align: 'center', width: pw });
    doc.fontSize(7).fillColor('#64748b').font('Helvetica')
       .text('This is an official computer-generated document from the RESCO CBT System.', 45, stampY + 17, { align: 'center', width: pw });
    doc.text('It does not require a physical signature and is valid as an official academic record.', 45, stampY + 26, { align: 'center', width: pw });

    // --- Signatures ---
    const sigY = stampY + 42;
    doc.moveTo(45, sigY + 30).lineTo(220, sigY + 30).strokeColor('#374151').lineWidth(0.5).stroke();
    doc.moveTo(45 + pw / 2 + 30, sigY + 30).lineTo(45 + pw, sigY + 30).strokeColor('#374151').lineWidth(0.5).stroke();
    doc.fontSize(8).fillColor('#374151').font('Helvetica-Bold').text('Principal', 45, sigY + 35, { align: 'center', width: 175 });
    doc.fontSize(7).fillColor('#6366f1').font('Helvetica-BoldOblique').text('Aderonke Rachael', 45, sigY + 48, { align: 'center', width: 175 });
    doc.fontSize(8).font('Helvetica-Bold').text(teacherName, 45 + pw / 2 + 30, sigY + 35, { align: 'center', width: 175 });
    doc.fontSize(7).fillColor('#6366f1').font('Helvetica-BoldOblique').text('Class Teacher', 45 + pw / 2 + 30, sigY + 48, { align: 'center', width: 175 });

    // --- Footer ---
    doc.fontSize(6.5).fillColor('#94a3b8')
       .text(`Generated by RESCO CBT System on ${now.toLocaleString()}`, 45, doc.page.height - 30, { align: 'center', width: pw });

    // Watermark on every page (retroactive)
    const totalPages = doc.bufferedPageRange();
    for (let i = 0; i < totalPages.count; i++) {
      doc.switchToPage(i);
      drawWatermark();
    }
    doc.switchToPage(0);

    doc.end();
  } catch (error) {
    console.error('[Admin Export Results Error]', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to export results.' });
    }
  }
});

// ============================================================
// GET /users — List ALL users with passwords (for admin)
// ============================================================
router.get('/users', async (req, res) => {
  try {
    const { role, search, page = '1', limit = '100' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(500, parseInt(limit, 10) || 100));
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    if (role && ['STUDENT', 'TEACHER', 'ADMIN', 'PRINCIPAL'].includes(role.toUpperCase())) {
      where.role = role.toUpperCase();
    }
    if (search) {
      const term = search.trim();
      where.OR = [
        { email: { contains: term } },
        { firstName: { contains: term } },
        { lastName: { contains: term } },
        { teacher: { OR: [
          { firstName: { contains: term } },
          { lastName: { contains: term } },
          { username: { contains: term } },
        ]}},
        { student: { OR: [
          { firstName: { contains: term } },
          { lastName: { contains: term } },
          { admissionNo: { contains: term } },
        ]}},
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          student: { select: { admissionNo: true, className: true } },
          teacher: { select: { username: true, status: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        role: u.role,
        firstName: u.firstName,
        lastName: u.lastName,

        admissionNo: u.student?.admissionNo || null,
        className: u.student?.className || null,
        teacherUsername: u.teacher?.username || null,
        teacherStatus: u.teacher?.status || null,
        createdAt: u.createdAt,
      })),
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    console.error('[Admin List Users Error]', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// ============================================================
// PUT /users/:id/password — Change any user's password (admin)
// ============================================================
router.put('/users/:id/password', async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    await prisma.user.update({
      where: { id },
      data: { password: await bcrypt.hash(newPassword, 10) },  // Store as bcrypt hash
    });
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('[Admin Update User Password Error]', error);
    res.status(500).json({ success: false, message: 'Failed to update password' });
  }
});

// ============================================================
// GET /settings/logo — Get school logo
// ============================================================
router.get('/settings/logo', async (req, res) => {
  try {
    let setting = await prisma.settings.findUnique({ where: { key: 'school_logo' } });
    if (setting && setting.value) {
      const matches = setting.value.match(/^data:image\/(\w+);base64,/);
      const contentType = matches ? 'image/' + matches[1] : 'image/png';
      const base64Data = setting.value.replace(/^data:image\/\w+;base64,/, '');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(Buffer.from(base64Data, 'base64'));
    }
    return res.status(404).json({ error: 'No custom logo set' });
  } catch (error) {
    console.error('[Get Logo Error]', error);
    res.status(500).json({ error: 'Failed to get logo' });
  }
});

// ============================================================
// POST /settings/logo — Upload school logo
// ============================================================
router.post('/settings/logo', logoUpload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ success: false, message: 'Only PNG, JPEG, GIF, and WebP images are allowed' });
    }
    const base64 = 'data:' + req.file.mimetype + ';base64,' + req.file.buffer.toString('base64');
    await prisma.settings.upsert({
      where: { key: 'school_logo' },
      update: { value: base64 },
      create: { key: 'school_logo', value: base64 },
    });
    res.json({ success: true, message: 'Logo uploaded successfully' });
  } catch (error) {
    console.error('[Upload Logo Error]', error);
    res.status(500).json({ success: false, message: 'Failed to upload logo' });
  }
});

// ============================================================
// DELETE /settings/logo — Reset to default logo
// ============================================================
router.delete('/settings/logo', async (req, res) => {
  try {
    await prisma.settings.deleteMany({ where: { key: 'school_logo' } });
    res.json({ success: true, message: 'Logo reset to default' });
  } catch (error) {
    console.error('[Delete Logo Error]', error);
    res.status(500).json({ success: false, message: 'Failed to reset logo' });
  }
});

module.exports = router;
