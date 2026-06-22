import { Chroma } from "@langchain/community/vectorstores/chroma";
import { OllamaEmbeddings } from "@langchain/ollama";

async function test() {
  const embeddings = new OllamaEmbeddings({ model: "nomic-embed-text", baseUrl: "http://localhost:11434" });
  const vectorStore = new Chroma(embeddings, { collectionName: "raise_smart_v2", url: "http://localhost:8000" });
  const results = await vectorStore.similaritySearch("Bachelor of Engineering courses", 4);
  results.forEach((r, i) => console.log(`Result ${i}:`, r.pageContent));
}
test().catch(console.error);
