const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ──────────────────────────────────────────────
// POST /login
// ──────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, fullName, password } = req.body;

    if ((!email && !fullName) || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email or full name and password are required.',
      });
    }

    let user;

    if (email && email.includes('@')) {
      // Admin login via email
      user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        include: { student: true, teacher: true },
      });
    } else {
      // Student/Teacher login via full name
      const name = (fullName || email || '').trim().toLowerCase();
      const parts = name.split(/\s+/);

      if (parts.length < 2) {
        return res.status(400).json({
          success: false,
          message: 'Please enter your full name (first and last name).',
        });
      }

      // Try to match by student first, then teacher
      user = await prisma.user.findFirst({
        where: {
          role: 'STUDENT',
          student: {
            firstName: { equals: parts[0], mode: 'insensitive' },
            lastName: { equals: parts[parts.length - 1], mode: 'insensitive' },
          },
        },
        include: { student: true, teacher: true },
      });

      if (!user) {
        user = await prisma.user.findFirst({
          where: {
            role: 'TEACHER',
            teacher: {
              firstName: { equals: parts[0], mode: 'insensitive' },
              lastName: { equals: parts[parts.length - 1], mode: 'insensitive' },
            },
          },
          include: { student: true, teacher: true },
        });
      }
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid name or password.',
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid name or password.',
      });
    }

    // Block teachers who have not been approved yet
    if (user.role === 'TEACHER' && user.teacher && user.teacher.status === 'PENDING') {
      return res.status(403).json({
        success: false,
        message: 'Your account is pending admin approval.',
      });
    }

    // Block rejected teachers
    if (user.role === 'TEACHER' && user.teacher && user.teacher.status === 'REJECTED') {
      return res.status(403).json({
        success: false,
        message: 'Your registration has been rejected. Please contact the administrator.',
      });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Build profile object depending on role
    const profile = { id: user.id, email: user.email, role: user.role };

    if (user.student) {
      profile.student = {
        id: user.student.id,
        admissionNo: user.student.admissionNo,
        firstName: user.student.firstName,
        lastName: user.student.lastName,
        className: user.student.className,
      };
    }

    if (user.teacher) {
      profile.teacher = {
        id: user.teacher.id,
        firstName: user.teacher.firstName,
        lastName: user.teacher.lastName,
        status: user.teacher.status,
        subjects: JSON.parse(user.teacher.subjects || '[]'),
      };
    }

    return res.status(200).json({
      success: true,
      token,
      user: profile,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred during login. Please try again.',
    });
  }
});

// ──────────────────────────────────────────────
// POST /teacher-signup
// ──────────────────────────────────────────────
router.post('/teacher-signup', async (req, res) => {
  try {
    const { email, password, firstName, lastName, subjects } = req.body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, firstName, and lastName are required.',
      });
    }

    // Basic password strength check
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long.',
      });
    }

    // Check for existing email
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email already exists.',
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create User + Teacher in a single transaction (Teacher.id must equal User.id)
    const newUser = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          role: 'TEACHER',
        },
      });

      await tx.teacher.create({
        data: {
          id: createdUser.id,
          firstName,
          lastName,
          subjects: JSON.stringify(subjects || []),
          status: 'PENDING',
        },
      });

      return createdUser;
    });

    return res.status(201).json({
      success: true,
      message: 'Registration successful. Waiting for admin approval.',
      user: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
      },
    });
  } catch (error) {
    console.error('Teacher signup error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred during registration. Please try again.',
    });
  }
});

// ──────────────────────────────────────────────
// POST /change-password  (authenticated)
// ──────────────────────────────────────────────
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required.',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long.',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect.',
      });
    }

    // Prevent reusing the same password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from the current password.',
      });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully.',
    });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while changing password. Please try again.',
    });
  }
});

// ──────────────────────────────────────────────
// GET /me  (authenticated)
// ──────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { student: true, teacher: true },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    // Build safe profile (never expose the password hash)
    const profile = {
      id: user.id,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    if (user.student) {
      profile.student = {
        id: user.student.id,
        admissionNo: user.student.admissionNo,
        firstName: user.student.firstName,
        lastName: user.student.lastName,
        className: user.student.className,
      };
    }

    if (user.teacher) {
      profile.teacher = {
        id: user.teacher.id,
        firstName: user.teacher.firstName,
        lastName: user.teacher.lastName,
        status: user.teacher.status,
        subjects: JSON.parse(user.teacher.subjects || '[]'),
      };
    }

    return res.status(200).json({
      success: true,
      user: profile,
    });
  } catch (error) {
    console.error('Get current user error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching user data.',
    });
  }
});

// ──────────────────────────────────────────────
// POST /logout
// ──────────────────────────────────────────────
router.post('/logout', (req, res) => {
  // Stateless JWT — the client is responsible for discarding the token.
  // Optionally, the client can send the token in the body or
  // Authorization header so the response confirms the intent.
  return res.status(200).json({
    success: true,
    message: 'Logged out successfully.',
  });
});

module.exports = router;
