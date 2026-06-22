import { Chroma } from "@langchain/community/vectorstores/chroma";
import { OllamaEmbeddings } from "@langchain/ollama";
import { Document } from "@langchain/core/documents";
import { logger } from '../../src/utils/logger.js';

let vectorStore = null;
let consecutiveChromaFailures = 0;
let chromaHealthInterval = null;

/**
 * Health loop to recover ChromaDB if it goes down.
 * @param {Object} knowledgeBase - The global knowledge base to re-index upon recovery.
 */
export function startChromaHealthLoop(knowledgeBase) {
  if (chromaHealthInterval) return;
  chromaHealthInterval = setInterval(async () => {
    if (vectorStore) {
      clearInterval(chromaHealthInterval);
      chromaHealthInterval = null;
      return;
    }
    try {
      const chromaUrl = process.env.CHROMA_URL || "http://localhost:8000";
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
      await fetch(chromaUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      logger.info("ChromaDB is back online! Reinitializing vector store...");
      if (knowledgeBase) {
        await initDenseStore(knowledgeBase.childChunks);
      }
      clearInterval(chromaHealthInterval);
      chromaHealthInterval = null;
    } catch (e) {
      // Still down
    }
  }, 30000);
}

/**
 * Initializes the ChromaDB Dense Vector Store
 * @param {Array} childChunks - The chunks to index
 * @param {Object} knowledgeBase - Reference to the knowledge base for recovery
 */
export async function initDenseStore(childChunks, knowledgeBase) {
  const embeddings = new OllamaEmbeddings({ 
    model: "nomic-embed-text", 
    baseUrl: process.env.OLLAMA_URL || "http://localhost:11434" 
  });
  
  let chromaAvailable = false;
  const chromaUrl = process.env.CHROMA_URL || "http://localhost:8000";
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    await fetch(chromaUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    chromaAvailable = true;
  } catch (e) {
    logger.warn("ChromaDB is down or unreachable. Skipping dense vector store initialization.");
  }

  if (chromaAvailable) {
    const collectionName = process.env.NODE_ENV === 'test' 
      ? `rgu_test_${Date.now()}` 
      : 'rgu_v2';

    vectorStore = new Chroma(embeddings, {
      collectionName: collectionName,
      url: chromaUrl
    });

    // Prepare documents for LangChain Chroma
    const docs = childChunks.map(chunk => new Document({
      pageContent: chunk.text,
      metadata: { 
        id: chunk.id,
        parentId: chunk.parentId,
        category: chunk.category, 
        source: chunk.source 
      }
    }));

    if (docs.length > 0) {
      logger.info({ count: docs.length, collection: collectionName }, "Indexing child chunks into ChromaDB...");
      try {
        await vectorStore.addDocuments(docs);
      } catch (chromaErr) {
        logger.warn({ err: chromaErr }, "ChromaDB ingestion failed. Running in Degraded Mode (Fuse.js Sparse Search only).");
        vectorStore = null; 
        startChromaHealthLoop(knowledgeBase);
      }
    }
  } else {
    vectorStore = null;
    startChromaHealthLoop(knowledgeBase);
  }
}

/**
 * Executes a dense similarity search against ChromaDB.
 * @param {string} query - The search query
 * @param {number} limit - The max results to return
 * @param {Object} knowledgeBase - For passing to health loop if it fails
 * @returns {Promise<Array>} - Retrieve chunks
 */
export async function executeDenseSearch(query, limit = 4, knowledgeBase) {
  if (!vectorStore) return [];

  try {
    const denseResultsRaw = await vectorStore.similaritySearchWithScore(query, limit);
    // Filter out very weak dense matches (distance >= 1.5 is a safe noise cutoff)
    const filteredDense = denseResultsRaw.filter(([_, score]) => score === undefined || score < 1.5);
    const denseList = filteredDense.map(([doc, _score]) => ({
      id: doc.metadata.id,
      parentId: doc.metadata.parentId,
      text: doc.pageContent,
      category: doc.metadata.category,
      source: doc.metadata.source
    }));
    consecutiveChromaFailures = 0; // Reset on success
    return denseList;
  } catch (e) {
    consecutiveChromaFailures++;
    logger.warn({ failures: consecutiveChromaFailures, err: e.message || e }, "Dense search failed");
    if (consecutiveChromaFailures >= 3) {
      logger.error("ChromaDB failed 3 times consecutively. Switching to degraded mode.");
      vectorStore = null;
      startChromaHealthLoop(knowledgeBase);
    }
    return [];
  }
}

/**
 * Used exclusively for tests to mock the state
 */
export function setDenseTestState(vs, failures = 0) {
  vectorStore = vs;
  consecutiveChromaFailures = failures;
}

export function isDenseReady() {
  return vectorStore !== null;
}
