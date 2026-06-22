import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnvironment } from '../server.js';

describe('validateEnvironment', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'test' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should not throw when OPENAI_API_KEY is present for openai provider', () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(() => validateEnvironment()).not.toThrow();
  });

  it('should throw when OPENAI_API_KEY is missing for openai provider', () => {
    process.env.LLM_PROVIDER = 'openai';
    delete process.env.OPENAI_API_KEY;
    expect(() => validateEnvironment()).toThrow(/OPENAI_API_KEY is required/);
  });

  it('should not throw when GEMINI_API_KEY is present for gemini provider', () => {
    process.env.LLM_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'gemini-test-key';
    expect(() => validateEnvironment()).not.toThrow();
  });

  it('should throw when GEMINI_API_KEY is missing for gemini provider', () => {
    process.env.LLM_PROVIDER = 'gemini';
    delete process.env.GEMINI_API_KEY;
    expect(() => validateEnvironment()).toThrow(/GEMINI_API_KEY is required/);
  });
});
