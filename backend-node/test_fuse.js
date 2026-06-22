import Fuse from 'fuse.js';
import { loadKnowledgeBase } from './engine/knowledgeLoader.js';

const { childChunks } = loadKnowledgeBase();
console.log('Child chunks:', childChunks.length);

const fuseStore = new Fuse(childChunks, {
  keys: ['text', 'category'],
  includeScore: true,
  threshold: 0.4,
  fieldNormWeight: 1,
  ignoreLocation: true,
  useExtendedSearch: true
});

const msg = { query: 'gimme about the courses available in rgu ?', limit: 4 };
const stopWords = new Set(["tell", "me", "about", "what", "can", "you", "please", "could", "would", "want", "know", "give", "show", "explain", "are", "for", "does", "was", "were", "with", "from", "into", "through", "during", "before", "after", "again", "then", "once", "here", "there", "when", "where", "why", "how", "all", "each", "every", "both", "few", "more", "most", "other", "some", "such", "only", "same", "than", "very", "just", "because", "while", "which", "who", "this", "that", "these", "those", "our", "your", "they", "them", "their", "any", "get", "find", "search", "gimme"]);

const queryWords = msg.query.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
let searchTarget = msg.query;
if (queryWords.length > 0) {
  searchTarget = queryWords.map(w => "'" + w).join(' | ');
}

console.log('Search Target:', searchTarget);
const results = fuseStore.search(searchTarget, { limit: 4 });
console.log('Results:', results.map(r => ({ score: r.score, text: r.item.text.substring(0, 50) })));
