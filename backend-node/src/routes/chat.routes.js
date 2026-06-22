import express from 'express';
import { chatController } from '../controllers/chat.controller.js';
import { validateSchema } from '../middlewares/validate.js';
import { chatRequestSchema } from '../schemas/chat.schema.js';
import { chatRateLimiter } from '../middlewares/rateLimit.js';

const router = express.Router();

const apiKeyAuth = (req, res, next) => {
  const configuredKey = process.env.CHAT_API_KEY;
  if (!configuredKey) return next(); // Not configured, allow
  
  const providedKey = req.headers['x-api-key'];
  if (!providedKey || providedKey !== configuredKey) {
    return res.status(401).json({ error: "Unauthorized. Invalid or missing x-api-key header." });
  }
  next();
};

/**
 * @swagger
 * /chat:
 *   post:
 *     summary: Send a message to the RAG chatbot
 *     tags: [Chat]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message:
 *                 type: string
 *                 description: The user's query
 *               stream:
 *                 type: boolean
 *                 description: Set to true for Server-Sent Events (SSE) stream
 *               pageContext:
 *                 type: string
 *               sessionId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Chatbot response
 *       400:
 *         description: Validation error
 */
router.post('/', chatRateLimiter, apiKeyAuth, validateSchema(chatRequestSchema), async (req, res, next) => {
  try {
    console.log('Inside chat route wrapper - starting handleChat');
    await chatController.handleChat(req, res);
    console.log('Inside chat route wrapper - finished handleChat');
  } catch (error) {
    console.error('CHAT ROUTE UNHANDLED ERROR:', error);
    next(error);
  }
});

router.post('/reset', async (req, res, next) => {
  try {
    const { getOrCreateSession, saveSession } = await import('../services/redis.service.js');
    const crypto = await import('crypto');
    let reqSessionId = req.cookies?.chat_session_v2;
    if (reqSessionId) {
      const sessionKey = req.user ? `user-${req.user.id}` : reqSessionId;
      const { sessionId, session } = await getOrCreateSession(sessionKey);
      session.messages = [];
      await saveSession(sessionId, session);
    }
    res.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
});

export default router;
