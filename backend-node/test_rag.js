import { vectorSearch } from './engine/vectorSearch.js';
import { loadKnowledgeBase } from './engine/knowledgeLoader.js';
import { initVectorStore } from './engine/vectorSearch.js';

async function run() {
  const kb = loadKnowledgeBase();
  await initVectorStore(kb);
  const res = await vectorSearch('what are the b.e courses available in Rsmart ?');
  console.log(JSON.stringify(res, null, 2));
}
run();
