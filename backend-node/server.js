import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
// dd-trace removed for debugging
import cookieParser from 'cookie-parser';
import { z } from 'zod';
import { logger } from './src/utils/logger.js';
import { loadKnowledgeBase, watchKnowledgeBase } from './engine/knowledgeLoader.js';
import { initVectorStore } from './engine/vectorSearch.js';
import { setupSwagger } from './src/docs/swagger.js';
import chatRoutes from './src/routes/chat.routes.js';
import authRoutes from './src/routes/auth.routes.js';
import healthRoutes from './src/routes/health.routes.js';
import { metricsMiddleware } from './src/middlewares/metrics.js';
import { errorHandler } from './src/middlewares/errorHandler.js';

const app = express();

app.use(metricsMiddleware);

app.use((req, res, next) => {
  logger.info({ method: req.method, url: req.url }, '--- GLOBAL REQUEST START ---');
  next();
});

app.use(cookieParser());

// Security Middleware
app.use(helmet());
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com"],
    imgSrc: ["'self'", "data:"],
    connectSrc: ["'self'"],
    frameAncestors: ["'none'"],
  }
}));
app.use(helmet.noSniff());
app.use(helmet.hidePoweredBy());
app.use(helmet.frameguard({ action: 'deny' }));

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'http://localhost:5178',
  'http://localhost:5179'
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400
}));

app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));
app.use(express.static('public'));

// Initialize knowledge and Vector DB
global.knowledgeBase = null;
global.isReady = false;

export function validateEnvironment() {
  const envSchema = z.object({
    LLM_PROVIDER: z.enum(['openai', 'gemini']).optional().default('openai'),
    OPENAI_API_KEY: z.string().min(1).optional(),
    GEMINI_API_KEY: z.string().min(1).optional(),
  }).superRefine((data, ctx) => {
    if (data.LLM_PROVIDER === 'openai' && !data.OPENAI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "OPENAI_API_KEY is required when LLM_PROVIDER is openai",
      });
    }
    if (data.LLM_PROVIDER === 'gemini' && !data.GEMINI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "GEMINI_API_KEY is required when LLM_PROVIDER is gemini",
      });
    }
  });

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errorMsg = result.error ? result.error.issues.map(e => e.message).join(', ') : "Invalid env";
    logger.fatal({ err: errorMsg }, "Environment validation failed");
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    } else {
      throw new Error(`Env validation failed: ${errorMsg}`);
    }
  }
}

async function initialize() {
  try {
    if (process.env.NODE_ENV !== 'test') {
      validateEnvironment();
    }
    global.knowledgeBase = loadKnowledgeBase();
    await initVectorStore(global.knowledgeBase);
    global.isReady = true;
    logger.info("RSSEE RAG Engine (LLM Mode + ChromaDB) is active.");
  } catch (error) {
    logger.error({ err: error.message || error }, "Failed to initialize");
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    } else {
      throw error;
    }
  }
}

// Routes
setupSwagger(app);
app.use('/chat', chatRoutes);
app.use('/health', healthRoutes);
app.use('/login', authRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  initialize().then(() => {
    watchKnowledgeBase(async () => {
      logger.info("Hot-reloading knowledge indices...");
      await initialize();
    });
  });

  const server = app.listen(PORT, () => {
    logger.info(`RSSEE RAG Engine v3.0 listening on http://localhost:${PORT}`);
    logger.info(`API Documentation at http://localhost:${PORT}/api-docs`);
  });

  // Graceful Shutdown Handler
  const shutdown = async (signal) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    server.close(async () => {
      logger.info('HTTP server closed.');
      try {
        const { redisClient } = await import('./src/services/redis.service.js');
        if (redisClient && redisClient.isOpen) {
          await redisClient.quit();
          logger.info('Redis connection closed.');
        }
        
        const { fuseWorker } = await import('./engine/vectorSearch.js');
        if (fuseWorker) {
          fuseWorker.terminate();
          logger.info('Fuse worker terminated.');
        }

        logger.info('Graceful shutdown completed.');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during graceful shutdown');
        process.exit(1);
      }
    });
    
    // Force close after 10s if connections are hanging
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export { app, initialize };
