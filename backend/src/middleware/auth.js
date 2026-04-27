const jwt = require('jsonwebtoken');

/**
 * JWT Authentication Middleware
 * Verifies the Bearer token from the Authorization header
 * and attaches the decoded user payload to req.user.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No authorization header provided.',
      });
    }

    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Invalid authorization format. Use: Bearer <token>',
      });
    }

    const token = parts[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
    }

    const secret = process.env.JWT_SECRET;

    if (!secret) {
      console.error('FATAL: JWT_SECRET is not defined in environment variables.');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error.',
      });
    }

    const decoded = jwt.verify(token, secret);

    // Verify user still exists in database (handles deleted/deactivated accounts)
    const prisma = require('../config/database');
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User account no longer exists. Please log in again.',
      });
    }

    // Refresh role from database in case it changed
    decoded.role = user.role;
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({
        success: false,
        message: 'Invalid token. Authentication failed.',
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please log in again.',
      });
    }

    if (error.name === 'NotBeforeError') {
      return res.status(403).json({
        success: false,
        message: 'Token not yet active.',
      });
    }

    return res.status(403).json({
      success: false,
      message: 'Authentication failed.',
    });
  }
};

module.exports = { authenticate };
