import { getOrCreateSession, saveSession } from '../services/redis.service.js';
import { processChatTurn } from '../../engine/conversationEngine.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

export const chatController = {
  handleChat: async (req, res, next) => {
    const startTime = Date.now();

    try {
      const { message, pageContext, stream } = req.body;
      const query = message.trim();

      if (!global.isReady) {
        return res.status(503).json({
          answer: "Systems are initializing... Give me a moment!",
          highlights: [],
          suggestions: ["Try Again"],
          intent: "system",
        });
      }

      let reqSessionId = req.body.sessionId || req.cookies?.chat_session_v2;
      if (!reqSessionId) {
        reqSessionId = crypto.randomUUID();
        res.cookie('chat_session_v2', reqSessionId, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
          maxAge: 86400000 // 24 hours
        });
      }

      // Tie session to authenticated user if available
      const sessionKey = req.user ? `user-${req.user.id}` : reqSessionId;
      const { sessionId, session } = await getOrCreateSession(sessionKey);

      logger.info({ sessionId: sessionId.slice(0, 8), query }, 'Processing query');

      const abortController = new AbortController();
      let isClientDisconnected = false;

      req.on('close', () => {
        isClientDisconnected = true;
        logger.warn({ sessionId: sessionId.slice(0, 8) }, 'Client disconnected. Aborting request.');
        abortController.abort();
      });

      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        try {
          const responseData = await processChatTurn(query, pageContext, session, sessionId, (token) => {
            if (!isClientDisconnected) {
              res.write(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`);
              if (res.flush) res.flush();
            }
          }, abortController.signal);

          if (!isClientDisconnected) {
            session.messages.push({ role: "user", text: query });
            session.messages.push({ role: "bot", text: responseData.answer });
            await saveSession(sessionKey, session);

            res.write(`data: ${JSON.stringify({ type: 'complete', data: responseData })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          }
        } catch (err) {
          if (!isClientDisconnected) {
            logger.error({ err }, "Stream generation error");
            res.write(`data: ${JSON.stringify({ type: 'error', content: 'Stream generation failed' })}\n\n`);
            res.end();
          }
        }
      } else {
        try {
          const responseData = await processChatTurn(query, pageContext, session, sessionId, null, abortController.signal);
          
          if (!isClientDisconnected) {
            session.messages.push({ role: "user", text: query });
            session.messages.push({ role: "bot", text: responseData.answer });
            await saveSession(sessionKey, session);

            logger.info({ elapsed: Date.now() - startTime }, 'Response generated via LLM');
            return res.json(responseData);
          }
        } catch (err) {
          if (!isClientDisconnected) {
            next(err);
          }
        }
      }
    } catch (error) {
      next(error);
    }
  }
};
