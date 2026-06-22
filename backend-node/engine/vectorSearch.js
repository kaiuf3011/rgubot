import { logger } from '../src/utils/logger.js';
import { initDenseStore, executeDenseSearch, setDenseTestState, isDenseReady } from './search/vectorStoreManager.js';
import { initSparseWorkers, executeSparseSearch, terminateSparseWorkers, isSparseReady } from './search/sparseSearchManager.js';
import { reciprocalRankFusion, applyTfIdfReranking } from './search/ranker.js';

export let parentDocsMap = null;
export let childChunksMap = new Map();

/**
 * Used strictly for tests to override the internal states.
 */
export function setTestState(vs, pdm, failures = 0, ccm = new Map()) {
  setDenseTestState(vs, failures);
  parentDocsMap = pdm;
  childChunksMap = ccm;
}

/**
 * Initializes both the Dense (ChromaDB) and Sparse (Fuse.js Worker Pool) vector stores.
 * Ingests the child chunks and keeps a reference to the parent docs for retrieval.
 */
export async function initVectorStore(knowledgeBase) {
  try {
    const { childChunks, parentDocs } = knowledgeBase;
    parentDocsMap = parentDocs;
    
    childChunksMap = new Map();
    for (const chunk of childChunks) {
      if (!childChunksMap.has(chunk.parentId)) {
        childChunksMap.set(chunk.parentId, []);
      }
      childChunksMap.get(chunk.parentId).push(chunk);
    }

    // Initialize Dense
    await initDenseStore(childChunks, knowledgeBase);

    // Initialize Sparse (Fuse.js for BM25-like exact match via Worker Pool)
    const enrichedChunks = childChunks.map(chunk => ({
      ...chunk,
      searchContent: `${chunk.category} ${(chunk.keywords || []).join(" ")} ${chunk.text}`
    }));

    initSparseWorkers(enrichedChunks);

    logger.info("Advanced Hybrid Vector Store Initialized (Refactored)");
  } catch (error) {
    logger.error({ err: error }, "Failed to initialize Hybrid Vector Store");
    throw error;
  }
}

/**
 * Helper to identify if a query is a broad institutional overview query
 */
function isBroadInstitutionalQuery(query) {
  if (!query) return false;
  const clean = query.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 0 && !new Set([
      "tell", "me", "about", "what", "is", "the", "a", "an", "can", "you",
      "please", "could", "would", "i", "want", "know", "give", "show", "explain",
      "rgu", "r-smart", "rathinam", "university", "overview"
    ]).has(w));
  return clean.length === 0;
}

/**
 * Preprocess queries: replace institutional synonyms and normalize abbreviations for robust fallback retrieval
 */
function preprocessQueries(queryArray) {
  let processedQueries = queryArray.map(q => {
    let pq = q.toLowerCase();
    pq = pq.replace(/\bb\.e\.?\b/g, "be");
    pq = pq.replace(/\bb\.tech\.?\b/g, "btech");
    pq = pq.replace(/\bcolleg\b/g, "college");
    pq = pq.replace(/\brgu\b/g, "rathinam");
    pq = pq.replace(/\br-smart\b/g, "rathinam");
    return pq;
  });

  const hasBroad = queryArray.some(q => isBroadInstitutionalQuery(q));
  if (hasBroad) {
    processedQueries = [...processedQueries, "history established overview", "contact overview campus"];
  }

  return processedQueries;
}

/**
 * Executes a hybrid search across both Dense and Sparse stores for an array of atomic queries,
 * then maps the winning child chunks to their full parent contexts.
 */
export async function vectorSearch(queries, limit = 4) {
  if (!parentDocsMap) return [];
  if (!isDenseReady() && !isSparseReady()) return [];
  
  // Ensure queries is an array
  let queryArray = Array.isArray(queries) ? queries : [queries];
  const processedQueries = preprocessQueries(queryArray);
  const allRankedLists = [];

  try {
    for (const query of processedQueries) {
      if (!query || query.trim() === "") continue;

      // 1. Dense Search (Chroma)
      const denseList = await executeDenseSearch(query, limit, global.knowledgeBase);
      if (denseList && denseList.length > 0) {
        allRankedLists.push(denseList);
      }

      // 2. Sparse Search (Fuse Worker Pool) - Pull a deep pool for TF-IDF reranking
      const sparseList = await executeSparseSearch(query, 100);
      if (sparseList && sparseList.length > 0) {
        allRankedLists.push(sparseList);
      }
    }

    // 3. Reciprocal Rank Fusion
    let fusedChildren = reciprocalRankFusion(allRankedLists, processedQueries);

    // 4. Lightweight TF-IDF Reranker (Top 20 candidates)
    fusedChildren = applyTfIdfReranking(fusedChildren, queryArray);

    // 5. Resolve Window Contexts (deduplicated)
    const resolvedParents = [];
    const seenParentIds = new Set();

    for (const child of fusedChildren) {
      if (resolvedParents.length >= limit) break;
      
      if (!seenParentIds.has(child.parentId)) {
        const parentDoc = parentDocsMap.get(child.parentId);
        if (parentDoc) {
          seenParentIds.add(child.parentId);
          
          let windowText = parentDoc.text;
          const siblings = childChunksMap.get(child.parentId) || [];
          const childIndex = siblings.findIndex(c => c.id === child.id);
          
          if (childIndex !== -1) {
            const startIdx = Math.max(0, childIndex - 1);
            const endIdx = Math.min(siblings.length - 1, childIndex + 1);
            const windowChunks = siblings.slice(startIdx, endIdx + 1);
            windowText = `Rathinam RGU R-Smart ${parentDoc.category}:\n` + windowChunks.map(c => c.text).join('\n');
          }

          // Dynamically compute the maximum theoretical RRF score
          const numStrategies = (isDenseReady() ? 1 : 0) + (isSparseReady() ? 1 : 0);
          const maxTheoreticalScore = numStrategies > 0 ? (numStrategies / 61) : 0.0327;
          const ratio = child.rrfScore / maxTheoreticalScore;
          
          const confidenceScore = Math.min(1.0, ratio);

          resolvedParents.push({
            text: windowText,
            category: parentDoc.category,
            source: parentDoc.source,
            score: confidenceScore
          });
        }
      }
    }

    logger.info({ docs: resolvedParents.map(d => d.text) }, "Retrieved RAG Documents");
    return resolvedParents;
  } catch (error) {
    logger.error({ err: error, queries: queryArray }, "Hybrid Vector search failed");
    return [];
  }
}

// Ensure the graceful shutdown works with the worker pool
export const fuseWorker = {
  terminate: terminateSparseWorkers
};
