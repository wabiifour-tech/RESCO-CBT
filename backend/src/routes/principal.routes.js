const express = require('express');
const prisma = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleMiddleware');

const router = express.Router();

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
    // 1. Performance by class
    const allResults = await prisma.result.findMany({
      include: {
        student: { select: { className: true } },
        exam: { select: { subject: true, className: true, passMark: true } },
      },
    });

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
      if (data.percentages.length === 0) continue;
      const avg = data.percentages.reduce((a, b) => a + b, 0) / data.percentages.length;
      if (!classScores[data.cls]) {
        classScores[data.cls] = { total: 0, count: 0 };
      }
      classScores[data.cls].total += avg;
      classScores[data.cls].count += 1;
    }

    const performanceByClass = Object.entries(classScores)
      .map(([className, data]) => ({
        className,
        averageScore: data.count > 0 ? Math.round((data.total / data.count) * 100) / 100 : 0,
        studentCount: data.count,
      }))
      .sort((a, b) => b.averageScore - a.averageScore);

    // 2. Performance by subject
    const subjectScores = {};
    for (const r of allResults) {
      if (!r.exam) continue;
      const subj = r.exam?.subject || 'Unknown';
      if (!subjectScores[subj]) {
        subjectScores[subj] = { total: 0, count: 0 };
      }
      subjectScores[subj].total += r.percentage;
      subjectScores[subj].count += 1;
    }

    const performanceBySubject = Object.entries(subjectScores)
      .map(([subject, data]) => ({
        subject,
        averageScore: data.count > 0 ? Math.round((data.total / data.count) * 100) / 100 : 0,
        resultCount: data.count,
      }))
      .sort((a, b) => b.averageScore - a.averageScore);

    // 3. Pass/Fail overview
    let passedCount = 0;
    let failedCount = 0;
    for (const r of allResults) {
      const passMark = r.exam?.passMark || 50;
      if (r.percentage >= passMark) passedCount++;
      else failedCount++;
    }

    // 4. Top performing students (top 20)
    const topStudentAgg = await prisma.result.groupBy({
      by: ['studentId'],
      _avg: { percentage: true },
      _count: { id: true },
      orderBy: { _avg: { percentage: 'desc' } },
      take: 20,
    });

    const topStudents = (await Promise.all(
      topStudentAgg.map(async (ts) => {
        const student = await prisma.student.findUnique({
          where: { id: ts.studentId },
        });
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
    )).filter(Boolean);

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
      passFail: { passed: passedCount, failed: failedCount, total: allResults.length },
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
    const highest = scores.length > 0 ? Math.max(...scores) : 0;
    const lowest = scores.length > 0 ? Math.min(...scores) : 0;
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
    const ranked = results.map((r, idx) => {
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
    doc.text(`Total Students: ${ranked.length}  |  Average: ${Math.round(avg * 100) / 100}%  |  Highest: ${Math.max(...scores)}%  |  Lowest: ${Math.min(...scores)}%`, 50, y);
    y += 14;
    doc.text(`Passed: ${passCount}  |  Failed: ${ranked.length - passCount}  |  Pass Rate: ${Math.round((passCount / ranked.length) * 10000) / 100}%`, 50, y);

    doc.end();
  } catch (error) {
    console.error('[Principal Export Results Error]', error);
    res.status(500).json({ error: 'Failed to export results' });
  }
});

// ============================================================
// 9. GET /change-password — Principal Password Change (reuses auth)
// This is handled by the global /api/auth/change-password endpoint
// ============================================================

module.exports = router;
