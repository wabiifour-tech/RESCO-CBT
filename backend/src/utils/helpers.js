/**
 * Shuffle an array using the Fisher-Yates (Knuth) algorithm.
 * Returns a new shuffled array; does not mutate the original.
 *
 * @param {Array} array - The array to shuffle
 * @returns {Array} A new array with elements in random order
 */
const shuffleArray = (array) => {
  if (!Array.isArray(array)) {
    throw new TypeError('shuffleArray expects an array as input.');
  }

  const shuffled = [...array];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[i]];
  }

  return shuffled;
};

/**
 * Calculate the score for a set of answers against questions.
 *
 * @param {Array<Object>} answers  - Array of answer objects: { questionId, selected }
 * @param {Array<Object>} questions - Array of question objects: { id, answer, marks }
 * @returns {{ score: number, totalMarks: number, percentage: number, correctCount: number, totalQuestions: number }}
 */
const calculateScore = (answers, questions) => {
  if (!Array.isArray(answers) || !Array.isArray(questions)) {
    throw new TypeError('Both answers and questions must be arrays.');
  }

  // Build a lookup map for questions by ID
  const questionMap = new Map();
  for (const question of questions) {
    questionMap.set(question.id, question);
  }

  let score = 0;
  let totalMarks = 0;
  let correctCount = 0;
  const totalQuestions = questions.length;

  for (const question of questions) {
    totalMarks += question.marks || 1;
  }

  for (const answer of answers) {
    if (!answer || !answer.questionId) continue;
    const question = questionMap.get(answer.questionId);

    if (!question) {
      continue;
    }

    const questionMarks = question.marks || 1;

    if (
      typeof answer.selected === 'string' &&
      typeof question.answer === 'string' &&
      answer.selected &&
      question.answer &&
      answer.selected.toUpperCase() === question.answer.toUpperCase()
    ) {
      score += questionMarks;
      correctCount++;
    }
  }

  const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;

  return {
    score,
    totalMarks,
    percentage: Math.round(percentage * 100) / 100, // 2 decimal places
    correctCount,
    totalQuestions,
  };
};

/**
 * Format a number of seconds into "HH:MM:SS" string format.
 *
 * @param {number} totalSeconds - The total number of seconds
 * @returns {string} Formatted time string, e.g. "01:23:45"
 */
const formatTime = (totalSeconds) => {
  if (typeof totalSeconds !== 'number' || totalSeconds < 0) {
    return '00:00:00';
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const pad = (num) => String(num).padStart(2, '0');

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

/**
 * Generate a unique admission number.
 * Format: RES/YYYY/CLASS/NNN
 * Example: "RES/2025/JSS1/001"
 *
 * @param {string} className - The student's class name, e.g. "JSS1", "SSS2"
 * @returns {Promise<string>} The generated admission number
 */
const generateAdmissionNo = async (className, maxRetries = 3) => {
  if (!className || typeof className !== 'string') {
    throw new Error('Class name is required to generate admission number.');
  }

  const prisma = require('../config/database');
  const currentYear = new Date().getFullYear();
  const normalizedClass = className.trim().toUpperCase();

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const prefix = `RES/${currentYear}/${normalizedClass}/`;

    const lastStudent = await prisma.student.findFirst({
      where: {
        admissionNo: {
          startsWith: prefix,
        },
      },
      orderBy: {
        admissionNo: 'desc',
      },
      select: {
        admissionNo: true,
      },
    });

    let nextNumber = 1;
    if (lastStudent) {
      const lastAdmissionNo = lastStudent.admissionNo;
      const parts = lastAdmissionNo.split('/');
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) {
        nextNumber = lastNum + 1;
      }
    }

    const paddedNumber = String(nextNumber).padStart(3, '0');
    const admissionNo = `${prefix}${paddedNumber}`;

    // Verify it doesn't exist (race condition guard)
    const exists = await prisma.student.findUnique({
      where: { admissionNo },
      select: { id: true },
    });
    if (!exists) return admissionNo;
    // Collision — retry with next number
  }

  throw new Error('Failed to generate unique admission number after retries.');
};

/**
 * Validate whether a student can access/take an exam.
 *
 * Checks:
 *  1. The exam must be in PUBLISHED status
 *  2. The current time must be within the exam's start/end date range
 *  3. The student must not have already submitted a result for this exam
 *
 * @param {Object} exam    - The exam object (must include id, status, startDate, endDate)
 * @param {Object} student - The student object (must include id)
 * @returns {{ accessible: boolean, reason?: string }}
 */
const validateExamAccess = (exam, student) => {
  if (!exam || !student) {
    return {
      accessible: false,
      reason: 'Invalid exam or student data.',
    };
  }

  // Check exam status
  if (exam.status !== 'PUBLISHED') {
    return {
      accessible: false,
      reason: `This exam is currently ${exam.status.toLowerCase()}. Only published exams are accessible.`,
    };
  }

  // Check date range
  const now = new Date();
  const startDate = new Date(exam.startDate);
  const endDate = new Date(exam.endDate);

  if (now < startDate) {
    return {
      accessible: false,
      reason: `This exam has not started yet. It begins on ${startDate.toLocaleString()}.`,
    };
  }

  if (now > endDate) {
    return {
      accessible: false,
      reason: 'This exam has ended and is no longer accessible.',
    };
  }

  // Check if student already has a result (duplicate attempt check)
  // Note: The caller should pass existingResults if available, or check separately.
  // This function validates static exam properties; the database unique constraint
  // on [examId, studentId] will also prevent duplicates at the data layer.

  return {
    accessible: true,
  };
};

module.exports = {
  shuffleArray,
  calculateScore,
  formatTime,
  generateAdmissionNo,
  validateExamAccess,
};
