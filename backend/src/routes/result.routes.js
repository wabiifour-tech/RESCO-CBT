const express = require('express');
const prisma = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requireRole, requireTeacherActive } = require('../middleware/roleMiddleware');

const router = express.Router();

// ========================================
// STUDENT: Submit Exam
// ========================================

router.post('/submit', authenticate, requireRole('STUDENT'), async (req, res) => {
  try {
    const { examId, answers, timeSpent } = req.body;

    if (!examId || !answers || !Array.isArray(answers)) {
      return res.status(400).json({ success: false, message: 'Missing required fields: examId, answers.' });
    }

    const studentId = req.user.userId;

    // Verify exam is published and accessible
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: { assignment: { select: { subject: true, className: true } } },
    });

    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found.' });
    }

    if (exam.status !== 'PUBLISHED') {
      return res.status(400).json({ success: false, message: 'This exam is not available.' });
    }

    // Check student hasn't already submitted
    const existingResult = await prisma.result.findUnique({
      where: { examId_studentId: { examId, studentId } },
    });

    if (existingResult) {
      return res.status(400).json({ success: false, message: 'You have already submitted this exam.' });
    }

    // Get all questions for this exam
    const questions = await prisma.examQuestion.findMany({
      where: { examId },
    });

    // Build question map
    const questionMap = {};
    questions.forEach(q => { questionMap[q.id] = q; });

    // Grade answers
    let score = 0;
    const resultAnswers = answers.map(a => {
      const question = questionMap[a.questionId];
      const isCorrect = question ? (a.selected && a.selected.toUpperCase() === question.answer) : false;
      if (isCorrect) score += question.marks;
      return {
        questionId: a.questionId,
        selected: a.selected ? a.selected.toUpperCase() : null,
        correct: isCorrect ? 1 : 0,
      };
    });

    const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
    const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;
    const passed = percentage >= exam.passMark;

    // Create result and answers in transaction
    const result = await prisma.$transaction(async (tx) => {
      const newResult = await tx.result.create({
        data: {
          examId,
          studentId,
          score,
          totalMarks,
          percentage: Math.round(percentage * 100) / 100,
          timeSpent: timeSpent || 0,
        },
      });

      await tx.resultAnswer.createMany({
        data: resultAnswers.map(a => ({
          resultId: newResult.id,
          questionId: a.questionId,
          selected: a.selected,
          correct: a.correct,
        })),
      });

      return newResult;
    });

    // Build response based on visibility
    const responseData = {
      success: true,
      result: {
        id: result.id,
        score,
        totalMarks,
        percentage: Math.round(percentage * 100) / 100,
        passed,
        timeSpent: timeSpent || 0,
        submittedAt: result.submittedAt,
      },
    };

    // If IMMEDIATE visibility, include answer details
    if (exam.resultVisibility === 'IMMEDIATE') {
      responseData.result.answers = resultAnswers.map((a, i) => {
        const question = questionMap[a.questionId];
        return {
          questionId: a.questionId,
          question: question ? question.question : '',
          selected: a.selected,
          correct: a.correct === 1 === 1,
          correctAnswer: question ? question.answer : null,
        };
      });
    }

    res.status(201).json(responseData);
  } catch (error) {
    console.error('Submit exam error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit exam.' });
  }
});

// ========================================
// STUDENT: Get My Results
// ========================================

router.get('/student', authenticate, requireRole('STUDENT'), async (req, res) => {
  try {
    const results = await prisma.result.findMany({
      where: { studentId: req.user.userId },
      include: {
        exam: {
          select: {
            title: true,
            type: true,
            duration: true,
            assignment: { select: { subject: true, className: true } },
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    res.json({ success: true, results });
  } catch (error) {
    console.error('Get student results error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch results.' });
  }
});

// STUDENT: Get result for a specific exam
router.get('/student/:examId', authenticate, requireRole('STUDENT'), async (req, res) => {
  try {
    const { examId } = req.params;

    const result = await prisma.result.findUnique({
      where: { examId_studentId: { examId, studentId: req.user.userId } },
      include: {
        exam: { include: { assignment: { select: { subject: true } } } },
        answers: { include: { question: { select: { question: true, optionA: true, optionB: true, optionC: true, optionD: true, answer: true } } } },
      },
    });

    if (!result) {
      return res.status(404).json({ success: false, message: 'Result not found.' });
    }

    // Check result visibility
    if (result.exam.resultVisibility === 'AFTER_CLOSE' && new Date(result.exam.endDate) > new Date()) {
      return res.status(200).json({
        success: true,
        result: {
          id: result.id,
          score: result.score,
          totalMarks: result.totalMarks,
          percentage: result.percentage,
          submittedAt: result.submittedAt,
          message: 'Detailed answers will be available after the exam closes.',
          showDetails: false,
        },
      });
    }

    res.json({ success: true, result, showDetails: true });
  } catch (error) {
    console.error('Get student exam result error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch result.' });
  }
});

// ========================================
// TEACHER: Get Exam Results
// ========================================

router.get('/teacher', authenticate, requireRole('TEACHER'), async (req, res) => {
  try {
    const { examId, className, page = 1, limit = 20 } = req.query;

    // Get teacher's assignments
    const assignments = await prisma.teacherAssignment.findMany({
      where: { teacherId: req.user.userId },
      select: { id: true },
    });
    const assignmentIds = assignments.map(a => a.id);

    const where = {
      exam: { assignmentId: { in: assignmentIds } },
    };

    if (examId) where.examId = examId;
    if (className) where.student = { className };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [results, total] = await Promise.all([
      prisma.result.findMany({
        where,
        include: {
          exam: { select: { title: true, type: true, assignment: { select: { subject: true, className: true } } } },
          student: { select: { admissionNo: true, firstName: true, lastName: true, className: true } },
        },
        orderBy: { submittedAt: 'desc' },
        skip,
        take,
      }),
      prisma.result.count({ where }),
    ]);

    // Summary stats
    const allResults = await prisma.result.findMany({
      where,
      select: { score: true, totalMarks: true, percentage: true },
    });

    const avgScore = allResults.length > 0 ? allResults.reduce((s, r) => s + r.percentage, 0) / allResults.length : 0;
    const highest = allResults.length > 0 ? Math.max(...allResults.map(r => r.percentage)) : 0;
    const lowest = allResults.length > 0 ? Math.min(...allResults.map(r => r.percentage)) : 0;
    const passRate = allResults.length > 0 ? (allResults.filter(r => r.percentage >= 50).length / allResults.length) * 100 : 0;

    res.json({
      success: true,
      results,
      stats: {
        total: allResults.length,
        average: Math.round(avgScore * 10) / 10,
        highest,
        lowest,
        passRate: Math.round(passRate * 10) / 10,
      },
      pagination: {
        total,
        page: parseInt(page),
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    console.error('Get teacher results error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch results.' });
  }
});

// TEACHER: Detailed results for a specific exam
router.get('/teacher/:examId/details', authenticate, requireRole('TEACHER'), async (req, res) => {
  try {
    const { examId } = req.params;

    // Verify exam belongs to teacher
    const exam = await prisma.exam.findFirst({
      where: { id: examId, assignment: { teacherId: req.user.userId } },
    });

    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found or not yours.' });
    }

    const results = await prisma.result.findMany({
      where: { examId },
      include: {
        student: { select: { admissionNo: true, firstName: true, lastName: true, className: true } },
        answers: { include: { question: { select: { question: true, answer: true, marks: true } } } },
      },
      orderBy: { percentage: 'desc' },
    });

    // Question-level stats
    const questions = await prisma.examQuestion.findMany({
      where: { examId },
    });

    const questionStats = questions.map(q => {
      const relatedAnswers = results.flatMap(r => r.answers.filter(a => a.questionId === q.id));
      const correctCount = relatedAnswers.filter(a => a.correct === 1).length;
      return {
        questionId: q.id,
        question: q.question.substring(0, 80) + (q.question.length > 80 ? '...' : ''),
        totalAttempts: relatedAnswers.length,
        correctCount,
        correctRate: relatedAnswers.length > 0 ? Math.round((correctCount / relatedAnswers.length) * 100) : 0,
      };
    });

    res.json({
      success: true,
      exam: { id: exam.id, title: exam.title },
      results,
      questionStats,
      summary: {
        totalStudents: results.length,
        average: results.length > 0 ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / results.length * 10) / 10 : 0,
        passRate: results.length > 0 ? Math.round(results.filter(r => r.percentage >= 50).length / results.length * 100) : 0,
      },
    });
  } catch (error) {
    console.error('Get teacher exam details error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch exam details.' });
  }
});

// ========================================
// TEACHER: Export Results
// ========================================

router.get('/export/:examId', authenticate, requireRole('TEACHER'), async (req, res) => {
  try {
    const { examId } = req.params;
    const { format = 'csv' } = req.query;

    // Verify exam belongs to teacher
    const exam = await prisma.exam.findFirst({
      where: { id: examId, assignment: { teacherId: req.user.userId } },
      include: { assignment: { select: { subject: true, className: true } } },
    });

    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found or not yours.' });
    }

    const results = await prisma.result.findMany({
      where: { examId },
      include: {
        student: { select: { admissionNo: true, firstName: true, lastName: true, className: true } },
      },
      orderBy: { percentage: 'desc' },
    });

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'No results found for this exam.' });
    }

    const filename = `${exam.title.replace(/[^a-zA-Z0-9]/g, '_')}_results`;

    if (format === 'xlsx') {
      // Use ExcelJS for Excel export
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Results');

      worksheet.columns = [
        { header: 'Admission No', key: 'admissionNo', width: 20 },
        { header: 'First Name', key: 'firstName', width: 15 },
        { header: 'Last Name', key: 'lastName', width: 15 },
        { header: 'Class', key: 'className', width: 12 },
        { header: 'Score', key: 'score', width: 10 },
        { header: 'Total Marks', key: 'totalMarks', width: 12 },
        { header: 'Percentage', key: 'percentage', width: 12 },
        { header: 'Time Spent (min)', key: 'timeSpent', width: 15 },
        { header: 'Submitted At', key: 'submittedAt', width: 22 },
      ];

      results.forEach(r => {
        worksheet.addRow({
          admissionNo: r.student.admissionNo,
          firstName: r.student.firstName,
          lastName: r.student.lastName,
          className: r.student.className,
          score: r.score,
          totalMarks: r.totalMarks,
          percentage: `${r.percentage}%`,
          timeSpent: Math.round(r.timeSpent / 60),
          submittedAt: r.submittedAt.toISOString().replace('T', ' ').substring(0, 19),
        });
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);

      await workbook.xlsx.write(res);
      res.end();
    } else {
      // CSV export
      const headers = ['Admission No', 'First Name', 'Last Name', 'Class', 'Score', 'Total Marks', 'Percentage', 'Time Spent (min)', 'Submitted At'];
      const rows = results.map(r => [
        r.student.admissionNo,
        r.student.firstName,
        r.student.lastName,
        r.student.className,
        r.score,
        r.totalMarks,
        `${r.percentage}%`,
        Math.round(r.timeSpent / 60),
        r.submittedAt.toISOString().replace('T', ' ').substring(0, 19),
      ]);

      const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      res.send(csv);
    }
  } catch (error) {
    console.error('Export results error:', error);
    res.status(500).json({ success: false, message: 'Failed to export results.' });
  }
});

module.exports = router;
