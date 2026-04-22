const express = require('express');
const prisma = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requireRole, requireTeacherActive } = require('../middleware/roleMiddleware');
const { shuffleArray } = require('../utils/helpers');

const router = express.Router();

// ========================================
// TEACHER ROUTES
// ========================================

// Create Exam
router.post('/', authenticate, requireRole('TEACHER'), requireTeacherActive, async (req, res) => {
  try {
    const { title, description, type, duration, totalMarks, passMark, startDate, endDate, resultVisibility, shuffleQuestions, shuffleOptions, subject, className } = req.body;

    if (!title || !type || !duration || !totalMarks || !passMark || !subject || !className) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    const exam = await prisma.exam.create({
      data: {
        title,
        description: description || null,
        type,
        duration: parseInt(duration, 10) || 30,
        totalMarks: parseInt(totalMarks, 10) || 50,
        passMark: parseInt(passMark, 10) || 25,
        startDate: String(startDate || ''),
        endDate: String(endDate || ''),
        resultVisibility: resultVisibility || 'MANUAL',
        shuffleQuestions: shuffleQuestions === true ? 1 : 0,
        shuffleOptions: shuffleOptions === true ? 1 : 0,
        className: className.trim(),
        subject: subject.trim(),
        teacherId: req.user.userId,
      },
      include: {
        teacher: { select: { firstName: true, lastName: true } },
      },
    });

    res.status(201).json({ success: true, exam });
  } catch (error) {
    console.error('Create exam error:', error);
    const msg = error.code?.startsWith('P')
      ? 'Database error: ' + (error.meta?.target || error.message)
      : error.message || 'Failed to create exam.';
    res.status(500).json({ success: false, message: msg });
  }
});

// Get Teacher's Exams
router.get('/teacher', authenticate, requireRole('TEACHER'), async (req, res) => {
  try {
    const { status } = req.query;
    const where = {
      teacherId: req.user.userId,
    };
    if (status) {
      where.status = status;
    }

    const exams = await prisma.exam.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        status: true,
        duration: true,
        totalMarks: true,
        passMark: true,
        startDate: true,
        endDate: true,
        resultVisibility: true,
        shuffleQuestions: true,
        shuffleOptions: true,
        className: true,
        subject: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { questions: true, results: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, exams });
  } catch (error) {
    console.error('Get teacher exams error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch exams.' });
  }
});

// Update Exam (only DRAFT)
router.put('/:id', authenticate, requireRole('TEACHER'), async (req, res) => {
  try {
    const { id } = req.params;

    const exam = await prisma.exam.findFirst({
      where: { id, teacherId: req.user.userId },
    });

    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found.' });
    }

    if (exam.status !== 'DRAFT') {
      return res.status(400).json({ success: false, message: 'Can only update exams in DRAFT status.' });
    }

    const { title, description, type, duration, totalMarks, passMark, startDate, endDate, resultVisibility, shuffleQuestions, shuffleOptions, subject, className } = req.body;

    const updated = await prisma.exam.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(type && { type }),
        ...(duration && { duration: parseInt(duration, 10) }),
        ...(totalMarks && { totalMarks: parseInt(totalMarks, 10) }),
        ...(passMark && { passMark: parseInt(passMark, 10) }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(resultVisibility && { resultVisibility }),
        ...(shuffleQuestions !== undefined && { shuffleQuestions: shuffleQuestions ? 1 : 0 }),
        ...(shuffleOptions !== undefined && { shuffleOptions: shuffleOptions ? 1 : 0 }),
        ...(subject && { subject: subject.trim() }),
        ...(className && { className: className.trim() }),
      },
    });

    res.json({ success: true, exam: updated });
  } catch (error) {
    console.error('Update exam error:', error);
    res.status(500).json({ success: false, message: 'Failed to update exam.' });
  }
});

// Publish Exam
router.patch('/:id/publish', authenticate, requireRole('TEACHER'), async (req, res) => {
  try {
    const { id } = req.params;

    const exam = await prisma.exam.findFirst({
      where: { id, teacherId: req.user.userId },
      include: { _count: { select: { questions: true } } },
    });

    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found.' });
    }

    if (exam.status !== 'DRAFT') {
      return res.status(400).json({ success: false, message: 'Only DRAFT exams can be published.' });
    }

    if (exam._count.questions === 0) {
      return res.status(400).json({ success: false, message: 'Cannot publish exam without questions.' });
    }

    const published = await prisma.exam.update({
      where: { id },
      data: { status: 'PUBLISHED' },
    });

    res.json({ success: true, exam: published, message: 'Exam published successfully.' });
  } catch (error) {
    console.error('Publish exam error:', error);
    res.status(500).json({ success: false, message: 'Failed to publish exam.' });
  }
});

// Archive Exam
router.patch('/:id/archive', authenticate, requireRole('TEACHER', 'ADMIN'), async (req, res) => {
  try {
    const { id } = req.params;

    const where = { id };
    // Teachers can only archive their own exams; admins can archive any
    if (req.user.role === 'TEACHER') {
      where.teacherId = req.user.userId;
    }

    const exam = await prisma.exam.findFirst({ where });

    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found or not yours.' });
    }

    const archived = await prisma.exam.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });

    res.json({ success: true, exam: archived, message: 'Exam archived successfully.' });
  } catch (error) {
    console.error('Archive exam error:', error);
    res.status(500).json({ success: false, message: 'Failed to archive exam.' });
  }
});

// ========================================
// STUDENT ROUTES
// ========================================

// Available Exams for Student
router.get('/available', authenticate, requireRole('STUDENT'), async (req, res) => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: req.user.userId },
    });

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student profile not found.' });
    }

    const now = new Date();

    const exams = await prisma.exam.findMany({
      where: {
        status: 'PUBLISHED',
        className: student.className,
      },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        duration: true,
        totalMarks: true,
        passMark: true,
        startDate: true,
        endDate: true,
        resultVisibility: true,
        className: true,
        subject: true,
        createdAt: true,
        _count: { select: { questions: true, results: true } },
        results: {
          where: { studentId: student.id },
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const examList = exams.map(exam => {
      const hasTaken = exam.results.length > 0;
      // All published exams are open — dates are informational only
      const isOpen = true;
      const { results, ...examData } = exam;
      return { ...examData, hasTaken, isOpen };
    });

    res.json({ success: true, exams: examList });
  } catch (error) {
    console.error('Get available exams error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch available exams.' });
  }
});

// Get Exam Questions (for taking exam)
router.get('/:id/questions', authenticate, requireRole('STUDENT'), async (req, res) => {
  try {
    const { id } = req.params;
    const now = new Date();

    const exam = await prisma.exam.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        duration: true,
        totalMarks: true,
        subject: true,
        className: true,
        status: true,
        startDate: true,
        endDate: true,
        shuffleQuestions: true,
        shuffleOptions: true,
      },
    });

    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found.' });
    }

    if (exam.status !== 'PUBLISHED') {
      return res.status(400).json({ success: false, message: 'This exam is not available.' });
    }

    // Verify the student belongs to the exam's class
    const student = await prisma.student.findUnique({
      where: { id: req.user.userId },
      select: { className: true },
    });

    if (!student || student.className !== exam.className) {
      return res.status(403).json({ success: false, message: 'This exam is not available for your class.' });
    }

    // Check student hasn't already taken it
    const existingResult = await prisma.result.findUnique({
      where: { examId_studentId: { examId: id, studentId: req.user.userId } },
    });

    if (existingResult) {
      return res.status(400).json({ success: false, message: 'You have already taken this exam.' });
    }

    // Get questions (without answer)
    let questions = await prisma.examQuestion.findMany({
      where: { examId: id },
      select: {
        id: true,
        question: true,
        optionA: true,
        optionB: true,
        optionC: true,
        optionD: true,
        marks: true,
      },
    });

    // Guard: exam must have at least one question
    if (questions.length === 0) {
      return res.status(400).json({ success: false, message: 'This exam has no questions yet and cannot be taken.' });
    }

    // Shuffle question order if enabled
    if (exam.shuffleQuestions) {
      questions = shuffleArray(questions);
    }

    // Format questions with options array (no option shuffling to ensure reliable grading)
    const formattedQuestions = questions.map(q => {
      return {
        id: q.id,
        question: q.question,
        options: [
          { key: 'A', text: q.optionA },
          { key: 'B', text: q.optionB },
          { key: 'C', text: q.optionC },
          { key: 'D', text: q.optionD },
        ],
        marks: q.marks,
      };
    });

    res.json({
      success: true,
      exam: {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        type: exam.type,
        duration: exam.duration,
        totalMarks: exam.totalMarks,
        subject: exam.subject,
      },
      questions: formattedQuestions,
      examStartTime: now.toISOString(),
    });
  } catch (error) {
    console.error('Get exam questions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch exam questions.' });
  }
});

// Get Exam Details
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const exam = await prisma.exam.findUnique({
      where: { id },
      include: {
        teacher: { select: { firstName: true, lastName: true } },
        _count: { select: { questions: true, results: true } },
      },
    });

    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found.' });
    }

    res.json({ success: true, exam });
  } catch (error) {
    console.error('Get exam details error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch exam details.' });
  }
});

module.exports = router;
