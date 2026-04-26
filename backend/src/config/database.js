const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'info', 'warn', 'error']
    : ['warn', 'error'],
  datasourceUrl: process.env.DATABASE_URL
    ? process.env.DATABASE_URL + (process.env.DATABASE_URL.includes('connection_limit') ? '' : '?connection_limit=20&pool_timeout=30')
    : undefined,
});

module.exports = prisma;
