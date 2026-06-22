/**
 * Knowledge Loader — Loads and indexes JSON knowledge base files
 * Implements Parent-Child chunking for Advanced RAG.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { encodingForModel } from "js-tiktoken";
import { logger } from "../src/utils/logger.js";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "data");

const enc = encodingForModel("gpt-3.5-turbo");
// Child chunks are smaller for precise semantic matching
const MAX_CHILD_TOKENS = 100;
const CHILD_OVERLAP_TOKENS = 20;

function enrichKeywords(keywords) {
  const enriched = [...keywords];
  const keywordSet = new Set(keywords);

  const synonyms = [
    { keys: ["be", "b.e", "b.e."], values: ["bachelor", "engineering"] },
    { keys: ["btech", "b.tech", "b.tech."], values: ["bachelor", "technology", "engineering"] },
    { keys: ["cse"], values: ["computer", "science", "engineering"] },
    { keys: ["ece"], values: ["electronics", "communication", "engineering"] },
    { keys: ["eee"], values: ["electrical", "electronics", "engineering"] },
    { keys: ["it"], values: ["information", "technology"] },
    { keys: ["aiml"], values: ["artificial", "intelligence", "machine", "learning"] },
    { keys: ["aids", "ai&ds"], values: ["artificial", "intelligence", "data", "science"] },
    { keys: ["mba"], values: ["master", "business", "administration"] },
    { keys: ["mca"], values: ["master", "computer", "applications"] },
    { keys: ["bca"], values: ["bachelor", "computer", "applications"] },
    { keys: ["bba"], values: ["bachelor", "business", "administration"] },
    { keys: ["bcom"], values: ["bachelor", "commerce"] }
  ];

  for (const syn of synonyms) {
    const hasKey = syn.keys.some(k => keywordSet.has(k));
    if (hasKey) {
      for (const val of syn.values) {
        if (!keywordSet.has(val)) {
          enriched.push(val);
          keywordSet.add(val);
        }
      }
    }
  }

  return enriched;
}

function extractKeywords(text) {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during",
    "before", "after", "above", "below", "between", "out", "off", "over",
    "under", "again", "further", "then", "once", "here", "there", "when",
    "where", "why", "how", "all", "each", "every", "both", "few", "more",
    "most", "other", "some", "such", "no", "not", "only", "own", "same",
    "so", "than", "too", "very", "just", "because", "and", "but", "or",
    "if", "while", "about", "what", "which", "who", "this", "that", "these",
    "those", "it", "its", "i", "me", "my", "we", "our", "you", "your",
    "he", "him", "his", "she", "her", "they", "them", "their",
  ]);

  const baseKeywords = text
    .toLowerCase()
    .replace(/[^a-z0-9₹%+&./-]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.has(w))
    .filter((v, i, a) => a.indexOf(v) === i);

  return enrichKeywords(baseKeywords);
}

// Generate semantic child chunks from a parent string
export function generateChildChunks(text, parentId, category, source) {
  const children = [];
  
  function addChunk(chunkText) {
    const cleanText = chunkText.trim();
    if (!cleanText) return;
    children.push({
      id: `child_${crypto.createHash('md5').update(category + cleanText).digest('hex')}`,
      parentId,
      text: cleanText,
      category,
      keywords: extractKeywords(`${category} ${cleanText}`),
      source
    });
  }

  const tokens = enc.encode(text);
  if (tokens.length <= MAX_CHILD_TOKENS) {
    addChunk(text);
    return children;
  }

  // 1. Split on double-newlines (paragraphs)
  const paragraphs = text.split(/\n\n+/);
  
  for (const para of paragraphs) {
    const paraTokens = enc.encode(para);
    if (paraTokens.length <= MAX_CHILD_TOKENS) {
      addChunk(para);
    } else {
      // 2. Split on single newlines
      const lines = para.split(/\n/);
      let currentChunk = "";
      let currentTokens = 0;
      
      for (const line of lines) {
        const lineTokens = enc.encode(line).length;
        if (currentTokens + lineTokens > MAX_CHILD_TOKENS && currentChunk.length > 0) {
          addChunk(currentChunk);
          currentChunk = line;
          currentTokens = lineTokens;
        } else {
          currentChunk += (currentChunk ? "\n" : "") + line;
          currentTokens += lineTokens;
        }
      }
      if (currentChunk) {
        addChunk(currentChunk);
      }
    }
  }
  
  return children;
}

function processParentNode(text, category, source, parentDocs, childChunks) {
  const parentId = `parent_${crypto.createHash('md5').update(category + text).digest('hex')}`;
  
  // Save the full parent context
  parentDocs.set(parentId, {
    id: parentId,
    text,
    category,
    source
  });
  
  // Generate and save child chunks for precision retrieval
  const children = generateChildChunks(text, parentId, category, source);
  childChunks.push(...children);
}

function serializeObject(obj, indent = "  ") {
  let lines = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === "" || v === null || v === undefined) continue;
    if (typeof v === "object") {
      if (Array.isArray(v)) {
        if (v.every(item => typeof item !== "object")) {
          lines.push(`${indent}${k}:\n${indent}- ` + v.join(`\n${indent}- `));
        } else {
          lines.push(`${indent}${k}:`);
          v.forEach((item, idx) => {
            if (typeof item === "object" && item !== null) {
              lines.push(`${indent}  - Item ${idx + 1}:`);
              lines.push(serializeObject(item, indent + "    "));
            } else {
              lines.push(`${indent}  - ${item}`);
            }
          });
        }
      } else {
        lines.push(`${indent}${k}:`);
        lines.push(serializeObject(v, indent + "  "));
      }
    } else {
      lines.push(`${indent}${k}: ${v}`);
    }
  }
  return lines.join("\n");
}

function flattenKnowledge(obj, prefix = "", source = "knowledge.json", parentDocs = new Map(), childChunks = []) {
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = prefix ? `${prefix} > ${key}` : key;

    // Skip empty values
    if (value === "" || value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) continue;

    // Check if this path should be grouped and serialized as a single parent node
    const shouldGroup = [
      "placement > highestPackage",
      "placement > averagePackage",
      "placement > medianPackage",
      "placement > placementRate",
      "scholarships > rgunat",
      "scholarships > merit",
      "scholarships > sports",
      "scholarships > specialCategory",
      "hostel > roomTypes",
      "hostel > facilities"
    ].some(p => currentPath.endsWith(p));

    if (shouldGroup && typeof value === "object") {
      const enrichedText = `Rathinam RGU R-Smart ${currentPath}:\n${serializeObject(value)}`;
      processParentNode(enrichedText, currentPath, source, parentDocs, childChunks);
      continue;
    }

    if (typeof value === "string") {
      // Prepend the category path to leaf values so that numeric/currency facts
      // (e.g. highestPackage, fees) carry their full context into the vector
      // index and are retrievable for natural-language queries about them.
      const enrichedText = `Rathinam RGU R-Smart ${currentPath}: ${value}`;
      processParentNode(enrichedText, currentPath, source, parentDocs, childChunks);
    } else if (Array.isArray(value)) {
      if (value.every(v => typeof v === "string")) {
        // Treat array of strings as a single parent block for better context
        const enrichedText = `Rathinam RGU R-Smart ${currentPath}:\n- ` + value.join("\n- ");
        processParentNode(enrichedText, currentPath, source, parentDocs, childChunks);
      } else {
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          if (typeof item === "object" && item !== null) {
            // Flatten object into a single parent block
            const text = Object.entries(item)
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n");
            const enrichedText = `Rathinam RGU R-Smart ${currentPath} [${i}]:\n${text}`;
            processParentNode(enrichedText, currentPath, source, parentDocs, childChunks);
          }
        }
      }
    } else if (typeof value === "object" && value !== null) {
      flattenKnowledge(value, currentPath, source, parentDocs, childChunks);
    }
  }

  return { parentDocs, childChunks };
}

function parseIntents(data) {
  const intents = data.intents || [];
  return intents.map(intent => ({
    tag: intent.tag,
    patterns: intent.patterns || [],
    responses: intent.responses || [],
    keywords: extractKeywords(
      [...(intent.patterns || []), intent.tag.replace(/_/g, " ")].join(" ")
    ),
  }));
}

export function loadKnowledgeBase() {
  logger.info("Loading knowledge base (Parent-Child Strategy)...");

  let parentDocs = new Map();
  let childChunks = [];
  let intents = [];

  const knowledgePath = path.join(DATA_DIR, "knowledge.json");
  if (fs.existsSync(knowledgePath)) {
    const data = JSON.parse(fs.readFileSync(knowledgePath, "utf8"));
    const result = flattenKnowledge(data, "", "knowledge.json", parentDocs, childChunks);
    parentDocs = result.parentDocs;
    childChunks = result.childChunks;
    logger.info({ parents: parentDocs.size, children: childChunks.length }, "knowledge.json loaded");
  } else {
    logger.warn("knowledge.json not found");
  }

  const intentsPath = path.join(DATA_DIR, "rgu_intents.json");
  if (fs.existsSync(intentsPath)) {
    const data = JSON.parse(fs.readFileSync(intentsPath, "utf8"));
    intents = parseIntents(data);

    // We purposefully DO NOT index intents into the Vector Space anymore.
    // They are returned to be used in-memory by the IntentRouter.
    logger.info({ intents: intents.length }, "rgu_intents.json loaded");
  } else {
    logger.warn("rgu_intents.json not found");
  }

  logger.info({ parents: parentDocs.size, children: childChunks.length, intents: intents.length }, "Total knowledge loaded");

  return { parentDocs, childChunks, intents };
}

export function watchKnowledgeBase(onChangeCallback) {
  let debounceTimeout;
  if (!fs.existsSync(DATA_DIR)) return;
  
  fs.watch(DATA_DIR, (eventType, filename) => {
    if (filename === "knowledge.json" || filename === "rgu_intents.json") {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        logger.info({ filename }, "Data file changed. Hot-reloading...");
        onChangeCallback();
      }, 2000);
    }
  });
}
