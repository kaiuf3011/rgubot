import * as vectorSearchModule from './engine/vectorSearch.js';
import { vi } from 'vitest';

async function run() {
  const mockParentMap = new Map();
  mockParentMap.set('parent1', { text: 'Full text', category: 'test' });
  
  const mockChildrenMap = new Map();
  mockChildrenMap.set('parent1', [
    { id: 'c1', text: 'chunk 1' },
    { id: 'c2', text: 'chunk 2' }
  ]);
  
  const mockVectorStore = {
    similaritySearchWithScore: async () => [
      [{ metadata: { id: 'c2', parentId: 'parent1', category: 'test' }, pageContent: 'chunk 2' }, 0.1]
    ]
  };
  
  vectorSearchModule.setTestState(mockVectorStore, mockParentMap, 0, mockChildrenMap);
  const results = await vectorSearchModule.vectorSearch(['test']);
  console.log("RESULTS:", results);
}

run().catch(console.error);
