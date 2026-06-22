import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chatController } from '../src/controllers/chat.controller.js';
import * as llmService from '../engine/llmService.js';
import * as vectorSearch from '../engine/vectorSearch.js';
import * as redisService from '../src/services/redis.service.js';
import * as intentDetector from '../engine/intentDetector.js';

describe('Phase 5: chat.controller.js Latency & Follow-up', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('P5-U1: Simple query bypasses rewriter wait', async () => {
    global.isReady = true;
    
    // Mock session (empty history = simple query)
    const mockSession = { messages: [] };
    vi.spyOn(redisService, 'getOrCreateSession').mockResolvedValue({ sessionId: '123', session: mockSession });
    vi.spyOn(redisService, 'saveSession').mockResolvedValue();
    vi.spyOn(intentDetector, 'detectIntent').mockReturnValue({ matched: false });
    
    // Rewrite is slow (100ms)
    const rewriteSpy = vi.spyOn(llmService, 'rewriteQuery').mockImplementation(() => {
      return new Promise(resolve => setTimeout(() => resolve(['rewritten']), 100));
    });
    
    // Search is fast (10ms)
    const searchSpy = vi.spyOn(vectorSearch, 'vectorSearch').mockImplementation(() => {
      return new Promise(resolve => setTimeout(() => resolve([{ text: 'result' }]), 10));
    });
    
    // RAG generation is fast
    const generateSpy = vi.spyOn(llmService, 'generateRAGResponse').mockResolvedValue({ answer: 'test' });
    
    const req = {
      body: { message: 'fees', pageContext: '' },
      cookies: {},
      on: vi.fn()
    };
    
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      cookie: vi.fn()
    };
    
    const start = Date.now();
    await chatController.handleChat(req, res);
    const timeTaken = Date.now() - start;
    
    // Because it's parallel, it should finish in ~10ms (search) + overhead, NOT waiting for 100ms rewrite.
    // The query is simple ("fees", no pronouns, empty history).
    expect(timeTaken).toBeLessThan(80); 
    expect(searchSpy).toHaveBeenCalledWith(['fees'], 10);
    expect(res.json).toHaveBeenCalled();
  });

  it('P5-U2: Follow-up resolver extracts topic from history', async () => {
    global.isReady = true;
    
    // Mock session (history exists = not simple query)
    const mockSession = { 
      messages: [
        { role: 'user', text: 'what courses?' },
        { role: 'bot', text: 'We offer engineering and computer science programs.' }
      ] 
    };
    vi.spyOn(redisService, 'getOrCreateSession').mockResolvedValue({ sessionId: '123', session: mockSession });
    vi.spyOn(redisService, 'saveSession').mockResolvedValue();
    vi.spyOn(intentDetector, 'detectIntent').mockReturnValue({ matched: false });
    
    // Rewrite throws (simulating failure) to trigger the follow-up resolver fallback
    vi.spyOn(llmService, 'rewriteQuery').mockRejectedValue(new Error('timeout'));
    
    const searchSpy = vi.spyOn(vectorSearch, 'vectorSearch').mockResolvedValue([]);
    vi.spyOn(llmService, 'generateRAGResponse').mockResolvedValue({ answer: 'test' });
    
    const req = {
      body: { message: 'what are the fees?', pageContext: '' },
      cookies: {},
      on: vi.fn()
    };
    
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      cookie: vi.fn()
    };
    
    await chatController.handleChat(req, res);
    
    // The follow-up resolver should extract nouns from the bot's last answer.
    // "We offer engineering and computer science programs."
    // Stopwords filter out "We", "and". Remaining long words: "offer", "engineering", "computer", "science", "programs".
    // Takes first 3 > 3 chars: "offer engineering computer".
    // Prepend to query: "offer engineering computer what are the fees?"
    
    expect(searchSpy).toHaveBeenCalled();
    const queryUsed = searchSpy.mock.calls[0][0][0];
    expect(queryUsed).toContain('engineering');
    expect(queryUsed).toContain('fees');
  });

  it('P6-U2: Short query bypasses rewriter', async () => {
    global.isReady = true;
    
    // Mock session (no history)
    const mockSession = { messages: [] };
    vi.spyOn(redisService, 'getOrCreateSession').mockResolvedValue({ sessionId: '123', session: mockSession });
    vi.spyOn(redisService, 'saveSession').mockResolvedValue();
    vi.spyOn(intentDetector, 'detectIntent').mockReturnValue({ matched: false });
    
    // Spy on rewrite
    const rewriteSpy = vi.spyOn(llmService, 'rewriteQuery');
    
    vi.spyOn(vectorSearch, 'vectorSearch').mockResolvedValue([{ text: 'result' }]);
    vi.spyOn(llmService, 'generateRAGResponse').mockResolvedValue({ answer: 'test' });
    
    const req = {
      body: { message: 'hello bot', pageContext: '' },
      cookies: {},
      on: vi.fn()
    };
    
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      cookie: vi.fn()
    };
    
    await chatController.handleChat(req, res);
    
    // 2-word query, no history -> fast track!
    expect(rewriteSpy).not.toHaveBeenCalled();
  });
});
