import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { OllamaEmbeddings } from "@langchain/ollama";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const EMBEDDING_MODEL = "nomic-embed-text";

// Synonym Mapping for Semantic Enrichment
const synonymMap = {
  "full ride": "100% full fee waiver, Gold Scholarship",
  "placement": "job, recruitment, salary, package, hiring",
  "hostel": "accommodation, dorm, room",
  "fees": "cost, tuition, payment"
};

function enrichWithSynonyms(text) {
  let enrichedText = text;
  for (const [key, value] of Object.entries(synonymMap)) {
    if (text.toLowerCase().includes(key)) {
      enrichedText += ` (Keywords: ${value})`;
    }
  }
  return enrichedText;
}

async function loadData() {
  const documents = [];

  const knowledgePath = path.join(DATA_DIR, 'knowledge.json');
  if (fs.existsSync(knowledgePath)) {
    console.log("Loading knowledge.json...");
    const data = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));
    for (const [category, content] of Object.entries(data)) {
      if (typeof content === 'object' && !Array.isArray(content)) {
        for (const [key, val] of Object.entries(content)) {
          let text = `Category: ${category}\nTopic: ${key}\nDetails: ${val}`;
          documents.push({ pageContent: enrichWithSynonyms(text), metadata: { source: "knowledge.json", category } });
        }
      } else if (Array.isArray(content)) {
        for (const item of content) {
          let text = `Category: ${category}\nDetails: ${item}`;
          documents.push({ pageContent: enrichWithSynonyms(text), metadata: { source: "knowledge.json", category } });
        }
      } else {
        let text = `Category: ${category}\nDetails: ${content}`;
        documents.push({ pageContent: enrichWithSynonyms(text), metadata: { source: "knowledge.json" } });
      }
    }
  }

  const intentsPath = path.join(DATA_DIR, 'raise_smart_intents.json');
  if (fs.existsSync(intentsPath)) {
    console.log("Skipping raise_smart_intents.json to prevent vector space pollution.");
  }

  return documents;
}

async function main() {
  const rawDocs = await loadData();
  console.log(`Loaded ${rawDocs.length} raw documents.`);

  if (rawDocs.length === 0) {
    console.log("No documents found. Make sure data files are in backend-node/data");
    return;
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });

  const chunks = await splitter.splitDocuments(rawDocs);
  console.log(`Split into ${chunks.length} chunks.`);

  const embeddings = new OllamaEmbeddings({
    model: EMBEDDING_MODEL,
  });

  console.log("Initializing local ChromaDB and storing vectors...");
  try {
    await Chroma.fromDocuments(chunks, embeddings, {
      collectionName: "raise_smart_knowledge",
      url: "http://localhost:8000", // Will try to connect or we can use local persistence. Wait, Chroma.js requires a running Chroma server or we can use ChromaDB via Docker. 
      // Actually, Chroma JS client needs a running server. Let's rely on standard chroma server or a different local vector store like MemoryVectorStore if chroma server is not available, but the architecture specified ChromaDB.
    });
    console.log("Vector store populated successfully!");
  } catch (error) {
    console.error("Error connecting to ChromaDB. Ensure it is running:", error.message);
  }
}

main().catch(console.error);
