require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { execSync } = require('child_process');

const { healSchema } = require('./migrate');
const prisma = require('./config/database');

// Route imports
const authRoutes = require('./routes/auth.routes');
const examRoutes = require('./routes/exam.routes');
const questionRoutes = require('./routes/question.routes');
const resultRoutes = require('./routes/result.routes');
const adminRoutes = require('./routes/admin.routes');
const principalRoutes = require('./routes/principal.routes');

const app = express();

// ========================================
// Middleware
// ========================================

// Set security-related HTTP headers
app.use(helmet());

// Enable CORS with credentials
app.use(cors({
  origin: function (origin, callback) {
    const allowed = [
      process.env.CLIENT_URL,
      'http://localhost:3000',
      'http://localhost:5173',
      'https://resco-cbt.vercel.app',
    ].filter(Boolean);
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all origins in production
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Parse JSON request bodies
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded request bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// HTTP request logger (development mode)
app.use(morgan('dev'));

// ========================================
// API Routes
// ========================================

app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/principal', principalRoutes);

// ========================================
// Health Check
// ========================================

app.get('/api/health', (req, res) => {
  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
  });
});

// ========================================
// 404 Handler
// ========================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ========================================
// Global Error Handler
// ========================================

app.use((err, req, res, next) => {
  // Log the error for debugging
  console.error(`[ERROR] ${new Date().toISOString()} — ${err.message}`);
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }

  // Prisma-specific error handling
  if (err.code && err.code.startsWith('P')) {
    const prismaErrors = {
      P2002: {
        status: 409,
        message: 'A record with this value already exists. Duplicate entry.',
      },
      P2025: {
        status: 404,
        message: 'Record not found.',
      },
      P2003: {
        status: 400,
        message: 'Related record not found. Foreign key constraint violation.',
      },
      P2001: {
        status: 400,
        message: 'Constraint violation on database operation.',
      },
    };

    const prismaError = prismaErrors[err.code];

    if (prismaError) {
      return res.status(prismaError.status).json({
        success: false,
        message: prismaError.message,
        ...(process.env.NODE_ENV === 'development' && { error: err.meta }),
      });
    }
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(403).json({
      success: false,
      message: 'Invalid token.',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(403).json({
      success: false,
      message: 'Token has expired.',
    });
  }

  // Multipart/form-data errors (Multer)
  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      message: `File upload error: ${err.message}`,
    });
  }

  // Default: Internal Server Error
  const statusCode = err.statusCode || 500;
  const message =
    process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'An unexpected error occurred.'
      : err.message;

  return res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ========================================
// Server Startup & Shutdown
// ========================================

const PORT = process.env.PORT || 5000;

// Retry logic for database connection
async function connectWithRetry(maxRetries = 20, baseDelayMs = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await prisma.$connect();
      console.log(`✅ Database connected successfully (attempt ${attempt}/${maxRetries})`);
      return;
    } catch (err) {
      console.warn(`⏳ DB connection attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(1.3, attempt - 1);
        console.log(`   Retrying in ${Math.round(delay / 1000)}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  console.error(`❌ Database unreachable after ${maxRetries} retries. Server will start but DB queries will fail.`);
}

const server = app.listen(PORT, async () => {
  try {
    await connectWithRetry();

    // ── CRITICAL: Ensure database tables exist before serving requests ──
    // This runs prisma db push to create/align tables from schema.prisma
    if (process.env.DATABASE_URL) {
      try {
        console.log('[DB Setup] Running prisma db push to ensure tables exist...');
        const pushOutput = execSync('npx prisma db push --accept-data-loss 2>&1', {
          cwd: process.cwd(),
          timeout: 60000,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        console.log('[DB Setup] prisma db push completed successfully.');
        if (pushOutput) console.log(pushOutput.trim());
      } catch (pushErr) {
        // prisma db push exits with code 1 if there are no changes — that's OK
        const stderr = pushErr.stderr || pushErr.stdout || pushErr.message || '';
        if (stderr.includes('Your database is now in sync') || stderr.includes('Already in sync') || stderr.includes('The database is already in sync')) {
          console.log('[DB Setup] Database already in sync.');
        } else {
          console.error('[DB Setup] prisma db push output:', (pushErr.stdout || '').trim());
          console.error('[DB Setup] prisma db push stderr:', (pushErr.stderr || '').trim());
          console.warn('[DB Setup] Continuing with healSchema as fallback...');
        }
      }
    } else {
      console.warn('[DB Setup] DATABASE_URL not set — skipping prisma db push.');
    }

    // ── CRITICAL: Heal database schema BEFORE serving any requests ──
    await healSchema(prisma);

    // ── Auto-seed principal account if it doesn't exist ──
    try {
      const bcrypt = require('bcryptjs');
      const principalEmail = process.env.PRINCIPAL_EMAIL || 'principal@resco';
      const existingPrincipal = await prisma.user.findUnique({ where: { email: principalEmail } });
      if (!existingPrincipal) {
        const principalPass = process.env.PRINCIPAL_PASSWORD || 'affordables';
        const hashedPw = await bcrypt.hash(principalPass, 12);
        await prisma.user.create({
          data: {
            email: principalEmail,
            password: hashedPw,
            role: 'PRINCIPAL',
            firstName: 'Aderonke Rachael',
            lastName: 'Odewabi',
          },
        });
        console.log('✅ Principal account auto-created: ' + principalEmail);
      }
    } catch (seedErr) {
      console.warn('⚠️  Principal auto-seed skipped:', seedErr.message);
    }

    console.log(`🚀 RESCO CBT Server running on port ${PORT} [${process.env.NODE_ENV || 'development'} mode]`);
    console.log(`   Health check: http://localhost:${PORT}/api/health`);
  } catch (startupErr) {
    console.error('❌ Server startup failed:', startupErr);
    process.exit(1);
  }
});

// Graceful shutdown handlers
const shutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  // Stop accepting new connections
  server.close(() => {
    console.log('✅ HTTP server closed.');
  });

  try {
    await prisma.$disconnect();
    console.log('✅ Database connection closed.');
  } catch (disconnectError) {
    console.error('❌ Error disconnecting from database:', disconnectError.message);
  }

  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  shutdown('uncaughtException');
});

module.exports = app;
