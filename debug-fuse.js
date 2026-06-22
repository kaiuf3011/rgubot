import { initVectorStore, vectorSearch } from './backend-node/engine/vectorSearch.js';
import { loadKnowledgeBase } from './backend-node/engine/knowledgeLoader.js';

async function main() {
  const kb = loadKnowledgeBase();
  await initVectorStore(kb).catch(e => console.error("Chroma down"));
  console.log("Vector store initialized");
  
  const res = await vectorSearch(["What is the fee for B.Tech in Computer Science?"], 3);
  console.log("Results for 'What is the fee for B.Tech in Computer Science?':");
  console.log(res);

  const res2 = await vectorSearch(["fee"], 3);
  console.log("Results for 'fee':");
  console.log(res2);
}
main();
