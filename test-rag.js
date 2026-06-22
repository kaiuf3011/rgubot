import { generateRAGResponse } from './backend-node/engine/llmService.js';
import { LLMProvider } from './backend-node/llm-providers/index.js';

async function test() {
  try {
    console.log("Testing generateRAGResponse...");
    const res = await generateRAGResponse("what are the B.E courses available in this college ?", [], "");
    console.log("\n\nDone:", res);
  } catch (err) {
    console.error("\n\nError caught:", err.message);
  }
}

test();
