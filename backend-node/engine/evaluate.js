import { generateRAGResponse, rewriteQuery } from './llmService.js';
import { vectorSearch, initVectorStore } from './vectorSearch.js';
import { loadKnowledgeBase } from './knowledgeLoader.js';
import { logger } from '../src/utils/logger.js';
import { encodingForModel } from "js-tiktoken";

const enc = encodingForModel("gpt-3.5-turbo");
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

// Test dataset representing real user intents
const EVALUATION_DATASET = [
  {
    query: "What is the fee for B.Tech in Computer Science?",
    expectedConcept: "B.Tech fees"
  },
  {
    query: "Do you offer hostel facilities for outstation students?",
    expectedConcept: "hostel facilities"
  },
  {
    query: "Who is the placement director and how can I contact them?",
    expectedConcept: "placement director contact"
  },
  {
    query: "Tell me about the campus size and infrastructure.",
    expectedConcept: "campus infrastructure"
  },
  {
    query: "Is there any MBA program available?",
    expectedConcept: "MBA program"
  }
];

async function evaluateLLMAsJudge(query, context, generatedAnswer) {
  const prompt = `You are an impartial judge evaluating a Retrieval-Augmented Generation (RAG) system.
Given the User Query, the Retrieved Context, and the Generated Answer, score the answer from 1 to 10 on two metrics:

1. Context Precision: Did the retrieved context contain the information needed to answer the query? (1 = no, 10 = perfectly)
2. Faithfulness: Is the generated answer factually derived strictly from the retrieved context without hallucinations? (1 = hallucinated/wrong, 10 = perfectly faithful)

User Query: ${query}
Retrieved Context: ${context}
Generated Answer: ${generatedAnswer}

Return your evaluation as a strict JSON object:
{
  "contextPrecision": 8,
  "faithfulness": 9,
  "reasoning": "Brief explanation"
}`;

  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        prompt: prompt,
        stream: false,
        format: "json"
      })
    });
    
    if (!res.ok) throw new Error("Evaluation request failed");
    
    const data = await res.json();
    return JSON.parse(data.response.trim());
  } catch (error) {
    logger.error("Failed to evaluate using LLM-as-a-Judge");
    return { contextPrecision: 0, faithfulness: 0, reasoning: "Evaluation failed" };
  }
}

async function runEvaluation() {
  console.log("Starting RAG Evaluation Pipeline...");
  
  // 1. Initialize System
  const kb = loadKnowledgeBase();
  await initVectorStore(kb).catch(e => console.error("Vector store degraded mode (Fuse only).", e.message));

  let totalPrecision = 0;
  let totalFaithfulness = 0;
  
  console.log("\n=============================================");
  
  // 2. Run Dataset
  for (let i = 0; i < EVALUATION_DATASET.length; i++) {
    const data = EVALUATION_DATASET[i];
    console.log(`\nEvaluating Query [${i + 1}/${EVALUATION_DATASET.length}]: "${data.query}"`);
    
    // RAG Pipeline
    const queries = await rewriteQuery(data.query, "", "");
    const results = await vectorSearch(queries, 3);
    
    const contextStr = results.map(r => r.text).join(" ");
    const response = await generateRAGResponse(data.query, results, "");
    
    console.log(`- Rewritten Queries:`, queries);
    console.log(`- Retrieved Context length: ${enc.encode(contextStr).length} tokens`);
    console.log(`- Generated Answer: ${response.answer}`);
    
    // LLM-as-a-Judge
    const scores = await evaluateLLMAsJudge(data.query, contextStr, response.answer);
    console.log(`- Scores: Precision=${scores.contextPrecision}/10 | Faithfulness=${scores.faithfulness}/10`);
    console.log(`- Judge Reasoning: ${scores.reasoning}`);
    
    totalPrecision += scores.contextPrecision;
    totalFaithfulness += scores.faithfulness;
  }
  
  // 3. Final Report
  const avgPrecision = totalPrecision / EVALUATION_DATASET.length;
  const avgFaithfulness = totalFaithfulness / EVALUATION_DATASET.length;
  
  console.log("\n=============================================");
  console.log("FINAL EVALUATION SCORES");
  console.log(`Average Context Precision: ${avgPrecision}/10`);
  console.log(`Average Faithfulness:      ${avgFaithfulness}/10`);
  
  if (avgPrecision > 8 && avgFaithfulness > 8) {
    console.log("STATUS: SUCCESS (Scores > 8. System is highly accurate and faithful.)");
  } else {
    console.log("STATUS: FAILURE (Scores <= 8. System requires tuning.)");
  }
  console.log("=============================================\n");
}

runEvaluation();
