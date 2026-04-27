const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const prisma = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requireRole, requireTeacherActive } = require('../middleware/roleMiddleware');

// ============================================================
// Multer configuration for file uploads (CSV, PDF, DOCX, TXT)
// ============================================================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.csv', '.pdf', '.docx', '.txt'];
    const originalName = file.originalname || '';
    const ext = originalName.toLowerCase().slice(originalName.lastIndexOf('.'));
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV, PDF, DOCX, and TXT files are allowed. Old .doc format is not supported.'));
    }
  },
});

// ============================================================
// Helper: Verify exam belongs to the authenticated teacher
// ============================================================
async function verifyTeacherOwnsExam(teacherId, examId, role) {
  if (role === 'PRINCIPAL' || role === 'ADMIN') {
    return prisma.exam.findFirst({ where: { id: examId } });
  }
  return prisma.exam.findFirst({
    where: {
      id: examId,
      teacherId,
    },
  });
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
    let line = lines[i].trim();
    if (!line) continue; // skip empty lines

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
// Supports:
//   1) Numbered questions with A/B/C/D options and answer key
//   2) Delimited: question | optionA | optionB | optionC | optionD | answer | marks
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
          marks: parts.length >= 7 ? (isNaN(parseInt(parts[6], 10)) || parseInt(parts[6], 10) < 0 ? 1 : parseInt(parts[6], 10)) : 1, _rawIndex: i + 1,
        });
      }
    }
    return questions.length > 0 ? { rows: questions } : { error: 'Could not parse any questions from delimited file.' };
  }

  // Numbered question format
  const qPattern = /^(\d+)[.\)]\s*(.+)/;
  const optPattern = /^\s*([A-Da-d])[.\):]\s*(.+)/;
  const ansPattern = /^\s*(?:answer|ans|correct)[.\s:]+\s*([A-Da-d])/i;
  const marksPattern = /^\s*(?:mark|score|point)[s]?[.\s:]+\s*(\d+)/i;

  for (const line of lines) {
    const qMatch = line.match(qPattern);
    if (qMatch) {
      if (current && current.question) questions.push(current);
      current = { question: qMatch[2].trim(), optionA: '', optionB: '', optionC: '', optionD: '', answer: '', marks: 1, _rawIndex: parseInt(qMatch[1]) };
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
// POST /manual - Add Questions Manually
// ============================================================
router.post('/manual', authenticate, requireRole('TEACHER', 'PRINCIPAL'), requireTeacherActive, async (req, res) => {
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
    const exam = await verifyTeacherOwnsExam(req.user.userId, examId, req.user.role);

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

    // --- Create questions in batched transactions (50 per batch) ---
    let created = [];
    const BATCH_SIZE = 50;
    for (let i = 0; i < validQuestions.length; i += BATCH_SIZE) {
      const batch = validQuestions.slice(i, i + BATCH_SIZE);
      const batchCreated = await prisma.$transaction(
        batch.map((q) => prisma.examQuestion.create({ data: q }))
      );
      created = created.concat(batchCreated);
    }

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
// POST /upload - Upload Questions (CSV, PDF, DOCX, TXT)
// ============================================================
router.post('/upload', authenticate, requireRole('TEACHER', 'PRINCIPAL'), requireTeacherActive, upload.single('file'), async (req, res) => {
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
        message: 'No file uploaded.',
      });
    }

    // --- Verify exam belongs to this teacher (or user is PRINCIPAL/ADMIN) ---
    const exam = await verifyTeacherOwnsExam(req.user.userId, examId, req.user.role);

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

    // --- Parse file based on extension ---
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
      return res.status(400).json({
        success: false,
        message: 'Unsupported file format. Use CSV, PDF, DOCX, or TXT.',
      });
    }

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
        message: 'No questions could be parsed from the file.',
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

    // --- Create valid questions in batched transactions (50 per batch) ---
    let created = [];
    if (validQuestions.length > 0) {
      const BATCH_SIZE = 50;
      for (let i = 0; i < validQuestions.length; i += BATCH_SIZE) {
        const batch = validQuestions.slice(i, i + BATCH_SIZE);
        const batchCreated = await prisma.$transaction(
          batch.map((q) => prisma.examQuestion.create({ data: q }))
        );
        created = created.concat(batchCreated);
      }
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

    if (error.message && error.message.includes('files are allowed')) {
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
router.get('/:examId', authenticate, requireRole('TEACHER', 'PRINCIPAL'), requireTeacherActive, async (req, res) => {
  try {
    const { examId } = req.params;

    // --- Verify exam belongs to this teacher (or user is PRINCIPAL/ADMIN) ---
    const exam = await verifyTeacherOwnsExam(req.user.userId, examId, req.user.role);

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
router.put('/:id', authenticate, requireRole('TEACHER', 'PRINCIPAL'), requireTeacherActive, async (req, res) => {
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

    // --- Verify exam belongs to this teacher (or user is PRINCIPAL/ADMIN) ---
    if (req.user.role !== 'PRINCIPAL' && req.user.role !== 'ADMIN' && question.exam.teacherId !== req.user.userId) {
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
router.delete('/:id', authenticate, requireRole('TEACHER', 'PRINCIPAL'), requireTeacherActive, async (req, res) => {
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

    // --- Verify exam belongs to this teacher (or user is PRINCIPAL/ADMIN) ---
    if (req.user.role !== 'PRINCIPAL' && req.user.role !== 'ADMIN' && question.exam.teacherId !== req.user.userId) {
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
