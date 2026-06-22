import { vectorSearch, initVectorStore } from './engine/vectorSearch.js';
import { loadKnowledgeBase } from './engine/knowledgeLoader.js';
import { rewriteQuery } from './engine/llmService.js';

async function test() {
  const kb = loadKnowledgeBase('./data');
  await initVectorStore(kb);
  
  const query = "list out the b.e courses !";
  const rewritten = await rewriteQuery(query, "", "");
  console.log("Rewritten query:", rewritten);

  for (const q of rewritten) {
    const docs = await vectorSearch(q);
    console.log("Vector Search Results for", q, ":\n", docs);
  }
}
test().catch(console.error);
