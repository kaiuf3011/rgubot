import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { redisClient } from "../services/redis.service.js";

const memoryLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: {
    answer: "You are sending messages too quickly. Please wait a moment.",
    highlights: [],
    suggestions: [],
    intent: "rate_limit_error"
  }
});

let redisLimiter = null;

export const chatRateLimiter = (req, res, next) => {
  if (redisClient && redisClient.isOpen) {
    if (!redisLimiter) {
      redisLimiter = rateLimit({
        windowMs: 1 * 60 * 1000,
        max: 30,
        store: new RedisStore({
          sendCommand: (...args) => redisClient.sendCommand(args),
        }),
        message: {
          answer: "You are sending messages too quickly. Please wait a moment.",
          highlights: [],
          suggestions: [],
          intent: "rate_limit_error"
        }
      });
    }
    return redisLimiter(req, res, next);
  } else {
    return memoryLimiter(req, res, next);
  }
};

const loginMemoryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many login attempts. Please try again later." }
});

let loginRedisLimiter = null;

export const loginRateLimiter = (req, res, next) => {
  if (redisClient && redisClient.isOpen) {
    if (!loginRedisLimiter) {
      loginRedisLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 5,
        store: new RedisStore({
          sendCommand: (...args) => redisClient.sendCommand(args),
        }),
        message: { error: "Too many login attempts. Please try again later." }
      });
    }
    return loginRedisLimiter(req, res, next);
  } else {
    return loginMemoryLimiter(req, res, next);
  }
};
