import { initVectorStore, vectorSearch } from './backend-node/engine/vectorSearch.js';
import { loadKnowledgeBase } from './backend-node/engine/knowledgeLoader.js';

async function main() {
  const kb = loadKnowledgeBase();
  await initVectorStore(kb);
  const res = await vectorSearch("fee");
  console.log("Search Results:", res);
}
main().catch(console.error);
