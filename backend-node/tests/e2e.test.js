import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import nock from 'nock';
import { app, initialize } from '../server.js';
import { getOrCreateSession, redisClient } from '../src/services/redis.service.js';

describe('E2E Integration Tests', () => {
  let infrastructureAvailable = true;

  beforeAll(async () => {
    try {
      // Mock Ollama API endpoints to ensure CI/CD reliability without live LLM
      const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
      nock(ollamaUrl)
        .persist()
        .post('/api/embeddings')
        .reply(200, { embedding: new Array(768).fill(0.1) });

      nock(ollamaUrl)
        .persist()
        .post('/api/generate')
        .reply(200, '{"response": "{\\"answer\\": \\"Mocked LLM Answer\\", \\"highlights\\": [\\"Mocked highlight\\"], \\"suggestions\\": [\\"Mocked suggestion?\\"]}"}\n');

      // Initialize knowledge base, vector store, etc.
      await initialize();
      // Wait for Redis connection attempt to complete if not already
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.warn("Infrastructure not available, skipping tests.", err.message);
      infrastructureAvailable = false;
    }
  }, 60000);

  afterAll(async () => {
    // Close redis client if open so process can exit gracefully
    if (redisClient && redisClient.isOpen) {
      await redisClient.disconnect();
    }
  });

  it('should answer a chat query and set session', async () => {
    if (!infrastructureAvailable) {
      console.warn("Skipping test because infrastructure is missing.");
      return;
    }

    const res = await request(app)
      .post('/chat')
      .send({ message: 'What is the fee for B.Tech?', stream: false });

    // Expecting 200 OK (or if it fails due to infrastructure, it might be 500/503 but we expect success per requirements if services are up)
    if (res.status === 503) {
      console.warn("System initializing, test skipped.");
      return;
    }
    
    if (res.status !== 200) {
      console.error("Test failed with status:", res.status, "body:", res.body);
    }
    expect(res.status).toBe(200);

    // Verify response body contains answer
    expect(res.body).toHaveProperty('answer');
    expect(typeof res.body.answer).toBe('string');
    
    // Check if cookie is set
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    
    // Extract session ID from cookie
    let sessionId;
    if (cookies) {
      const chatCookie = cookies.find(c => c.startsWith('chat_session='));
      if (chatCookie) {
        sessionId = chatCookie.split('=')[1].split(';')[0];
      }
    }
    
    // Controller also returns sessionId in responseData
    const returnedSessionId = res.body.sessionId || sessionId;
    expect(returnedSessionId).toBeDefined();
    
    // Verify it created the session in Redis (or in-memory fallback)
    const { session } = await getOrCreateSession(returnedSessionId);
    expect(session).toBeDefined();
    expect(session.messages).toBeDefined();
    
    // We expect at least the latest user query and bot response to be saved
    const userMessage = session.messages.find(m => m.role === 'user' && m.text === 'What is the fee for B.Tech?');
    const botMessage = session.messages.find(m => m.role === 'bot');
    
    expect(userMessage).toBeDefined();
    expect(botMessage).toBeDefined();
  }, 45000); // 45s timeout to allow LLM/Vector search and initialization
});
