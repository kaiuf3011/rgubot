import { initVectorStore, vectorSearch } from './engine/vectorSearch.js';
import { executeSparseSearch } from './engine/search/sparseSearchManager.js';
import { applyTfIdfReranking } from './engine/search/ranker.js';
import { loadKnowledgeBase } from './engine/knowledgeLoader.js';

async function run() {
  const kb = loadKnowledgeBase();
  await initVectorStore(kb);
  await new Promise(r => setTimeout(r, 1000));
  
  const query = "EVERY bachelor of engineering COURSES ?";
  const sparseList = await executeSparseSearch(query, 100);
  console.log("Sparse returned:", sparseList.length);
  
  console.log("Docs containing B.E.:", sparseList.filter(s => s.text.includes("B.E.")).length);
  
  const reranked = applyTfIdfReranking(sparseList, [query]);
  console.log("Top 5:");
  reranked.slice(0, 5).forEach(r => console.log(r.text.substring(0, 80).replace(/\n/g, ' ')));
  
  process.exit(0);
}
run();
