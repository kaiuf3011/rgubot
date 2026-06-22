import { parentPort } from 'worker_threads';
import Fuse from 'fuse.js';

let fuseStore = null;

parentPort.on('message', (msg) => {
  if (msg.type === 'init') {
    fuseStore = new Fuse(msg.data, {
      keys: ["text", "category"],
      includeScore: true,
      threshold: 0.4,
      fieldNormWeight: 1,
      ignoreLocation: true,
      useExtendedSearch: true
    });
    parentPort.postMessage({ type: 'initialized' });
  } else if (msg.type === 'search') {
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did", "will", "would", "could",
      "should", "may", "might", "shall", "can", "to", "of", "in", "for",
      "on", "with", "at", "by", "from", "as", "into", "through", "during",
      "before", "after", "above", "below", "between", "out", "off", "over",
      "under", "again", "further", "then", "once", "here", "there", "when",
      "where", "why", "how", "all", "each", "every", "both", "few", "more",
      "most", "other", "some", "such", "no", "not", "only", "own", "same",
      "so", "than", "too", "very", "just", "because", "and", "but", "or",
      "if", "while", "about", "what", "which", "who", "this", "that", "these",
      "those", "it", "its", "i", "me", "my", "we", "our", "you", "your",
      "he", "him", "his", "she", "her", "they", "them", "their",
      "tell", "please", "want", "know", "give", "show", "explain", 
      "any", "list", "get", "find", "search", "gimme"
    ]);
    
    // Extract meaningful keywords from the raw string
    const queryWords = msg.query.toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    let searchTarget = msg.query;
    if (queryWords.length > 0) {
      // Build an Extended OR query: 'word1 | 'word2 | 'word3
      searchTarget = queryWords.map(w => "'" + w).join(' | ');
    }

    const sparseResultsRaw = fuseStore.search(searchTarget, { limit: msg.limit });
    // Keep top results, Fuse extended search scores are usually very low (good)
    const filteredSparse = sparseResultsRaw.filter(res => res.score === undefined || res.score <= 0.65);
    const sparseList = filteredSparse.map(res => ({
      id: res.item.id,
      parentId: res.item.parentId,
      text: res.item.text,
      category: res.item.category,
      source: res.item.source
    }));
    parentPort.postMessage({ type: 'result', id: msg.id, results: sparseList });
  }
});
