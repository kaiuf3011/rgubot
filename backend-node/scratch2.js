import * as vectorSearchModule from './engine/vectorSearch.js';
const mockParentMap = new Map([['p1', { text: 'parent', category: 'test' }]]);
const mockChildrenMap = new Map([['p1', [{ id: 'c1', text: 'child' }]]]);
const mockVectorStore = {
  similaritySearchWithScore: async () => [[{ metadata: { id: 'c1', parentId: 'p1', category: 'test' }, pageContent: 'child' }, 0.1]]
};
vectorSearchModule.setTestState(mockVectorStore, mockParentMap, 0, mockChildrenMap);
vectorSearchModule.vectorSearch(['test query']).then(r => console.log(r));
