const express = require('express');
const multer = require('multer');
const prisma = require('../config/database');
const bcrypt = require('bcryptjs');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleMiddleware');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files (PNG, JPG, GIF, WebP) are allowed'));
  },
});

// All principal routes require authentication and PRINCIPAL role
router.use(authenticate, requireRole('PRINCIPAL'));

// ============================================================
// 1. GET /dashboard — Principal Overview Stats
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
      draftExams,
      archivedExams,
      totalResults,
      recentRegistrations,
      totalQuestions,
    ] = await Promise.all([
      prisma.student.count(),
      prisma.teacher.count(),
      prisma.teacher.count({ where: { status: 'ACTIVE' } }),
      prisma.teacher.count({ where: { status: 'PENDING' } }),
      prisma.exam.count(),
      prisma.exam.count({ where: { status: 'PUBLISHED' } }),
      prisma.exam.count({ where: { status: 'DRAFT' } }),
      prisma.exam.count({ where: { status: 'ARCHIVED' } }),
      prisma.result.count(),
      prisma.user.count({
        where: {
          role: { in: ['STUDENT', 'TEACHER'] },
          createdAt: { gte: sevenDaysAgo.toISOString() },
        },
      }),
      prisma.examQuestion.count(),
    ]);

    // Average score across all results
    const avgResult = await prisma.result.aggregate({
      _avg: { percentage: true },
    });

    // Class distribution
    const classDistribution = await prisma.student.groupBy({
      by: ['className'],
      _count: { id: true },
      orderBy: { className: 'asc' },
    });

    res.json({
      totalStudents,
      totalTeachers,
      activeTeachers,
      pendingTeachers,
      totalExams,
      publishedExams,
      draftExams,
      archivedExams,
      totalResults,
      totalQuestions,
      recentRegistrations,
      averageScore: Math.round((avgResult._avg.percentage || 0) * 100) / 100,
      classDistribution: classDistribution.map((c) => ({
        className: c.className,
        count: c._count.id,
      })),
    });
  } catch (error) {
    console.error('[Principal Dashboard Error]', error);
    res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
});

// ============================================================
// 2. GET /analytics — School Performance Analytics
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

    const performanceByClass = Object.entries(classScores)
      .map(([className, data]) => ({
        className,
        averageScore: data.count > 0 ? Math.round((data.total / data.count) * 100) / 100 : 0,
        studentCount: data.count,
      }))
      .sort((a, b) => b.averageScore - a.averageScore);

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

    const performanceBySubject = Object.entries(subjectScores)
      .map(([subject, data]) => ({
        subject,
        averageScore: data.count > 0 ? Math.round((data.total / data.count) * 100) / 100 : 0,
        resultCount: data.count,
      }))
      .sort((a, b) => b.averageScore - a.averageScore);

    // 3. Pass/Fail overview — load only needed fields for accuracy
    const resultPassFail = await prisma.result.findMany({
      select: { examId: true, percentage: true },
    });
    let passedCount = 0;
    let failedCount = 0;
    for (const r of resultPassFail) {
      const exam = examMap[r.examId];
      const passMark = exam?.passMark || 50;
      if (r.percentage >= passMark) passedCount++;
      else failedCount++;
    }

    // 4. Top performing students (reuse classAgg from step 1, then fetch accurate counts)
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
          averageScore: Math.round((ts._avg.percentage || 0) * 100) / 100,
          examsTaken: ts._count.id,
        };
      })
      .filter(Boolean);

    // 5. Recent exam activity (last 30 days)
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
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const recentExams = recentActiveExams.map((exam) => ({
      examId: exam.id,
      title: exam.title,
      type: exam.type,
      subject: exam.subject,
      className: exam.className,
      teacherName: exam.teacher ? `${exam.teacher.firstName} ${exam.teacher.lastName}` : 'Unknown',
      questionCount: exam._count.questions,
      resultCount: exam._count.results,
      startDate: exam.startDate,
      endDate: exam.endDate,
    }));

    // 6. Exam completion rates
    const publishedExams = await prisma.exam.findMany({
      where: { status: 'PUBLISHED' },
      select: {
        id: true,
        title: true,
        _count: { select: { results: true } },
        className: true,
        subject: true,
      },
    });

    const studentClassCounts = await prisma.student.groupBy({
      by: ['className'],
      _count: { id: true },
    });

    const classStudentMap = {};
    for (const s of studentClassCounts) {
      classStudentMap[s.className] = s._count.id;
    }

    const examCompletionRates = publishedExams.map((exam) => {
      const totalStudents = classStudentMap[exam.className] || 0;
      const completedCount = exam._count.results;
      const completionRate = totalStudents > 0
        ? Math.round((completedCount / totalStudents) * 10000) / 100
        : 0;

      return {
        examId: exam.id,
        title: exam.title,
        subject: exam.subject,
        className: exam.className,
        totalStudents,
        completedCount,
        completionRate,
      };
    });

    res.json({
      performanceByClass,
      performanceBySubject,
      passFail: { passed: passedCount, failed: failedCount, total: resultPassFail.length },
      topStudents,
      recentlyActiveExams: recentExams,
      examCompletionRates,
    });
  } catch (error) {
    console.error('[Principal Analytics Error]', error);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

// ============================================================
// 3. GET /teachers — View All Teachers (read-only)
// ============================================================
router.get('/teachers', async (req, res) => {
  try {
    const {
      status,
      search,
      page = '1',
      limit = '50',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

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
    console.error('[Principal List Teachers Error]', error);
    res.status(500).json({ error: 'Failed to list teachers' });
  }
});

// ============================================================
// 4. GET /students — View All Students (read-only)
// ============================================================
router.get('/students', async (req, res) => {
  try {
    const {
      className,
      search,
      page = '1',
      limit = '50',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

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
    console.error('[Principal List Students Error]', error);
    res.status(500).json({ error: 'Failed to list students' });
  }
});

// ============================================================
// 5. GET /exams — View All Exams (read-only)
// ============================================================
router.get('/exams', async (req, res) => {
  try {
    const {
      status,
      type,
      subject,
      class: className,
      page = '1',
      limit = '50',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

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
          teacher: { select: { firstName: true, lastName: true } },
          _count: { select: { questions: true, results: true } },
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
      })),
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('[Principal List Exams Error]', error);
    res.status(500).json({ error: 'Failed to list exams' });
  }
});

// ============================================================
// 6. GET /results/filter-options — Get Classes & Subjects
// ============================================================
router.get('/results/filter-options', async (req, res) => {
  try {
    const [classes, subjects] = await Promise.all([
      prisma.student.groupBy({ by: ['className'], orderBy: { className: 'asc' } }),
      prisma.exam.findMany({ select: { subject: true }, distinct: ['subject'], orderBy: { subject: 'asc' } }),
    ]);

    res.json({
      classes: classes.map((c) => c.className),
      subjects: subjects.map((s) => s.subject),
    });
  } catch (error) {
    console.error('[Principal Filter Options Error]', error);
    res.status(500).json({ error: 'Failed to load filter options' });
  }
});

// ============================================================
// 7. GET /results/:examId — View Exam Results
// ============================================================
router.get('/results/:examId', async (req, res) => {
  try {
    const { examId } = req.params;

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        teacher: { select: { firstName: true, lastName: true } },
        _count: { select: { questions: true, results: true } },
      },
    });

    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const results = await prisma.result.findMany({
      where: { examId },
      include: {
        student: { select: { firstName: true, lastName: true, admissionNo: true, className: true } },
      },
      orderBy: { percentage: 'desc' },
    });

    const ranked = results.map((r, idx) => ({
      rank: idx + 1,
      studentId: r.studentId,
      firstName: r.student?.firstName || 'Unknown',
      lastName: r.student?.lastName || 'Unknown',
      admissionNo: r.student?.admissionNo || 'N/A',
      className: r.student?.className || 'N/A',
      score: r.score,
      totalMarks: r.totalMarks,
      percentage: Math.round(r.percentage * 100) / 100,
      status: r.percentage >= exam.passMark ? 'PASS' : 'FAIL',
      timeSpent: r.timeSpent,
      submittedAt: r.submittedAt,
    }));

    // Summary stats
    const scores = ranked.map((r) => r.percentage);
    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const highest = scores.length > 0 ? scores.reduce((a, b) => Math.max(a, b), -Infinity) : 0;
    const lowest = scores.length > 0 ? scores.reduce((a, b) => Math.min(a, b), Infinity) : 0;
    const passCount = ranked.filter((r) => r.status === 'PASS').length;

    res.json({
      exam: {
        id: exam.id,
        title: exam.title,
        subject: exam.subject,
        className: exam.className,
        type: exam.type,
        totalMarks: exam.totalMarks,
        passMark: exam.passMark,
        teacherName: exam.teacher ? `${exam.teacher.firstName} ${exam.teacher.lastName}` : 'Unknown',
        questionCount: exam._count.questions,
      },
      results: ranked,
      summary: {
        totalStudents: ranked.length,
        average: Math.round(avg * 100) / 100,
        highest: Math.round(highest * 100) / 100,
        lowest: Math.round(lowest * 100) / 100,
        passCount,
        failCount: ranked.length - passCount,
        passRate: ranked.length > 0 ? Math.round((passCount / ranked.length) * 10000) / 100 : 0,
      },
    });
  } catch (error) {
    console.error('[Principal Exam Results Error]', error);
    res.status(500).json({ error: 'Failed to load results' });
  }
});

// ============================================================
// 8. GET /results/export/:examId — Export Results as PDF
// ============================================================
router.get('/results/export/:examId', async (req, res) => {
  try {
    const { examId } = req.params;
    const { format } = req.query;

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        teacher: { select: { firstName: true, lastName: true } },
        _count: { select: { questions: true, results: true } },
      },
    });

    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const results = await prisma.result.findMany({
      where: { examId },
      include: {
        student: { select: { firstName: true, lastName: true, admissionNo: true, className: true } },
      },
      orderBy: { percentage: 'desc' },
    });

    if (results.length === 0) {
      return res.status(404).json({ error: 'No results found for this exam' });
    }

    const validResults = results.filter(r => r.student);
    if (validResults.length === 0) {
      return res.status(404).json({ error: 'No valid student records found.' });
    }

    // CSV format
    if (format === 'csv') {
      const filename = `${exam.title.replace(/[^a-zA-Z0-9]/g, '_')}_Results`;
      const headers = ['Rank', 'Admission No', 'First Name', 'Last Name', 'Class', 'Score', 'Total Marks', 'Percentage', 'Status', 'Time Spent (min)', 'Submitted At'];
      const ranked = validResults.map((r, idx) => {
        const pct = Math.round(r.percentage * 100) / 100;
        const status = pct >= exam.passMark ? 'PASS' : 'FAIL';
        return [
          idx + 1,
          r.student?.admissionNo || 'N/A',
          r.student?.firstName || 'Unknown',
          r.student?.lastName || 'Unknown',
          r.student?.className || 'N/A',
          r.score,
          r.totalMarks,
          `${pct}%`,
          status,
          r.timeSpent != null ? Math.round(r.timeSpent / 60) : 'N/A',
          r.submittedAt ? r.submittedAt.toISOString().replace('T', ' ').substring(0, 19) : '',
        ];
      });

      // Sanitize cells to prevent CSV formula injection (=, +, -, @, \t, \r prefixes)
      const sanitizeCSVCell = (val) => { const s = String(val ?? ''); return /^[=+\-@\t\r]/.test(s) ? "'" + s : s; };
      const csv = [headers.join(','), ...ranked.map(row => row.map(v => { const s = sanitizeCSVCell(v); return `"${s.replace(/"/g, '""')}"`; }).join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      return res.send(csv);
    }

    // Generate PDF using PDFKit
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${exam.title.replace(/[^a-zA-Z0-9]/g, '_')}_Results.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(14).font('Helvetica-Bold').text("Redeemer's Schools and College, Owotoro", { align: 'center' });
    doc.fontSize(9).font('Helvetica').text('Agunrege - Ago Are Road, Saki, Oyo State', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(12).font('Helvetica-Bold').text('EXAMINATION RESULTS', { align: 'center' });
    doc.moveDown(0.5);

    // Exam Info
    doc.fontSize(10).font('Helvetica');
    doc.text(`Exam: ${exam.title}`, 50);
    doc.text(`Subject: ${exam.subject}`);
    doc.text(`Class: ${exam.className}`);
    doc.text(`Teacher: ${exam.teacher ? exam.teacher.firstName + ' ' + exam.teacher.lastName : 'N/A'}`);
    doc.text(`Total Marks: ${exam.totalMarks}  |  Pass Mark: ${exam.passMark}`);
    doc.text(`Date: ${new Date().toLocaleDateString('en-GB')}`);
    doc.moveDown(0.8);

    // Results Table
    const ranked = validResults.map((r, idx) => {
      const pct = Math.round(r.percentage * 100) / 100;
      const status = pct >= exam.passMark ? 'PASS' : 'FAIL';
      return { ...r, rank: idx + 1, pct, status };
    });

    const tableTop = doc.y;
    const colWidths = [30, 55, 90, 50, 55, 50, 50, 50];
    const headers = ['#', 'Adm. No.', 'Name', 'Class', 'Score', 'Total', '%', 'Status'];

    // Header row
    doc.rect(50, tableTop, colWidths.reduce((a, b) => a + b, 0), 20).fill('#4f46e5');
    doc.fill('#ffffff').fontSize(8).font('Helvetica-Bold');
    let x = 50;
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], x + 3, tableTop + 5, { width: colWidths[i] - 6, align: 'center' });
      x += colWidths[i];
    }

    // Data rows
    doc.fill('#000000').font('Helvetica').fontSize(8);
    let y = tableTop + 20;
    for (const r of ranked) {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
      const bg = r.status === 'PASS' ? '#f0fdf4' : '#fef2f2';
      doc.rect(50, y, colWidths.reduce((a, b) => a + b, 0), 18).fill(bg);
      const name = (r.student?.firstName || '') + ' ' + (r.student?.lastName || '');
      const row = [r.rank, r.student?.admissionNo || '', name, r.student?.className || '', r.score, r.totalMarks, r.pct + '%', r.status];
      doc.fill('#1e293b');
      x = 50;
      for (let i = 0; i < row.length; i++) {
        doc.text(String(row[i]), x + 3, y + 4, { width: colWidths[i] - 6, align: 'center' });
        x += colWidths[i];
      }
      y += 18;
    }

    // Summary
    y += 15;
    if (y > 650) { doc.addPage(); y = 50; }
    doc.font('Helvetica-Bold').fontSize(10).text('Summary Statistics', 50, y);
    y += 18;
    doc.font('Helvetica').fontSize(9);
    const scores = ranked.map((r) => r.pct);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const passCount = ranked.filter((r) => r.status === 'PASS').length;
    doc.text(`Total Students: ${ranked.length}  |  Average: ${Math.round(avg * 100) / 100}%  |  Highest: ${highest}%  |  Lowest: ${lowest}%`, 50, y);
    y += 14;
    doc.text(`Passed: ${passCount}  |  Failed: ${ranked.length - passCount}  |  Pass Rate: ${Math.round((passCount / ranked.length) * 10000) / 100}%`, 50, y);

    doc.end();
  } catch (error) {
    console.error('[Principal Export Results Error]', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to export results.' });
    }
  }
});

// ============================================================
// 9. GET /change-password — Principal Password Change (reuses auth)
// This is handled by the global /api/auth/change-password endpoint
// ============================================================

// ============================================================
// POST /principal/teachers/create — Create Teacher
// ============================================================
router.post('/teachers/create', async (req, res) => {
  try {
    const { firstName, lastName, username, password, classAssignments } = req.body;
    if (!firstName || !lastName || !username || !password) {
      return res.status(400).json({ success: false, message: 'Missing required fields: firstName, lastName, username, password' });
    }
    // Validate classAssignments if provided
    if (classAssignments && Array.isArray(classAssignments)) {
      for (let i = 0; i < classAssignments.length; i++) {
        const ca = classAssignments[i];
        if (!ca.className || !ca.subject) {
          return res.status(400).json({
            success: false,
            message: `classAssignments[${i}]: each item must have className and subject`,
          });
        }
      }
    }
    const trimmedUsername = username.trim().toLowerCase();
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    const existingTeacher = await prisma.teacher.findUnique({ where: { username: trimmedUsername } });
    if (existingTeacher) {
      return res.status(409).json({ success: false, message: 'A teacher with this username already exists' });
    }
    const generatedEmail = `${trimmedUsername}@resco.local`;
    const existingEmail = await prisma.user.findUnique({ where: { email: generatedEmail } });
    if (existingEmail) {
      return res.status(409).json({ success: false, message: 'A user with this generated email already exists.' });
    }
    // Build subjects array from unique subjects in classAssignments
    const subjectsArray = classAssignments && Array.isArray(classAssignments)
      ? [...new Set(classAssignments.map(ca => ca.subject.trim()))]
      : [];

    const teacher = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: generatedEmail, password: await bcrypt.hash(password, 10), role: 'TEACHER', firstName: firstName.trim(), lastName: lastName.trim() },
      });
      const createdTeacher = await tx.teacher.create({
        data: {
          id: user.id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          username: trimmedUsername,
          status: 'ACTIVE',
          subjects: JSON.stringify(subjectsArray),
        },
        include: { user: { select: { email: true, createdAt: true } } },
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
      success: true,
      id: teacher.id,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      username: teacher.username,
      status: teacher.status,
      message: 'Teacher created successfully',
    });
  } catch (error) {
    console.error('[Principal Create Teacher Error]', error);
    if (error.code === 'P2002') {
      const target = error.meta?.target || [];
      if (target.includes('username')) return res.status(409).json({ success: false, message: 'A teacher with this username already exists.' });
      if (target.includes('email')) return res.status(409).json({ success: false, message: 'A user with this email already exists.' });
      return res.status(409).json({ success: false, message: 'Duplicate record detected.' });
    }
    res.status(500).json({ success: false, message: 'Failed to create teacher' });
  }
});

// ============================================================
// DELETE /principal/teachers/:id — Delete Teacher
// ============================================================
router.delete('/teachers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const teacher = await prisma.teacher.findUnique({
      where: { id },
      include: { _count: { select: { exams: true } } },
    });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }
    const user = await prisma.user.findUnique({ where: { id } });
    if (user && (user.role === 'ADMIN' || user.role === 'PRINCIPAL')) {
      return res.status(403).json({ success: false, message: 'Cannot delete this user' });
    }
    await prisma.$transaction(async (tx) => {
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
    res.json({ success: true, message: 'Teacher deleted successfully' });
  } catch (error) {
    console.error('[Principal Delete Teacher Error]', error);
    res.status(500).json({ success: false, message: 'Failed to delete teacher' });
  }
});

// ============================================================
// POST /principal/students/create — Create Single Student
// ============================================================
router.post('/students/create', async (req, res) => {
  try {
    const { email, password, firstName, lastName, className, admissionNo } = req.body;
    if (!email || !password || !firstName || !lastName || !className || !admissionNo) {
      return res.status(400).json({ success: false, message: 'Missing required fields: email, password, firstName, lastName, className, admissionNo' });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedAdmissionNo = admissionNo.trim();
    const existingUser = await prisma.user.findUnique({ where: { email: trimmedEmail } });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'A user with this email already exists' });
    }
    const existingStudent = await prisma.student.findUnique({ where: { admissionNo: trimmedAdmissionNo } });
    if (existingStudent) {
      return res.status(409).json({ success: false, message: 'A student with this admission number already exists' });
    }
    const student = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: trimmedEmail, password: await bcrypt.hash(password, 10), role: 'STUDENT' },
      });
      return tx.student.create({
        data: {
          id: user.id,
          admissionNo: trimmedAdmissionNo,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          className: className.trim(),
        },
        include: { user: { select: { email: true, createdAt: true } } },
      });
    });
    res.status(201).json({
      success: true,
      id: student.id,
      admissionNo: student.admissionNo,
      firstName: student.firstName,
      lastName: student.lastName,
      className: student.className,
      email: student.user?.email,
      message: 'Student created successfully',
    });
  } catch (error) {
    console.error('[Principal Create Student Error]', error);
    if (error.code === 'P2002') {
      const target = error.meta?.target || [];
      if (target.includes('email')) return res.status(409).json({ success: false, message: 'A user with this email already exists.' });
      if (target.includes('admission_no')) return res.status(409).json({ success: false, message: 'A student with this admission number already exists.' });
    }
    res.status(500).json({ success: false, message: 'Failed to create student' });
  }
});

// ============================================================
// POST /principal/students/bulk — Bulk Create Students
// ============================================================
router.post('/students/bulk', async (req, res) => {
  try {
    const { students } = req.body;
    if (!students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ success: false, message: 'Request body must contain a non-empty "students" array' });
    }
    if (students.length > 500) {
      return res.status(400).json({ success: false, message: 'Maximum 500 students per request' });
    }
    const errors = [];
    const validStudents = [];
    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      const row = i + 1;
      if (!s.email || !s.password || !s.firstName || !s.lastName || !s.className || !s.admissionNo) {
        errors.push({ row, admissionNo: s.admissionNo || 'N/A', error: 'Missing required fields' });
        continue;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(s.email)) {
        errors.push({ row, admissionNo: s.admissionNo, error: `Invalid email: ${s.email}` });
        continue;
      }
      if (s.password.length < 6) {
        errors.push({ row, admissionNo: s.admissionNo, error: 'Password must be at least 6 characters' });
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
      return res.status(400).json({ success: false, created: 0, errors, message: 'No valid student records' });
    }
    const admissionNos = validStudents.map(s => s.admissionNo);
    const emailList = validStudents.map(s => s.email);
    const dupAdmissionNos = admissionNos.filter((n, i) => admissionNos.indexOf(n) !== i);
    const dupEmails = emailList.filter((e, i) => emailList.indexOf(e) !== i);
    dupAdmissionNos.forEach(dup => errors.push({ admissionNo: dup, error: `Duplicate admission number in batch: ${dup}` }));
    dupEmails.forEach(dup => errors.push({ admissionNo: validStudents.find(s => s.email === dup)?.admissionNo || 'N/A', error: `Duplicate email in batch: ${dup}` }));
    const cleanStudents = validStudents.filter(s => !dupAdmissionNos.includes(s.admissionNo) && !dupEmails.includes(s.email));
    if (cleanStudents.length === 0) {
      return res.status(400).json({ success: false, created: 0, errors, message: 'All records have duplicates' });
    }
    const existingAdmissionNos = await prisma.student.findMany({ where: { admissionNo: { in: cleanStudents.map(s => s.admissionNo) } }, select: { admissionNo: true } });
    const existingEmails = await prisma.user.findMany({ where: { email: { in: cleanStudents.map(s => s.email) } }, select: { email: true } });
    const existingAdmSet = new Set(existingAdmissionNos.map(s => s.admissionNo));
    const existingEmailSet = new Set(existingEmails.map(u => u.email));
    const toCreate = cleanStudents.filter(s => {
      if (existingAdmSet.has(s.admissionNo)) { errors.push({ admissionNo: s.admissionNo, error: 'Admission number already exists' }); return false; }
      if (existingEmailSet.has(s.email)) { errors.push({ admissionNo: s.admissionNo, error: 'Email already exists' }); return false; }
      return true;
    });
    let createdCount = 0;
    if (toCreate.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const s of toCreate) {
          const user = await tx.user.create({ data: { email: s.email, password: await bcrypt.hash(s.password, 10), role: 'STUDENT' } });
          await tx.student.create({ data: { id: user.id, admissionNo: s.admissionNo, firstName: s.firstName, lastName: s.lastName, className: s.className } });
          createdCount++;
        }
      });
    }
    res.status(201).json({
      success: true,
      created: createdCount,
      total: students.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `${createdCount} student(s) created successfully${errors.length > 0 ? ` with ${errors.length} error(s)` : ''}`,
    });
  } catch (error) {
    console.error('[Principal Bulk Create Students Error]', error);
    res.status(500).json({ success: false, message: 'Failed to create students in bulk' });
  }
});

// ============================================================
// DELETE /principal/students/:id — Delete Student
// ============================================================
router.delete('/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const student = await prisma.student.findUnique({ where: { id } });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    const user = await prisma.user.findUnique({ where: { id } });
    if (user && (user.role === 'ADMIN' || user.role === 'PRINCIPAL')) {
      return res.status(403).json({ success: false, message: 'Cannot delete this user' });
    }
    await prisma.$transaction(async (tx) => {
      const results = await tx.result.findMany({ where: { studentId: id }, select: { id: true } });
      if (results.length > 0) {
        await tx.resultAnswer.deleteMany({ where: { resultId: { in: results.map(r => r.id) } } });
        await tx.result.deleteMany({ where: { id: { in: results.map(r => r.id) } } });
      }
      await tx.student.delete({ where: { id } });
      await tx.user.delete({ where: { id } });
    });
    res.json({ success: true, message: 'Student deleted successfully' });
  } catch (error) {
    console.error('[Principal Delete Student Error]', error);
    res.status(500).json({ success: false, message: 'Failed to delete student' });
  }
});

// ============================================================
// GET /users — List ALL users with passwords (for principal/admin)
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
    console.error('[Principal List Users Error]', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// ============================================================
// PUT /users/:id/password — Change any user's password (principal/admin)
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
    if (user.role === 'ADMIN' || user.role === 'PRINCIPAL') {
      return res.status(403).json({ success: false, message: 'Cannot reset this user\'s password.' });
    }
    await prisma.user.update({
      where: { id },
      data: { password: await bcrypt.hash(newPassword, 10) },  // Store as bcrypt hash
    });
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('[Principal Update User Password Error]', error);
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
router.post('/settings/logo', upload.single('logo'), async (req, res) => {
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
