import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import * as llmService from '../engine/llmService.js';
import * as vectorSearch from '../engine/vectorSearch.js';

// Build a minimal test-only Express app that mirrors the real router contract
// without touching Redis, ChromaDB, or Ollama.
const app = express();
app.use(cookieParser());
app.use(express.json());

let isReady = false;

app.get('/health', (req, res) => {
  res.json({ status: isReady ? 'ok' : 'initializing' });
});

app.post('/chat', async (req, res) => {
  if (!isReady) return res.status(503).json({ answer: 'System starting...' });

  const { message, stream } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Missing or empty message' });
  }

  try {
    // Issue / set cookie like real controller
    let sessionId = req.cookies?.chat_session;
    if (!sessionId) {
      sessionId = 'test-session-id';
      res.cookie('chat_session', sessionId, { httpOnly: true, sameSite: 'lax' });
    }

    const searchResults = await vectorSearch.vectorSearch(message, 4);
    const response = await llmService.generateRAGResponse(message, searchResults, '');
    response.sessionId = sessionId;
    return res.json(response);
  } catch (err) {
    return res.status(500).json({ error: 'Server Error' });
  }
});

describe('Backend API Integration', () => {
  beforeAll(() => {
    vi.spyOn(llmService, 'generateRAGResponse').mockResolvedValue({
      answer: 'This is a mock RAG response',
      highlights: ['Mock fact'],
      suggestions: ['Learn more?'],
      intent: 'rag_response',
    });

    vi.spyOn(vectorSearch, 'vectorSearch').mockResolvedValue([
      { text: 'Raise Smart is located in Coimbatore.', category: 'location', score: 0.95 },
    ]);

    isReady = true;
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('GET /health returns status ok when ready', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('POST /chat rejects missing message body', async () => {
    const res = await request(app).post('/chat').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('POST /chat rejects whitespace-only messages', async () => {
    const res = await request(app).post('/chat').send({ message: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('POST /chat returns a RAG response with correct shape', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ message: 'What is the fee?' });

    expect(res.status).toBe(200);
    expect(res.body.answer).toBe('This is a mock RAG response');
    expect(Array.isArray(res.body.highlights)).toBe(true);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
    expect(llmService.generateRAGResponse).toHaveBeenCalled();
    expect(vectorSearch.vectorSearch).toHaveBeenCalledWith('What is the fee?', 4);
  });

  it('POST /chat sets a chat_session HttpOnly cookie on first request', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ message: 'Tell me about admissions' });

    expect(res.status).toBe(200);
    const setCookieHeader = res.headers['set-cookie'];
    expect(setCookieHeader).toBeDefined();
    expect(setCookieHeader[0]).toContain('chat_session');
    expect(setCookieHeader[0]).toContain('HttpOnly');
  });

  it('POST /chat returns HTTP 500 when generateRAGResponse throws', async () => {
    vi.spyOn(llmService, 'generateRAGResponse').mockRejectedValueOnce(
      new Error('LLM unavailable')
    );
    const res = await request(app)
      .post('/chat')
      .send({ message: 'This should fail gracefully' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });
});
