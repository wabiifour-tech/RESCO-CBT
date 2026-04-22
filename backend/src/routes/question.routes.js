const express = require('express');
const router = express.Router();
const multer = require('multer');
const prisma = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleMiddleware');

// ============================================================
// Multer configuration for CSV uploads (memory storage)
// ============================================================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/csv',
    ];
    const allowedExtensions = ['.csv'];

    const originalName = file.originalname || '';
    const ext = originalName.toLowerCase().slice(originalName.lastIndexOf('.'));
    if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed.'));
    }
  },
});

// ============================================================
// Helper: Verify exam belongs to the authenticated teacher
// ============================================================
async function verifyTeacherOwnsExam(teacherId, examId) {
  const exam = await prisma.exam.findFirst({
    where: {
      id: examId,
      teacherId,
    },
  });
  return exam;
}

// ============================================================
// Helper: Validate a single question object
// ============================================================
function validateQuestion(q, index) {
  const errors = [];

  if (!q.question || typeof q.question !== 'string' || q.question.trim().length === 0) {
    errors.push(`Row ${index}: "question" is required and must be a non-empty string.`);
  }

  if (!q.optionA || typeof q.optionA !== 'string' || q.optionA.trim().length === 0) {
    errors.push(`Row ${index}: "optionA" is required and must be a non-empty string.`);
  }

  if (!q.optionB || typeof q.optionB !== 'string' || q.optionB.trim().length === 0) {
    errors.push(`Row ${index}: "optionB" is required and must be a non-empty string.`);
  }

  if (!q.optionC || typeof q.optionC !== 'string' || q.optionC.trim().length === 0) {
    errors.push(`Row ${index}: "optionC" is required and must be a non-empty string.`);
  }

  if (!q.optionD || typeof q.optionD !== 'string' || q.optionD.trim().length === 0) {
    errors.push(`Row ${index}: "optionD" is required and must be a non-empty string.`);
  }

  const validAnswers = ['A', 'B', 'C', 'D'];
  if (!q.answer || !validAnswers.includes(q.answer.toUpperCase())) {
    errors.push(`Row ${index}: "answer" is required and must be one of A, B, C, D.`);
  }

  const marks = parseInt(q.marks, 10);
  if (isNaN(marks) || marks <= 0 || !Number.isInteger(marks)) {
    errors.push(`Row ${index}: "marks" is required and must be a positive integer.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    data: {
      question: q.question.trim(),
      optionA: q.optionA.trim(),
      optionB: q.optionB.trim(),
      optionC: q.optionC.trim(),
      optionD: q.optionD.trim(),
      answer: q.answer.toUpperCase(),
      marks,
    },
  };
}

// ============================================================
// Helper: Parse CSV buffer into array of objects
// ============================================================
function parseCSV(buffer) {
  const content = buffer.toString('utf-8').trim();
  const lines = content.split(/\r?\n/);

  if (lines.length < 2) {
    return { error: 'CSV file must contain a header row and at least one data row.' };
  }

  // Parse header row
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());

  const expectedHeaders = ['question', 'optiona', 'optionb', 'optionc', 'optiond', 'answer', 'marks'];
  const missingHeaders = expectedHeaders.filter((h) => !headers.includes(h));

  if (missingHeaders.length > 0) {
    return { error: `Missing required CSV headers: ${missingHeaders.join(', ')}. Required headers: ${expectedHeaders.join(', ')}` };
  }

  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // skip empty lines

    // Simple CSV split - handles basic cases. For quoted fields with commas,
    // a more robust parser would be needed, but this suffices for CBT data.
    const values = line.split(',').map((v) => v.trim());

    if (values.length < 7) {
      rows.push({ _rawIndex: i + 1, _parseError: `Row ${i + 1}: Expected 7 columns but found ${values.length}.` });
      continue;
    }

    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = values[idx] || '';
    });

    obj._rawIndex = i + 1;
    rows.push(obj);
  }

  return { rows };
}

// ============================================================
// POST /manual - Add Questions Manually
// ============================================================
router.post('/manual', authenticate, requireRole('TEACHER'), async (req, res) => {
  try {
    const { examId, questions } = req.body;

    // --- Validate request body ---
    if (!examId) {
      return res.status(400).json({
        success: false,
        message: 'examId is required.',
      });
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'questions must be a non-empty array.',
      });
    }

    if (questions.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Cannot add more than 500 questions at once.',
      });
    }

    // --- Verify exam belongs to this teacher ---
    const exam = await verifyTeacherOwnsExam(req.user.userId, examId);

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found or you do not have access to it.',
      });
    }

    if (exam.status !== 'DRAFT') {
      return res.status(400).json({
        success: false,
        message: `Cannot add questions to an exam with status "${exam.status}". Only DRAFT exams can be modified.`,
      });
    }

    // --- Validate all questions ---
    const validationErrors = [];
    const validQuestions = [];

    for (let i = 0; i < questions.length; i++) {
      const result = validateQuestion(questions[i], i + 1);
      if (result.valid) {
        validQuestions.push({
          examId,
          ...result.data,
        });
      } else {
        validationErrors.push(...result.errors);
      }
    }

    if (validQuestions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid questions provided.',
        errors: validationErrors,
      });
    }

    // --- Create questions in a transaction ---
    const created = await prisma.$transaction(
      validQuestions.map((q) =>
        prisma.examQuestion.create({
          data: q,
        })
      )
    );

    return res.status(201).json({
      success: true,
      message: `${created.length} question(s) created successfully.`,
      data: {
        count: created.length,
        examId,
      },
      ...(validationErrors.length > 0 && {
        warnings: {
          message: `${validationErrors.length} question(s) were skipped due to validation errors.`,
          errors: validationErrors,
        },
      }),
    });
  } catch (error) {
    console.error('Error in POST /questions/manual:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while adding questions.',
    });
  }
});

// ============================================================
// POST /upload - Upload Questions via CSV
// ============================================================
router.post('/upload', authenticate, requireRole('TEACHER'), upload.single('file'), async (req, res) => {
  try {
    const { examId } = req.body;

    // --- Validate request ---
    if (!examId) {
      return res.status(400).json({
        success: false,
        message: 'examId is required in form data.',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Please upload a CSV file.',
      });
    }

    // --- Verify exam belongs to this teacher ---
    const exam = await verifyTeacherOwnsExam(req.user.userId, examId);

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found or you do not have access to it.',
      });
    }

    if (exam.status !== 'DRAFT') {
      return res.status(400).json({
        success: false,
        message: `Cannot add questions to an exam with status "${exam.status}". Only DRAFT exams can be modified.`,
      });
    }

    // --- Parse CSV ---
    const parsed = parseCSV(req.file.buffer);

    if (parsed.error) {
      return res.status(400).json({
        success: false,
        message: parsed.error,
      });
    }

    const { rows } = parsed;

    if (!rows || rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'CSV file contains no data rows.',
      });
    }

    // --- Validate rows ---
    const errors = [];
    const validQuestions = [];

    for (const row of rows) {
      if (row._parseError) {
        errors.push(row._parseError);
        continue;
      }

      const result = validateQuestion(row, row._rawIndex);
      if (result.valid) {
        validQuestions.push({
          examId,
          ...result.data,
        });
      } else {
        errors.push(...result.errors);
      }
    }

    // --- Create valid questions in a transaction ---
    let created = [];
    if (validQuestions.length > 0) {
      created = await prisma.$transaction(
        validQuestions.map((q) =>
          prisma.examQuestion.create({
            data: q,
          })
        )
      );
    }

    return res.status(201).json({
      success: true,
      data: {
        total: rows.length,
        created: created.length,
        errors,
      },
    });
  } catch (error) {
    console.error('Error in POST /questions/upload:', error);

    if (error.message === 'Only CSV files are allowed.') {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'An error occurred while uploading questions.',
    });
  }
});

// ============================================================
// GET /:examId - Get Questions for Exam (Teacher View)
// ============================================================
router.get('/:examId', authenticate, requireRole('TEACHER'), async (req, res) => {
  try {
    const { examId } = req.params;

    // --- Verify exam belongs to this teacher ---
    const exam = await verifyTeacherOwnsExam(req.user.userId, examId);

    if (!exam) {
      return res.status(404).json({
        success: false,
        message: 'Exam not found or you do not have access to it.',
      });
    }

    // --- Fetch all questions for this exam ---
    const questions = await prisma.examQuestion.findMany({
      where: { examId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        question: true,
        optionA: true,
        optionB: true,
        optionC: true,
        optionD: true,
        answer: true,
        marks: true,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        exam: {
          id: exam.id,
          title: exam.title,
          status: exam.status,
          totalMarks: exam.totalMarks,
          questionCount: questions.length,
        },
        questions,
      },
    });
  } catch (error) {
    console.error('Error in GET /questions/:examId:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching questions.',
    });
  }
});

// ============================================================
// PUT /:id - Update a Question
// ============================================================
router.put('/:id', authenticate, requireRole('TEACHER'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // --- Validate at least one updatable field is provided ---
    const allowedFields = ['question', 'optionA', 'optionB', 'optionC', 'optionD', 'answer', 'marks'];
    const updateData = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: `No valid fields to update. Allowed fields: ${allowedFields.join(', ')}`,
      });
    }

    // --- Validate answer if provided ---
    if (updateData.answer !== undefined) {
      const validAnswers = ['A', 'B', 'C', 'D'];
      if (typeof updateData.answer !== 'string' || !validAnswers.includes(updateData.answer.toUpperCase())) {
        return res.status(400).json({
          success: false,
          message: 'answer must be one of A, B, C, D.',
        });
      }
      updateData.answer = updateData.answer.toUpperCase();
    }

    // --- Validate marks if provided ---
    if (updateData.marks !== undefined) {
      const marks = parseInt(updateData.marks, 10);
      if (isNaN(marks) || marks <= 0 || !Number.isInteger(marks)) {
        return res.status(400).json({
          success: false,
          message: 'marks must be a positive integer.',
        });
      }
      updateData.marks = marks;
    }

    // --- Trim string fields ---
    const stringFields = ['question', 'optionA', 'optionB', 'optionC', 'optionD'];
    for (const field of stringFields) {
      if (updateData[field] !== undefined && typeof updateData[field] === 'string') {
        updateData[field] = updateData[field].trim();
        if (updateData[field].length === 0) {
          return res.status(400).json({
            success: false,
            message: `"${field}" cannot be empty.`,
          });
        }
      }
    }

    // --- Verify question exists and get its exam ---
    const question = await prisma.examQuestion.findUnique({
      where: { id },
      include: {
        exam: {
          select: { teacherId: true, status: true },
        },
      },
    });

    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found.',
      });
    }

    // --- Verify exam exists (guard against orphaned questions) ---
    if (!question.exam) {
      return res.status(404).json({
        success: false,
        message: 'Associated exam not found for this question.',
      });
    }

    // --- Verify exam belongs to this teacher ---
    if (question.exam.teacherId !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this question.',
      });
    }

    // --- Only allow updates if exam is DRAFT ---
    if (question.exam.status !== 'DRAFT') {
      return res.status(400).json({
        success: false,
        message: `Cannot update questions for an exam with status "${question.exam.status}". Only DRAFT exams can be modified.`,
      });
    }

    // --- Update the question ---
    const updated = await prisma.examQuestion.update({
      where: { id },
      data: updateData,
    });

    return res.status(200).json({
      success: true,
      message: 'Question updated successfully.',
      data: updated,
    });
  } catch (error) {
    console.error('Error in PUT /questions/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating the question.',
    });
  }
});

// ============================================================
// DELETE /:id - Delete a Question
// ============================================================
router.delete('/:id', authenticate, requireRole('TEACHER'), async (req, res) => {
  try {
    const { id } = req.params;

    // --- Verify question exists and get its exam ---
    const question = await prisma.examQuestion.findUnique({
      where: { id },
      include: {
        exam: {
          select: { teacherId: true, status: true },
        },
      },
    });

    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found.',
      });
    }

    // --- Verify exam exists (guard against orphaned questions) ---
    if (!question.exam) {
      return res.status(404).json({
        success: false,
        message: 'Associated exam not found for this question.',
      });
    }

    // --- Verify exam belongs to this teacher ---
    if (question.exam.teacherId !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this question.',
      });
    }

    // --- Only allow deletion if exam is DRAFT ---
    if (question.exam.status !== 'DRAFT') {
      return res.status(400).json({
        success: false,
        message: `Cannot delete questions from an exam with status "${question.exam.status}". Only DRAFT exams can be modified.`,
      });
    }

    // --- Delete the question ---
    await prisma.examQuestion.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: 'Question deleted successfully.',
      data: {
        deletedQuestionId: id,
      },
    });
  } catch (error) {
    console.error('Error in DELETE /questions/:id:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while deleting the question.',
    });
  }
});

module.exports = router;
