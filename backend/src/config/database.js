const { PrismaClient } = require('@prisma/client');

const datasourceUrl = (() => {
  if (!process.env.DATABASE_URL) return undefined;
  const url = process.env.DATABASE_URL;
  if (url.includes('connection_limit')) return url;
  const separator = url.includes('?') ? '&' : '?';
  return url + separator + 'connection_limit=20&pool_timeout=30';
})();

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'info', 'warn', 'error']
    : ['warn', 'error'],
  datasourceUrl,
});

module.exports = prisma;
