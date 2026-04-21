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
    const { title, description, type, duration, totalMarks, passMark, startDate, endDate, resultVisibility, shuffleQuestions, shuffleOptions, assignmentId, subject, className } = req.body;

    if (!title || !type || !duration || !totalMarks || !passMark || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    // Determine assignmentId: either provided directly or auto-created from subject+className
    let finalAssignmentId = assignmentId;

    if (!finalAssignmentId) {
      if (!subject || !className) {
        return res.status(400).json({ success: false, message: 'Missing required fields: subject and className (or provide assignmentId).' });
      }

      const trimmedSubject = subject.trim();
      const trimmedClassName = className.trim();

      // Check if assignment already exists for this teacher+subject+class
      const existingAssignment = await prisma.teacherAssignment.findUnique({
        where: {
          teacherId_subject_className: {
            teacherId: req.user.userId,
            subject: trimmedSubject,
            className: trimmedClassName,
          },
        },
      });

      if (existingAssignment) {
        finalAssignmentId = existingAssignment.id;
      } else {
        // Auto-create the assignment
        const newAssignment = await prisma.teacherAssignment.create({
          data: {
            teacherId: req.user.userId,
            subject: trimmedSubject,
            className: trimmedClassName,
          },
        });
        finalAssignmentId = newAssignment.id;
      }
    } else {
      // Verify assignment belongs to this teacher
      const assignment = await prisma.teacherAssignment.findFirst({
        where: { id: assignmentId, teacherId: req.user.userId },
      });

      if (!assignment) {
        return res.status(403).json({ success: false, message: 'Assignment not found or does not belong to you.' });
      }
    }

    const exam = await prisma.exam.create({
      data: {
        title,
        description: description || null,
        type,
        duration,
        totalMarks,
        passMark,
        startDate: startDate,
        endDate: endDate,
        resultVisibility: resultVisibility || 'IMMEDIATE',
        shuffleQuestions: shuffleQuestions === false ? 0 : 1,
        shuffleOptions: shuffleOptions === false ? 0 : 1,
        assignmentId: finalAssignmentId,
      },
      include: { assignment: true },
    });

    res.status(201).json({ success: true, exam });
  } catch (error) {
    console.error('Create exam error:', error);
    res.status(500).json({ success: false, message: 'Failed to create exam.' });
  }
});

// Get Teacher's Assignments (for dropdown)
router.get('/teacher/assignments', authenticate, requireRole('TEACHER'), async (req, res) => {
  try {
    const assignments = await prisma.teacherAssignment.findMany({
      where: { teacherId: req.user.userId },
      include: {
        teacher: { select: { firstName: true, lastName: true, status: true } },
        _count: { select: { exams: true } },
      },
      orderBy: [{ academicYear: 'desc' }, { className: 'asc' }, { subject: 'asc' }],
    });
    res.json({
      success: true,
      assignments: assignments.map(a => ({
        id: a.id,
        teacherId: a.teacherId,
        teacherName: `${a.teacher.firstName} ${a.teacher.lastName}`,
        subject: a.subject,
        className: a.className,
        academicYear: a.academicYear,
        examCount: a._count.exams,
      })),
    });
  } catch (error) {
    console.error('Get teacher assignments error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch assignments.' });
  }
});

// Get Teacher's Exams
router.get('/teacher', authenticate, requireRole('TEACHER'), async (req, res) => {
  try {
    const { status } = req.query;
    const where = {
      assignment: { teacherId: req.user.userId },
    };
    if (status) {
      where.status = status;
    }

    const exams = await prisma.exam.findMany({
      where,
      include: {
        assignment: { select: { subject: true, className: true } },
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
      where: { id, assignment: { teacherId: req.user.userId } },
    });

    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found.' });
    }

    if (exam.status !== 'DRAFT') {
      return res.status(400).json({ success: false, message: 'Can only update exams in DRAFT status.' });
    }

    const { title, description, type, duration, totalMarks, passMark, startDate, endDate, resultVisibility, shuffleQuestions, shuffleOptions } = req.body;

    const updated = await prisma.exam.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(type && { type }),
        ...(duration && { duration }),
        ...(totalMarks && { totalMarks }),
        ...(passMark && { passMark }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(resultVisibility && { resultVisibility }),
        ...(shuffleQuestions !== undefined && { shuffleQuestions: shuffleQuestions ? 1 : 0 }),
        ...(shuffleOptions !== undefined && { shuffleOptions: shuffleOptions ? 1 : 0 }),
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
      where: { id, assignment: { teacherId: req.user.userId } },
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

    const exam = await prisma.exam.findUnique({ where: { id } });

    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found.' });
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
        assignment: { className: student.className },
      },
      include: {
        assignment: { select: { subject: true, className: true } },
        _count: { select: { questions: true, results: true } },
        results: {
          where: { studentId: student.id },
          select: { id: true },
        },
      },
      orderBy: { startDate: 'desc' },
    });

    const examList = exams.map(exam => {
      const hasTaken = exam.results.length > 0;
      const isOpen = new Date(exam.startDate) <= now && new Date(exam.endDate) >= now;
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
      include: { assignment: { select: { subject: true, className: true } } },
    });

    if (!exam) {
      return res.status(404).json({ success: false, message: 'Exam not found.' });
    }

    if (exam.status !== 'PUBLISHED') {
      return res.status(400).json({ success: false, message: 'This exam is not available.' });
    }

    if (new Date(exam.startDate) > now || new Date(exam.endDate) < now) {
      return res.status(400).json({ success: false, message: 'This exam is not currently open.' });
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

    // Shuffle question order if enabled
    if (exam.shuffleQuestions) {
      questions = shuffleArray(questions);
    }

    // Format questions with options array and proper shuffle with remapping
    const formattedQuestions = questions.map(q => {
      const options = [
        { originalKey: 'A', text: q.optionA },
        { originalKey: 'B', text: q.optionB },
        { originalKey: 'C', text: q.optionC },
        { originalKey: 'D', text: q.optionD },
      ];

      // Shuffle options if enabled
      let shuffled = options;
      if (exam.shuffleOptions) {
        shuffled = [...options].sort(function () { return Math.random() - 0.5; });
      }

      // Re-label as A, B, C, D in shuffled order
      // Build keyMap: newKey -> originalKey (for answer checking)
      const keyMap = {};
      const relabeled = shuffled.map(function (opt, idx) {
        const newKey = String.fromCharCode(65 + idx); // A, B, C, D
        keyMap[newKey] = opt.originalKey;
        return { key: newKey, text: opt.text };
      });

      return {
        id: q.id,
        question: q.question,
        options: relabeled,
        marks: q.marks,
        keyMap: keyMap,
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
        subject: exam.assignment.subject,
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
        assignment: {
          select: {
            subject: true,
            className: true,
            teacher: { select: { firstName: true, lastName: true } },
          },
        },
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
