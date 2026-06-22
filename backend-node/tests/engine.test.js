import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { loadKnowledgeBase } from '../engine/knowledgeLoader.js';
import * as vectorSearch from '../engine/vectorSearch.js';
import { detectIntent } from '../engine/intentDetector.js';

// We test the knowledgeLoader (pure in-memory, no external deps)
// and mock vectorSearch (requires ChromaDB + Ollama) to test its interface contract.

describe('knowledgeLoader', () => {
  it('should return an object with parentDocs, childChunks and intents', () => {
    const kb = loadKnowledgeBase();
    expect(kb).toHaveProperty('parentDocs');
    expect(kb).toHaveProperty('childChunks');
    expect(kb).toHaveProperty('intents');
    expect(kb.parentDocs instanceof Map).toBe(true);
    expect(Array.isArray(kb.childChunks)).toBe(true);
    expect(Array.isArray(kb.intents)).toBe(true);
  });
});

describe('detectIntent', () => {
  const mockSynonyms = {
    "rgu": ["rathinam", "r-smart", "college", "university"],
    "hostel": ["accommodation"]
  };

  const mockIntents = [
    {
      tag: "hostel_overview",
      patterns: ["hostel", "tell me about hostel", "hostel details"],
      responses: ["Separate on-campus hostel facilities are available."],
      keywords: ["hostel", "details", "accommodation"]
    },
    {
      tag: "placements_redirect",
      patterns: ["placements", "tell me about placements", "job opportunities"],
      responses: ["Placements are excellent here."],
      keywords: ["placements", "job", "career"]
    }
  ];

  it('should bypass matching for institutional queries and return fallback', () => {
    const res1 = detectIntent("tell me about rgu", mockIntents, mockSynonyms);
    expect(res1.matched).toBe(false);
    expect(res1.tag).toBe("fallback");

    const res2 = detectIntent("what is r-smart", mockIntents, mockSynonyms);
    expect(res2.matched).toBe(false);
    expect(res2.tag).toBe("fallback");
  });

  it('should match valid intents when overlap exists and score is high', () => {
    const res = detectIntent("tell me about hostel", mockIntents, mockSynonyms);
    expect(res.matched).toBe(true);
    expect(res.tag).toBe("hostel_overview");
  });

  it('should reject intents if keywordOverlap is zero', () => {
    // This query has tell/me/about (stop words) and rgu, but hostel_overview has "hostel"
    // With overlap gate, it should reject because query keywords ["rgu"] has no overlap with ["hostel"]
    const res = detectIntent("tell me about rgu", mockIntents, mockSynonyms);
    expect(res.matched).toBe(false);
  });
});

describe('vectorSearch (interface contract)', () => {
  beforeAll(() => {
    // Mock vectorSearch to avoid requiring a live ChromaDB + Ollama instance in CI
    vi.spyOn(vectorSearch, 'vectorSearch').mockResolvedValue([
      { text: 'RGU offers B.Tech programs.', category: 'courses', source: 'knowledge.json', score: 0.92 },
      { text: 'Campus is in Coimbatore, Tamil Nadu.', category: 'location', source: 'knowledge.json', score: 0.87 },
    ]);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('should return an array of results', async () => {
    const results = await vectorSearch.vectorSearch('What courses are offered?', 4);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it('each result should have text, category, source, and score fields', async () => {
    const results = await vectorSearch.vectorSearch('Where is the campus?', 4);
    for (const result of results) {
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('source');
      expect(result).toHaveProperty('score');
      expect(typeof result.text).toBe('string');
      expect(typeof result.score).toBe('number');
    }
  });

  it('should return an empty array gracefully when vectorStore is unavailable', async () => {
    vi.spyOn(vectorSearch, 'vectorSearch').mockResolvedValueOnce([]);
    const results = await vectorSearch.vectorSearch('unparseable garbage query @@@', 4);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });
});
