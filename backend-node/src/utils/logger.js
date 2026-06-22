import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'rssee-rag-engine', version: '3.0.0' },
  timestamp: pino.stdTimeFunctions.isoTime,
});
