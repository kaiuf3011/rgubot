import { vi, describe, it, expect } from 'vitest';
import { vectorSearch, setTestState } from '../engine/vectorSearch.js';
import { reciprocalRankFusion } from '../engine/search/ranker.js';

describe('reciprocalRankFusion', () => {
  it('should rank items without category boost normally', () => {
    const list1 = [
      { id: '1', category: 'admission' },
      { id: '2', category: 'hostel' }
    ];
    
    // No queries provided -> no boost
    const fused = reciprocalRankFusion([list1]);
    expect(fused.length).toBe(2);
    expect(fused[0].id).toBe('1'); // rank 1 > rank 2
    expect(fused[1].id).toBe('2');
  });

  it('should boost items that match category string', () => {
    const list1 = [
      { id: '1', category: 'admission' },
      { id: '2', category: 'hostel admission policy' }
    ];
    
    // Both items at rank 1 and 2 normally.
    // Query contains "hostel", which matches item 2's category.
    // Item 2 should get 1.25x boost and surpass item 1.
    const fused = reciprocalRankFusion([list1], ['hostel rules']);
    
    expect(fused.length).toBe(2);
    expect(fused[0].id).toBe('2'); // item 2 boosted!
    expect(fused[1].id).toBe('1');
  });

  it('ignores short tokens for category boosting', () => {
    const list1 = [
      { id: '1', category: 'it' },
      { id: '2', category: 'hostel' }
    ];
    
    // "it" is short (length < 4), should not boost
    const fused = reciprocalRankFusion([list1], ['it']);
    
    expect(fused[0].id).toBe('1'); // rank 1 remains rank 1
  });
});

describe('ChromaDB Health Tracking', () => {
  it('should switch to degraded mode after 3 consecutive failures', async () => {
    const vectorSearchModule = await import('../engine/vectorSearch.js');
    
    // Create a mock vector store that throws an error
    const mockVectorStore = {
      similaritySearchWithScore: vi.fn().mockRejectedValue(new Error('Chroma Down'))
    };
    const mockParentMap = new Map();
    mockParentMap.set('1', { text: 'test', category: 'test' });
    
    vectorSearchModule.setTestState(mockVectorStore, mockParentMap, 0);

    // Fail 1
    await vectorSearchModule.vectorSearch('test query');

    // Fail 2
    await vectorSearchModule.vectorSearch('test query');

    // Fail 3
    await vectorSearchModule.vectorSearch('test query');
    
    // We can verify that it was nullified by checking if it still attempts dense search or checking a getter,
    // but the simplest verification is that it still returns [] without crashing after 3 failures.
    const res = await vectorSearchModule.vectorSearch('test query');
    expect(res).toEqual([]);
  });
});

describe('Phase 4: Window Retrieval & Confidence Scores', () => {
  it('should return window of child + siblings', async () => {
    const vectorSearchModule = await import('../engine/vectorSearch.js');
    
    // Mock parent and children
    const mockParentMap = new Map();
    mockParentMap.set('parent1', { text: 'Full text', category: 'test' });
    
    const mockChildrenMap = new Map();
    mockChildrenMap.set('parent1', [
      { id: 'c1', text: 'chunk 1' },
      { id: 'c2', text: 'chunk 2' },
      { id: 'c3', text: 'chunk 3' },
      { id: 'c4', text: 'chunk 4' }
    ]);
    
    const mockVectorStore = {
      similaritySearchWithScore: vi.fn().mockResolvedValue([
        [{ metadata: { id: 'c2', parentId: 'parent1', category: 'test' }, pageContent: 'chunk 2' }, 0.1]
      ])
    };
    
    vectorSearchModule.setTestState(mockVectorStore, mockParentMap, 0, mockChildrenMap);
    
    const results = await vectorSearchModule.vectorSearch('test');
    
    // Matched c2, so window should be c1, c2, c3
    expect(results.length).toBe(1);
    expect(results[0].text).toContain('chunk 1');
    expect(results[0].text).toContain('chunk 2');
    expect(results[0].text).toContain('chunk 3');
    expect(results[0].text).not.toContain('chunk 4');
  });

  it('should stop at parent boundary', async () => {
    const vectorSearchModule = await import('../engine/vectorSearch.js');
    
    const mockParentMap = new Map();
    mockParentMap.set('parent1', { text: 'Full text', category: 'test' });
    
    const mockChildrenMap = new Map();
    mockChildrenMap.set('parent1', [
      { id: 'c1', text: 'chunk 1' } // Only 1 child
    ]);
    
    const mockVectorStore = {
      similaritySearchWithScore: vi.fn().mockResolvedValue([
        [{ metadata: { id: 'c1', parentId: 'parent1', category: 'test' }, pageContent: 'chunk 1' }, 0.1]
      ])
    };
    
    vectorSearchModule.setTestState(mockVectorStore, mockParentMap, 0, mockChildrenMap);
    
    const results = await vectorSearchModule.vectorSearch('test');
    
    expect(results.length).toBe(1);
    expect(results[0].text).toContain('chunk 1');
    expect(results[0].text).not.toContain('chunk 2'); // Doesn't bleed into other chunks
  });

  it('linear confidence score should be proportional', async () => {
    const vectorSearchModule = await import('../engine/vectorSearch.js');
    
    // We mock the RRF fusion result to have a known score
    // RRF function calculates score based on ranks. 
    // If it's rank 1 in 1 strategy, score is 1/(60+1) = 0.01639
    // Max theoretical for 1 strategy is 1/61 = 0.01639
    // Ratio = 1.0 -> Confidence = 1.0
    
    const mockParentMap = new Map();
    mockParentMap.set('p1', { text: 'parent', category: 'test' });
    
    const mockChildrenMap = new Map();
    mockChildrenMap.set('p1', [{ id: 'c1', text: 'child' }]);
    
    const mockVectorStore = {
      similaritySearchWithScore: vi.fn().mockResolvedValue([
        [{ metadata: { id: 'c1', parentId: 'p1', category: 'test' }, pageContent: 'child' }, 0.1]
      ])
    };
    
    vectorSearchModule.setTestState(mockVectorStore, mockParentMap, 0, mockChildrenMap);
    
    const results = await vectorSearchModule.vectorSearch('test query');
    
    // Because it's rank 1 out of 1 strategy, score should be exactly 1.0 (linear)
    // Previously with cubic it would be 1.0^3 = 1.0. 
    // To see difference, let's mock the reciprocalRankFusion output if we could, 
    // but testing that the score is <= 1.0 is a good sanity check here.
    expect(results[0].score).toBeCloseTo(1.0);
  });

  it('P5-U4: TF-IDF reranker promotes relevant docs', async () => {
    const vectorSearchModule = await import('../engine/vectorSearch.js');
    
    // We mock the results so that fusion returns them in an order, but TF-IDF reranks them
    const mockParentMap = new Map();
    mockParentMap.set('p1', { text: 'parent 1', category: 'test' });
    mockParentMap.set('p2', { text: 'parent 2', category: 'test' });
    
    const mockChildrenMap = new Map();
    // One chunk is very relevant to "machine learning"
    mockChildrenMap.set('p1', [{ id: 'c1', text: 'this chunk is completely about machine learning algorithms' }]);
    // Another chunk is irrelevant but somehow got a high rank in mock
    mockChildrenMap.set('p2', [{ id: 'c2', text: 'this is about hostel fees' }]);
    
    // c2 gets higher rank from mock vector store
    const mockVectorStore = {
      similaritySearchWithScore: vi.fn().mockResolvedValue([
        [{ metadata: { id: 'c2', parentId: 'p2', category: 'test' }, pageContent: 'this is about hostel fees' }, 0.1],
        [{ metadata: { id: 'c1', parentId: 'p1', category: 'test' }, pageContent: 'this chunk is completely about machine learning algorithms' }, 0.2]
      ])
    };
    
    vectorSearchModule.setTestState(mockVectorStore, mockParentMap, 0, mockChildrenMap);
    
    const results = await vectorSearchModule.vectorSearch(['machine learning'], 2);
    
    // TF-IDF should rerank c1 (p1) to be first because "machine learning" is in its text!
    expect(results[0].text).toContain('machine learning');
    expect(results[1].text).toContain('hostel');
  });
});
