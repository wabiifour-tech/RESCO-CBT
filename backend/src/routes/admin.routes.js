const express = require('express');
const prisma = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleMiddleware');
const bcrypt = require('bcryptjs');

const router = express.Router();

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
          _count: { select: { assignments: true, exams: true } },
        },
      }),
      prisma.teacher.count({ where }),
    ]);

    res.json({
      teachers: teachers.map((t) => ({
        id: t.id,
        firstName: t.firstName,
        lastName: t.lastName,
        email: t.user.email,
        status: t.status,
        subjects: JSON.parse(t.subjects || '[]'),
        createdAt: t.createdAt,
        assignmentCount: t._count.assignments,
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
        _count: { select: { exams: true, assignments: true, results: true } },
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

    // Delete in a transaction: teacher + user (cascade handles related records)
    await prisma.$transaction(async (tx) => {
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
        createdAt: s.createdAt,
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
      createdAt: student.createdAt,
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
// 10. GET /assignments — List All Teacher Assignments
// ============================================================
router.get('/assignments', async (req, res) => {
  try {
    const assignments = await prisma.teacherAssignment.findMany({
      orderBy: [{ academicYear: 'desc' }, { className: 'asc' }, { subject: 'asc' }],
      include: {
        teacher: {
          select: { firstName: true, lastName: true, status: true },
        },
        _count: {
          select: { exams: true },
        },
      },
    });

    res.json(
      assignments.map((a) => ({
        id: a.id,
        teacherId: a.teacherId,
        teacherName: `${a.teacher.firstName} ${a.teacher.lastName}`,
        teacherStatus: a.teacher.status,
        subject: a.subject,
        className: a.className,
        academicYear: a.academicYear,
        examCount: a._count.exams,
      }))
    );
  } catch (error) {
    console.error('[Admin List Assignments Error]', error);
    res.status(500).json({ error: 'Failed to list assignments' });
  }
});

// ============================================================
// 11. POST /assignments — Create Teacher Assignment
// ============================================================
router.post('/assignments', async (req, res) => {
  try {
    const { teacherId, subject, className, academicYear } = req.body;

    // Validate required fields
    if (!teacherId || !subject || !className) {
      return res.status(400).json({
        error: 'Missing required fields: teacherId, subject, className',
      });
    }

    // Check teacher exists and is ACTIVE
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { id: true, firstName: true, lastName: true, status: true },
    });

    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    if (teacher.status !== 'ACTIVE') {
      return res.status(400).json({
        error: `Cannot assign to this teacher. Teacher status is ${teacher.status}. Only ACTIVE teachers can be assigned.`,
      });
    }

    // Check for existing assignment (unique constraint)
    const existingAssignment = await prisma.teacherAssignment.findUnique({
      where: {
        teacherId_subject_className: {
          teacherId,
          subject: subject.trim(),
          className: className.trim(),
        },
      },
    });

    if (existingAssignment) {
      return res.status(409).json({
        error: 'This teacher is already assigned to this subject and class combination',
      });
    }

    // Update teacher's subjects list if the subject is new
    const teacherFull = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { subjects: true },
    });

    const trimmedSubject = subject.trim();
    let currentSubjects = [];
    try { currentSubjects = JSON.parse(teacherFull.subjects || '[]'); } catch(e) { currentSubjects = []; }
    let updatedSubjects = currentSubjects;
    if (!updatedSubjects.includes(trimmedSubject)) {
      updatedSubjects = [...updatedSubjects, trimmedSubject];
    }

    // Create assignment in transaction (also update teacher subjects)
    const assignment = await prisma.$transaction(async (tx) => {
      await tx.teacher.update({
        where: { id: teacherId },
        data: { subjects: JSON.stringify(updatedSubjects) },
      });

      return tx.teacherAssignment.create({
        data: {
          teacherId,
          subject: trimmedSubject,
          className: className.trim(),
          academicYear: academicYear ? academicYear.trim() : undefined,
        },
        include: {
          teacher: {
            select: { firstName: true, lastName: true },
          },
        },
      });
    });

    res.status(201).json({
      id: assignment.id,
      teacherId: assignment.teacherId,
      teacherName: `${assignment.teacher.firstName} ${assignment.teacher.lastName}`,
      subject: assignment.subject,
      className: assignment.className,
      academicYear: assignment.academicYear,
      message: 'Teacher assignment created successfully',
    });
  } catch (error) {
    console.error('[Admin Create Assignment Error]', error);
    res.status(500).json({ error: 'Failed to create teacher assignment' });
  }
});

// ============================================================
// 12. DELETE /assignments/:id — Delete Assignment
// ============================================================
router.delete('/assignments/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const assignment = await prisma.teacherAssignment.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            exams: true,
          },
        },
      },
    });

    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    // Check if any published exams use this assignment
    const publishedExamsCount = await prisma.exam.count({
      where: {
        assignmentId: id,
        status: 'PUBLISHED',
      },
    });

    if (publishedExamsCount > 0) {
      return res.status(400).json({
        error: `Cannot delete assignment. It has ${publishedExamsCount} published exam(s) linked to it.`,
      });
    }

    await prisma.teacherAssignment.delete({
      where: { id },
    });

    res.json({ message: 'Teacher assignment deleted successfully' });
  } catch (error) {
    console.error('[Admin Delete Assignment Error]', error);
    res.status(500).json({ error: 'Failed to delete teacher assignment' });
  }
});

// ============================================================
// 13. GET /analytics — System Analytics
// ============================================================
router.get('/analytics', async (req, res) => {
  try {
    // 1. Performance by class — average scores per class
    const classPerformance = await prisma.result.groupBy({
      by: ['studentId'],
      _avg: { percentage: true },
      include: {
        student: {
          select: { className: true },
        },
      },
    });

    // Aggregate by class
    const classScores = {};
    for (const cp of classPerformance) {
      const cls = cp.student.className;
      if (!classScores[cls]) {
        classScores[cls] = { total: 0, count: 0 };
      }
      classScores[cls].total += cp._avg.percentage || 0;
      classScores[cls].count += 1;
    }

    const performanceByClass = Object.entries(classScores).map(([className, data]) => ({
      className,
      averageScore: Math.round((data.total / data.count) * 100) / 100,
      studentCount: data.count,
    }));

    // 2. Performance by subject — average scores per subject
    const examResults = await prisma.result.findMany({
      include: {
        exam: {
          include: {
            assignment: {
              select: { subject: true },
            },
          },
        },
      },
    });

    const subjectScores = {};
    for (const r of examResults) {
      const subj = r.exam.assignment?.subject || 'Unknown';
      if (!subjectScores[subj]) {
        subjectScores[subj] = { total: 0, count: 0 };
      }
      subjectScores[subj].total += r.percentage;
      subjectScores[subj].count += 1;
    }

    const performanceBySubject = Object.entries(subjectScores).map(([subject, data]) => ({
      subject,
      averageScore: Math.round((data.total / data.count) * 100) / 100,
      resultCount: data.count,
    }));

    // 3. Exam completion rates
    const exams = await prisma.exam.findMany({
      where: { status: 'PUBLISHED' },
      select: {
        id: true,
        title: true,
        _count: { select: { results: true } },
        assignment: {
          select: {
            className: true,
          },
        },
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
      const totalStudents = classStudentMap[exam.assignment.className] || 0;
      const completedCount = exam._count.results;
      const completionRate = totalStudents > 0
        ? Math.round((completedCount / totalStudents) * 10000) / 100
        : 0;

      return {
        examId: exam.id,
        title: exam.title,
        className: exam.assignment.className,
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
        assignment: {
          include: {
            teacher: {
              select: { firstName: true, lastName: true },
            },
          },
        },
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
      subject: exam.assignment.subject,
      className: exam.assignment.className,
      teacherName: `${exam.assignment.teacher.firstName} ${exam.assignment.teacher.lastName}`,
      questionCount: exam._count.questions,
      resultCount: exam._count.results,
      startDate: exam.startDate,
      endDate: exam.endDate,
    }));

    res.json({
      performanceByClass,
      performanceBySubject,
      examCompletionRates,
      topStudents: topStudentsData,
      recentlyActiveExams: recentExams,
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
      where.assignment = {
        ...where.assignment,
        subject: { contains: subject.trim() },
      };
    }

    if (className) {
      where.assignment = {
        ...where.assignment,
        className: className.trim(),
      };
    }

    const [exams, total] = await Promise.all([
      prisma.exam.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          assignment: {
            include: {
              teacher: {
                select: { firstName: true, lastName: true },
              },
            },
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
        teacherName: `${e.assignment.teacher.firstName} ${e.assignment.teacher.lastName}`,
        subject: e.assignment.subject,
        className: e.assignment.className,
        academicYear: e.assignment.academicYear,
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

module.exports = router;
