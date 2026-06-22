import natural from "natural";

/**
 * Ranker Module
 * Handles algorithmic ranking of retrieved documents including
 * Reciprocal Rank Fusion (RRF), Category Boosting, and TF-IDF.
 */

/**
 * Reciprocal Rank Fusion (RRF)
 * Combines ranked lists from multiple retrieval strategies.
 * @param {Array<Array<Object>>} rankedLists - Array of retrieved chunk lists
 * @param {Array<string>} queries - The queries used for retrieval (for category boosting)
 * @param {number} k - The RRF constant (default: 60)
 * @returns {Array<Object>} - Fused and sorted list of chunks
 */
export function reciprocalRankFusion(rankedLists, queries = [], k = 60) {
  const scores = new Map();

  for (const list of rankedLists) {
    list.forEach((item, index) => {
      const id = item.id;
      const rank = index + 1;
      let rrfScore = 1.0 / (k + rank);
      
      // Category Boosting: Boost RRF score by 1.25x if a query token matches the document's category
      let categoryBoost = false;
      if (item.category && queries.length > 0) {
        const catLower = item.category.toLowerCase();
        for (const q of queries) {
          const tokens = q.toLowerCase().split(/\s+/).filter(t => t.length > 3);
          if (tokens.some(t => catLower.includes(t))) {
            categoryBoost = true;
            break;
          }
        }
      }

      if (categoryBoost) {
        rrfScore *= 1.25;
      }
      
      if (!scores.has(id)) {
        scores.set(id, { item, rrfScore: 0 });
      }
      scores.get(id).rrfScore += rrfScore;
    });
  }

  // Sort by RRF score descending
  return Array.from(scores.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .map(entry => {
      entry.item.rrfScore = entry.rrfScore;
      return entry.item;
    });
}

/**
 * Lightweight TF-IDF Reranker for the top candidates
 * @param {Array<Object>} candidates - The top candidates from RRF
 * @param {Array<string>} queryArray - The atomic queries
 * @returns {Array<Object>} - The reranked candidates
 */
export function applyTfIdfReranking(candidates, queryArray) {
  if (candidates.length === 0) return candidates;

  const TfIdf = natural.TfIdf;
  const tfidf = new TfIdf();
  
  // We rerank the top 100 to ensure we capture documents buried by sparse OR fuzzy logic
  const rerankSlice = candidates.slice(0, 100);
  rerankSlice.forEach(child => tfidf.addDocument(child.text || ""));
  
  const reranked = [];
  const combinedQuery = queryArray.join(" ");
  tfidf.tfidfs(combinedQuery, function(i, measure) {
    reranked.push({ child: rerankSlice[i], measure });
  });
  
  reranked.sort((a, b) => b.measure - a.measure);
  
  return [
    ...reranked.map(r => r.child),
    ...candidates.slice(100)
  ];
}
