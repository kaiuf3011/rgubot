import { vectorSearch } from './engine/vectorSearch.js';
import { rewriteQuery } from './engine/llmService.js';

async function test() {
  const query = "list out the b.e courses !";
  
  // See how it gets rewritten
  const rewritten = await rewriteQuery(query, "", "");
  console.log("Rewritten:", rewritten);

  for (const q of rewritten) {
    const docs = await vectorSearch(q);
    console.log("Search for:", q);
    console.log("Results length:", docs.length);
    console.log(JSON.stringify(docs, null, 2));
  }
}
test().catch(console.error);
