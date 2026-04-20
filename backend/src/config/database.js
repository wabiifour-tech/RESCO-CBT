const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'info', 'warn', 'error']
    : ['warn', 'error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

module.exports = prisma;
