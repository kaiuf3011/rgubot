import { loadKnowledgeBase } from './engine/knowledgeLoader.js';
import { initVectorStore, vectorSearch } from './engine/vectorSearch.js';
import { logger } from './src/utils/logger.js';

async function run() {
  const kb = loadKnowledgeBase();
  await initVectorStore(kb);
  const results = await vectorSearch(["list out the b.e courses and is hostel available ?"], 4);
  console.log(JSON.stringify(results, null, 2));
}

run().catch(console.error);
