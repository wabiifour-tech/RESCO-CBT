const prisma = require('../config/database');

/**
 * Role-Based Access Control Middleware
 *
 * Usage: requireRole('ADMIN'), requireRole('TEACHER', 'ADMIN')
 * Returns a middleware that checks if the authenticated user's role
 * is included in the allowed roles list.
 */
const requireRole = (...roles) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.role) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.',
        });
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required role(s): ${roles.join(', ')}.`,
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Authorization check failed.',
      });
    }
  };
};

/**
 * Teacher Active Status Middleware
 *
 * Verifies that the authenticated user has an active teacher account.
 * Fetches the latest teacher status from the database to ensure
 * real-time status checks (e.g. after admin approval/rejection).
 */
const requireTeacherActive = async (req, res, next) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    if (req.user.role !== 'TEACHER') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This endpoint is restricted to teachers.',
      });
    }

    const teacher = await prisma.teacher.findUnique({
      where: { id: req.user.userId },
      select: { status: true, firstName: true, lastName: true },
    });

    if (!teacher) {
      return res.status(403).json({
        success: false,
        message: 'Teacher profile not found.',
      });
    }

    if (teacher.status === 'PENDING') {
      return res.status(403).json({
        success: false,
        message: 'Your teacher account is pending approval. Please wait for an administrator to review your registration.',
      });
    }

    if (teacher.status === 'REJECTED') {
      return res.status(403).json({
        success: false,
        message: 'Your teacher account has been rejected. Please contact the administrator for more information.',
      });
    }

    // Attach fresh teacher data to the request
    req.teacher = teacher;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Teacher status verification failed.',
    });
  }
};

module.exports = { requireRole, requireTeacherActive };
