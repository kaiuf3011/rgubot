import { createClient } from 'redis';
import { randomUUID } from 'crypto';
import { logger } from '../utils/logger.js';

const MAX_SESSION_TURNS = 8;
const SESSION_TTL_SEC = 30 * 60; // 30 minutes

import { LRUCache } from 'lru-cache';

// ── In-Memory Fallback ──────────────────────────────────────────────────────
// Used when Redis is unavailable. Sessions are stored in process memory.
// Not suitable for multi-process deployments, but prevents a hard crash
// during local development or if Redis goes down temporarily.
const inMemoryStore = new LRUCache({
  max: 10000, // Maximum number of items
  ttl: SESSION_TTL_SEC * 1000, // Time to live in ms
  updateAgeOnGet: true, // Reset TTL on get
});

function inMemoryGet(key) {
  return inMemoryStore.get(key) || null;
}

function inMemorySet(key, value) {
  inMemoryStore.set(key, value);
}

// ── Redis Client ─────────────────────────────────────────────────────────────
export let redisClient = null;
let redisAvailable = false;

async function connectWithRetry(maxRetries = 5, delayMs = 2000) {
  const client = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: false, // We manage retries ourselves
    },
  });

  client.on('error', (err) => logger.warn({ err }, 'Redis connection error'));

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await client.connect();
      logger.info(`Redis connected successfully (attempt ${attempt})`);
      return client;
    } catch (err) {
      logger.warn(`Redis connect attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  logger.error(
    'Redis unavailable after all retries. Falling back to in-memory session store. ' +
    'Sessions will not persist across restarts and will not work in multi-process deployments.'
  );
  return null;
}

// Initiate connection (non-blocking — server starts regardless)
connectWithRetry().then((client) => {
  if (client) {
    redisClient = client;
    redisAvailable = true;
  }
});

// ── Session Operations ───────────────────────────────────────────────────────
export async function getOrCreateSession(sessionId) {
  if (!sessionId) {
    sessionId = randomUUID();
  }

  let session = { messages: [] };

  if (redisAvailable && redisClient?.isOpen) {
    try {
      const sessionData = await redisClient.get(`session:${sessionId}`);
      if (sessionData) {
        try { session = JSON.parse(sessionData); } catch (e) { logger.warn("Failed to parse redis session", e); }
      }
      // Extend TTL on every read
      await redisClient.expire(`session:${sessionId}`, SESSION_TTL_SEC);
    } catch (err) {
      logger.warn({ err }, 'Redis read failed, falling back to in-memory');
      const fallback = inMemoryGet(`session:${sessionId}`);
      if (fallback) {
        try { session = JSON.parse(fallback); } catch (e) { logger.warn("Failed to parse fallback session", e); }
      }
    }
  } else {
    const fallback = inMemoryGet(`session:${sessionId}`);
    if (fallback) {
      try { session = JSON.parse(fallback); } catch (e) { logger.warn("Failed to parse fallback session", e); }
    }
  }

  return { sessionId, session };
}

export async function saveSession(sessionId, session) {
  // Trim session to last N turns
  if (session.messages.length > MAX_SESSION_TURNS * 2) {
    session.messages = session.messages.slice(-MAX_SESSION_TURNS * 2);
  }

  const serialized = JSON.stringify(session);

  if (redisAvailable && redisClient?.isOpen) {
    try {
      await redisClient.set(`session:${sessionId}`, serialized, { EX: SESSION_TTL_SEC });
      return;
    } catch (err) {
      logger.warn({ err }, 'Redis write failed, falling back to in-memory');
    }
  }

  inMemorySet(`session:${sessionId}`, serialized);
}

export function getSessionContext(session) {
  if (!session?.messages?.length) return null;
  return session.messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n');
}
