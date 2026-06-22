import { initVectorStore, vectorSearch } from './engine/vectorSearch.js';
import { loadKnowledgeBase } from './engine/knowledgeLoader.js';
import { detectIntent } from './engine/intentDetector.js';
import { rewriteQuery } from './engine/llmService.js';

const SYNONYM_MAP = {
  "rgu": ["rathinam", "r-smart", "college", "university"],
  "be": ["bachelor of engineering", "engineering"],
  "btech": ["bachelor of technology", "engineering"],
  "cse": ["computer science"],
  "ece": ["electronics"],
  "eee": ["electrical"],
  "it": ["information technology"],
  "mba": ["master of business administration", "management"],
  "mca": ["master of computer applications"],
  "hod": ["head of department"],
  "placement": ["job", "career", "placed", "salary", "package"],
  "scholarship": ["fees waiver", "discount", "financial aid", "rstnat", "rgunat"]
};

async function trace() {
  const query = "What courses does RGU offer?";
  console.log("=== STEP 1: USER QUERY ===");
  console.log("Query:", query);

  console.log("\n=== STEP 2: INTENT DETECTION ===");
  const kb = loadKnowledgeBase();
  const intentResult = detectIntent(query, kb.intents, SYNONYM_MAP);
  console.log("Intent Result:", JSON.stringify(intentResult, null, 2));

  console.log("\n=== STEP 3: QUERY REWRITING ===");
  // Note: we'll simulate rewriteQuery since Gemini might be offline/rate-limited.
  // We'll try to run the actual rewriteQuery first.
  let rewritten = [query];
  try {
    rewritten = await rewriteQuery(query, "", "");
    console.log("Rewriter Output:", rewritten);
  } catch (e) {
    console.log("Rewriter Failed (using fallback):", e.message);
  }

  console.log("\n=== STEP 4: RETRIEVAL TRACE ===");
  await initVectorStore(kb);
  
  // We perform search with limit = 20 to get the Top 20 retrieved documents
  const results = await vectorSearch(rewritten, 20);
  console.log(`Retrieved ${results.length} documents.`);
  results.forEach((doc, index) => {
    console.log(`\nRank #${index + 1}`);
    console.log(`Category: ${doc.category}`);
    console.log(`Score: ${doc.score}`);
    console.log(`Source: ${doc.source}`);
    console.log(`Document preview (first 250 chars):\n${doc.text.slice(0, 250)}...`);
  });
}

trace().catch(console.error);
