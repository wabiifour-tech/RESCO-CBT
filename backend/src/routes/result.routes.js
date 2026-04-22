const express = require('express');
const prisma = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requireRole, requireTeacherActive } = require('../middleware/roleMiddleware');
const PDFDocument = require('pdfkit');

const router = express.Router();

// ========================================
// STUDENT: Submit Exam
// ========================================

router.post('/submit', authenticate, requireRole('STUDENT'), async (req, res) => {
  try {
    const { examId, answers, timeSpent, examStartTime } = req.body;

    if (!examId || !answers || !Array.isArray(answers)) {
      return res.status(400).json({ success: false, message: 'Missing required fields: examId, answers.' });
    }

    const studentId = req.user.userId;
    const now = new Date();

    // Verify exam is published and accessible
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, title: true, status: true, subject: true, className: true, resultVisibility: true, endDate: true, passMark: true },
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

    // Guard: exam must have at least one question
    if (questions.length === 0) {
      return res.status(400).json({ success: false, message: 'This exam has no questions.' });
    }

    // Build question map and validate submitted question IDs
    const questionMap = {};
    questions.forEach(q => { questionMap[q.id] = q; });

    // Filter answers to only include valid question IDs for this exam
    const validAnswers = answers.filter(a => a.questionId && questionMap[a.questionId]);
    if (validAnswers.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid answers provided.' });
    }

    // Grade answers
    let score = 0;
    const resultAnswers = validAnswers.map(a => {
      const question = questionMap[a.questionId];
      // Defensive: ensure we only compare single letters (A/B/C/D)
      const selectedUpper = a.selected ? String(a.selected).toUpperCase().trim().charAt(0) : null;
      const correctAnswer = question ? String(question.answer).toUpperCase().trim().charAt(0) : null;
      const isCorrect = question && selectedUpper && correctAnswer ? (selectedUpper === correctAnswer) : false;

      if (isCorrect) score += question.marks;
      return {
        questionId: a.questionId,
        selected: selectedUpper,
        correct: isCorrect ? 1 : 0,
      };
    });

    const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
    const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;
    const passed = percentage >= exam.passMark;

    const startTime = examStartTime ? new Date(examStartTime) : now;

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
          examStartTime: startTime,
          examEndTime: now,
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
    const showScores = exam.resultVisibility === 'IMMEDIATE';
    const responseData = {
      success: true,
      result: {
        id: result.id,
        ...(showScores ? {
          score,
          totalMarks,
          percentage: Math.round(percentage * 100) / 100,
          passed,
          timeSpent: timeSpent || 0,
        } : {}),
        examStartTime: startTime,
        examEndTime: now,
        submittedAt: result.submittedAt,
        showScores,
      },
    };

    // If IMMEDIATE visibility, include answer details
    if (showScores) {
      responseData.result.answers = resultAnswers.map((a, i) => {
        const question = questionMap[a.questionId];
        return {
          questionId: a.questionId,
          question: question ? question.question : '',
          selected: a.selected,
          correct: a.correct === 1,
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
            subject: true,
            className: true,
            resultVisibility: true,
            passMark: true,
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    // Hide scores for non-IMMEDIATE visibility exams
    const sanitized = results.map(r => {
      const showScores = r.exam.resultVisibility === 'IMMEDIATE';
      return {
        id: r.id,
        examId: r.examId,
        submittedAt: r.submittedAt,
        examStartTime: r.examStartTime,
        examEndTime: r.examEndTime,
        exam: r.exam,
        showScores,
        ...(showScores ? {
          score: r.score,
          totalMarks: r.totalMarks,
          percentage: r.percentage,
          timeSpent: r.timeSpent,
        } : {}),
      };
    });

    res.json({ success: true, results: sanitized });
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
        exam: { select: { id: true, title: true, subject: true, resultVisibility: true, endDate: true, passMark: true } },
        answers: { include: { question: { select: { question: true, optionA: true, optionB: true, optionC: true, optionD: true, answer: true } } } },
      },
    });

    if (!result) {
      return res.status(404).json({ success: false, message: 'Result not found.' });
    }

    // MANUAL mode: hide all scores and answers from students
    if (result.exam.resultVisibility === 'MANUAL') {
      return res.status(200).json({
        success: true,
        result: {
          id: result.id,
          submittedAt: result.submittedAt,
          examStartTime: result.examStartTime,
          examEndTime: result.examEndTime,
          showScores: false,
          showDetails: false,
        },
      });
    }

    // AFTER_CLOSE mode: hide details if exam hasn't closed yet
    if (result.exam.resultVisibility === 'AFTER_CLOSE') {
      const endDate = result.exam.endDate;
      const hasEnd = endDate && !isNaN(new Date(endDate).getTime());
      const passMark = result.exam.passMark || 50;
      if (hasEnd && new Date(endDate) > new Date()) {
        return res.status(200).json({
          success: true,
          result: {
            id: result.id,
            score: result.score,
            totalMarks: result.totalMarks,
            percentage: result.percentage,
            passed: result.percentage >= passMark,
            submittedAt: result.submittedAt,
            examStartTime: result.examStartTime,
            examEndTime: result.examEndTime,
            message: 'Detailed answers will be available after the exam closes.',
            showScores: true,
            showDetails: false,
          },
        });
      }
    }

    res.json({ success: true, result, showScores: true, showDetails: true });
  } catch (error) {
    console.error('Get student exam result error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch result.' });
  }
});

// ========================================
// TEACHER: Get Exam Results (with exam times)
// ========================================

router.get('/teacher', authenticate, requireRole('TEACHER'), async (req, res) => {
  try {
    const { examId, className, page = 1, limit = 20 } = req.query;

    const where = {
      exam: { teacherId: req.user.userId },
    };

    if (examId) where.examId = examId;
    if (className) where.student = { className };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [results, total] = await Promise.all([
      prisma.result.findMany({
        where,
        include: {
          exam: { select: { title: true, type: true, subject: true, className: true, passMark: true } },
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
      select: { score: true, totalMarks: true, percentage: true, exam: { select: { passMark: true } } },
    });

    const avgScore = allResults.length > 0 ? allResults.reduce((s, r) => s + r.percentage, 0) / allResults.length : 0;
    const highest = allResults.length > 0 ? Math.max(...allResults.map(r => r.percentage)) : 0;
    const lowest = allResults.length > 0 ? Math.min(...allResults.map(r => r.percentage)) : 0;
    const passRate = allResults.length > 0 ? (allResults.filter(r => r.percentage >= (r.exam?.passMark || 50)).length / allResults.length) * 100 : 0;

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

    const exam = await prisma.exam.findFirst({
      where: { id: examId, teacherId: req.user.userId },
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
        passRate: results.length > 0 ? Math.round(results.filter(r => r.percentage >= (exam?.passMark || 50)).length / results.length * 100) : 0,
      },
    });
  } catch (error) {
    console.error('Get teacher exam details error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch exam details.' });
  }
});

// ========================================
// TEACHER: Export Results as Watermarked PDF
// ========================================

router.get('/export/:examId', authenticate, requireRole('TEACHER'), async (req, res) => {
  try {
    const { examId } = req.params;
    const { format } = req.query;

    // Verify exam belongs to teacher
    const exam = await prisma.exam.findFirst({
      where: { id: examId, teacherId: req.user.userId },
      include: {
        teacher: { select: { firstName: true, lastName: true } },
      },
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

    // CSV format
    if (format === 'csv') {
      const filename = `${exam.title.replace(/[^a-zA-Z0-9]/g, '_')}_results`;
      const headers = ['Admission No', 'First Name', 'Last Name', 'Class', 'Score', 'Total Marks', 'Percentage', 'Time Spent (min)', 'Exam Start Time', 'Exam End Time', 'Submitted At'];
      const rows = results.map(r => [
        r.student.admissionNo,
        r.student.firstName,
        r.student.lastName,
        r.student.className,
        r.score,
        r.totalMarks,
        `${r.percentage}%`,
        Math.round(r.timeSpent / 60),
        r.examStartTime ? r.examStartTime.toISOString().replace('T', ' ').substring(0, 19) : '',
        r.examEndTime ? r.examEndTime.toISOString().replace('T', ' ').substring(0, 19) : '',
        r.submittedAt ? r.submittedAt.toISOString().replace('T', ' ').substring(0, 19) : '',
      ]);

      const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      return res.send(csv);
    }

    // PDF format with watermark
    const teacherName = exam.teacher
      ? `${exam.teacher.firstName} ${exam.teacher.lastName}`
      : 'Teacher';
    const subject = exam.subject;
    const className = exam.className;

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: `${exam.title} - Results`,
        Author: 'RESCO CBT System',
        Subject: `${subject} - ${className}`,
      },
    });

    const filename = `${exam.title.replace(/[^a-zA-Z0-9]/g, '_')}_results.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    const pageWidth = doc.page.width - 100; // margins

    // Helper to draw watermark on each page
    const drawWatermark = () => {
      doc.save();
      doc.fontSize(60).fillColor('#e0e0e0', 0.3);
      doc.rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc.text('RESCO CBT', doc.page.width / 2 - 150, doc.page.height / 2 - 30, {
        width: 300,
        align: 'center',
      });
      doc.restore();
    };

    // For each result, generate a PDF page
    for (const result of results) {
      doc.addPage();
      drawWatermark();

      const studentName = `${result.student.firstName} ${result.student.lastName}`;
      const examDate = result.submittedAt.toLocaleDateString('en-NG', {
        year: 'numeric', month: 'long', day: 'numeric',
      });
      const startTimeStr = result.examStartTime
        ? result.examStartTime.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
        : 'N/A';
      const endTimeStr = result.examEndTime
        ? result.examEndTime.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
        : 'N/A';

      // Header with gradient-like colored bar
      doc.rect(0, 0, doc.page.width, 8)
         .fill('#6366f1');
      doc.rect(0, 8, doc.page.width, 3)
         .fill('#8b5cf6');

      // School name
      doc.fontSize(16).fillColor('#1e1b4b').font('Helvetica-Bold')
         .text("REDEEMER'S SCHOOLS AND COLLEGE, OWOTORO", 50, 30, { align: 'center' });
      doc.fontSize(10).fillColor('#4c1d95').font('Helvetica')
         .text('Computer-Based Test Result', 50, 50, { align: 'center' });

      // Decorative line
      doc.moveTo(50, 68).lineTo(doc.page.width - 50, 68)
         .strokeColor('#8b5cf6').lineWidth(1.5).stroke();

      // Result title
      doc.fontSize(14).fillColor('#1e1b4b').font('Helvetica-Bold')
         .text(exam.title, 50, 80, { align: 'center' });

      // Student info table
      const tableTop = 110;
      const col1 = 50;
      const col2 = 250;
      const rowH = 20;

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#4c1d95');
      const fields = [
        ['Student Name:', studentName],
        ['Admission No:', result.student.admissionNo],
        ['Class:', result.student.className],
        ['Subject:', subject],
        ['Date:', examDate],
        ['Start Time:', startTimeStr],
        ['End Time:', endTimeStr],
      ];

      fields.forEach((row, i) => {
        const y = tableTop + i * rowH;
        doc.font('Helvetica-Bold').fillColor('#374151').text(row[0], col1, y);
        doc.font('Helvetica').fillColor('#1f2937').text(row[1], col2, y);
      });

      // Score box
      const scoreTop = tableTop + fields.length * rowH + 15;
      const scoreBoxWidth = pageWidth;

      // Background for score
      doc.roundedRect(col1, scoreTop, scoreBoxWidth, 80, 8)
         .fill('#f5f3ff');

      // Score display
      const pct = Math.round(result.percentage);
      const gradeColor = pct >= 50 ? '#059669' : '#dc2626';
      const grade = pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : pct >= 50 ? 'E' : 'F';

      doc.fontSize(11).fillColor('#4c1d95').font('Helvetica-Bold')
         .text('Score:', col1 + 20, scoreTop + 10);
      doc.fontSize(28).fillColor(gradeColor).font('Helvetica-Bold')
         .text(`${result.score}/${result.totalMarks}`, col1 + 80, scoreTop + 5);
      doc.fontSize(12).fillColor('#6b7280').font('Helvetica')
         .text(`(${result.percentage}%)`, col1 + 80, scoreTop + 38);

      doc.fontSize(11).fillColor('#4c1d95').font('Helvetica-Bold')
         .text('Grade:', col1 + 230, scoreTop + 10);
      doc.fontSize(28).fillColor(gradeColor).font('Helvetica-Bold')
         .text(grade, col1 + 290, scoreTop + 5);

      doc.fontSize(11).fillColor('#4c1d95').font('Helvetica-Bold')
         .text('Status:', col1 + 370, scoreTop + 10);
      const statusText = pct >= 50 ? 'PASSED' : 'FAILED';
      const statusColor = pct >= 50 ? '#059669' : '#dc2626';
      doc.fontSize(16).fillColor(statusColor).font('Helvetica-Bold')
         .text(statusText, col1 + 430, scoreTop + 12);

      // Time spent
      const timeMins = Math.round(result.timeSpent / 60);
      doc.fontSize(10).fillColor('#6b7280').font('Helvetica')
         .text(`Time Spent: ${timeMins} minutes`, col1 + 20, scoreTop + 58);

      // Signature section
      const sigTop = scoreTop + 110;

      // Principal signature line
      doc.moveTo(col1, sigTop + 40).lineTo(col1 + 200, sigTop + 40)
         .strokeColor('#374151').lineWidth(0.5).stroke();
      doc.fontSize(10).fillColor('#374151').font('Helvetica')
         .text('Principal', col1, sigTop + 48, { align: 'center', width: 200 });
      doc.fontSize(10).fillColor('#6366f1').font('Helvetica-BoldOblique')
         .text('Aderonke Rachael', col1, sigTop + 62, { align: 'center', width: 200 });

      // Teacher signature line
      doc.moveTo(col2 + 50, sigTop + 40).lineTo(col2 + 250, sigTop + 40)
         .strokeColor('#374151').lineWidth(0.5).stroke();
      doc.fontSize(10).fillColor('#374151').font('Helvetica')
         .text('Teacher', col2 + 50, sigTop + 48, { align: 'center', width: 200 });
      doc.fontSize(10).fillColor('#6366f1').font('Helvetica-BoldOblique')
         .text(teacherName, col2 + 50, sigTop + 62, { align: 'center', width: 200 });

      // Footer
      doc.fontSize(7).fillColor('#9ca3af').font('Helvetica')
         .text(`Generated by RESCO CBT System on ${new Date().toLocaleString()}`, 50, doc.page.height - 40, {
           align: 'center', width: pageWidth,
         });
    }

    doc.end();
  } catch (error) {
    console.error('Export results error:', error);
    res.status(500).json({ success: false, message: 'Failed to export results.' });
  }
});

module.exports = router;
