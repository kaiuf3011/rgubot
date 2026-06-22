/**
 * Intent Detector — Pattern-based intent matching with confidence scoring
 * First pass in the RAG pipeline: fast exact/near-exact intent classification
 */

import { logger } from "../src/utils/logger.js";

const STOP_WORDS = new Set([
  "tell", "me", "about", "what", "is", "the", "a", "an", "can", "you",
  "please", "could", "would", "i", "want", "know", "give", "show", "explain",
  "are", "for", "does", "do", "did", "was", "were", "to", "in", "of", "on",
  "with", "at", "by", "from", "as", "into", "through", "during", "before",
  "after", "above", "below", "between", "out", "off", "over", "under", "again",
  "further", "then", "once", "here", "there", "when", "where", "why", "how",
  "all", "each", "every", "both", "few", "more", "most", "other", "some",
  "such", "no", "not", "only", "own", "same", "so", "than", "too", "very",
  "just", "because", "and", "but", "or", "if", "while", "which", "who", "this",
  "that", "these", "those", "its", "we", "our", "your", "he", "him",
  "his", "she", "her", "they", "them", "their", "any", "list", "get", "find",
  "search", "available", "availability"
]);

function cleanAcronyms(text) {
  if (!text) return "";
  let cleaned = text.toLowerCase();
  cleaned = cleaned.replace(/\b([a-z])\.([a-z])\b/gi, "$1$2");
  cleaned = cleaned.replace(/\b([a-z])\.([a-z])\b/gi, "$1$2");
  return cleaned;
}

function getMeaningfulKeywords(text) {
  if (!text) return [];
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

function getKeywordOverlap(queryKeywords, patternKeywords) {
  const overlap = [];
  for (const qk of queryKeywords) {
    for (const pk of patternKeywords) {
      if (qk === pk) {
        overlap.push(qk);
        break;
      } else if (qk.length >= 4 && pk.length >= 4 && (qk.includes(pk) || pk.includes(qk))) {
        overlap.push(`${qk}<->${pk}`);
        break;
      }
    }
  }
  return Array.from(new Set(overlap));
}

function isInstitutionalQuery(query) {
  if (!query) return false;
  const lowerQuery = query.toLowerCase();
  const instTerms = ["rgu", "r-smart", "rathinam", "university overview", "about university"];
  return instTerms.some(term => {
    const escaped = term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, "i");
    return regex.test(lowerQuery);
  });
}

function queryContains(query, term) {
  const lowerTerm = term.toLowerCase();
  const escaped = lowerTerm.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, "i");
  if (regex.test(query)) return true;

  if (lowerTerm.length >= 4) {
    const words = query.toLowerCase().split(/\s+/);
    for (const word of words) {
      const cleaned = word.replace(/[^a-z0-9]/g, "");
      if (cleaned.includes(lowerTerm) || (cleaned.length >= 4 && lowerTerm.includes(cleaned))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Expand query with synonyms
 */
function expandWithSynonyms(query, synonymMap) {
  let expanded = query.toLowerCase();
  const added = [];

  for (const [key, synonyms] of Object.entries(synonymMap)) {
    if (queryContains(query, key)) {
      added.push(...synonyms);
    }
    for (const syn of synonyms) {
      if (queryContains(query, syn)) {
        added.push(key);
        break;
      }
    }
  }

  if (added.length > 0) {
    expanded += " " + added.join(" ");
  }
  return expanded;
}

// High-value domain keywords that should boost match confidence
const DOMAIN_KEYWORDS = new Set([
  "placement", "placements", "placed", "salary", "package", "packages",
  "scholarship", "scholarships", "rstnat", "hostel", "accommodation",
  "admission", "admissions", "course", "courses", "program", "programmes",
  "fees", "fee", "mba", "btech", "bca", "bba", "bsc", "bcom",
  "engineering", "campus", "facilities", "culture", "ai", "cybersecurity",
  "data", "science", "career", "job", "jobs", "recruiter", "recruiters",
]);

/**
 * Calculate word overlap score between query and pattern
 */
function wordOverlapScore(queryWords, patternWords) {
  if (patternWords.length === 0) return 0;

  let matches = 0;
  let domainBonus = 0;

  for (const pw of patternWords) {
    for (const qw of queryWords) {
      if (qw === pw) {
        // Exact match gets full weight
        matches += 1;
        if (DOMAIN_KEYWORDS.has(qw)) domainBonus += 0.02;
        break;
      } else if (qw.length >= 5 && pw.length >= 5 && (qw.includes(pw) || pw.includes(qw))) {
        // Substring match gets partial weight (only for words 5+ chars to avoid noise)
        matches += 0.5;
        break;
      }
    }
  }

  // Score = matched words / pattern words, weighted by query coverage
  const patternCoverage = matches / patternWords.length;
  const queryCoverage = matches / Math.max(queryWords.length, 1);

  return Math.min((patternCoverage * 0.7) + (queryCoverage * 0.3) + domainBonus, 1.0);
}

/**
 * Detect intent from user query
 * @param {string} query - User's message
 * @param {Array} intents - Array of intent objects from knowledge loader
 * @param {Object} synonymMap - Synonym expansion map
 * @param {string} [pageContext] - Current page context for boosting
 * @returns {{ tag: string, confidence: number, responses: string[], matched: boolean }}
 */
export function detectIntent(query, intents, synonymMap, pageContext = null) {
  const cleanedQuery = cleanAcronyms(query);

  // 6. Institutional Query Protection
  if (isInstitutionalQuery(cleanedQuery)) {
    if (process.env.NODE_ENV !== "production") {
      logger.info({ query: cleanedQuery, reason: "institutional_bypass" }, "Intent Router: Bypassing due to Institutional Query Protection");
    }
    return { tag: "fallback", confidence: 0, responses: [], matched: false };
  }

  const expandedQuery = expandWithSynonyms(cleanedQuery, synonymMap);
  
  // 1. Extract meaningful query keywords (stop words filtered)
  const queryWords = getMeaningfulKeywords(expandedQuery);
  const queryKeywords = queryWords;

  let bestMatch = { tag: "fallback", confidence: 0, responses: [], matched: false };
  let bestPatternKeywords = [];
  let bestPatternOverlap = [];

  for (const intent of intents) {
    let maxPatternScore = 0;
    let currentBestPatternKeywords = [];
    let currentBestPatternOverlap = [];

    // Check each pattern
    for (const pattern of intent.patterns) {
      const patternWords = getMeaningfulKeywords(pattern);

      // Check overlap for this pattern
      const pKeywords = patternWords;
      const overlap = getKeywordOverlap(queryKeywords, pKeywords);

      // Overlap Gate: only calculate score if there is overlap
      let score = 0;
      if (overlap.length > 0) {
        score = wordOverlapScore(queryWords, patternWords);
      }

      if (score > maxPatternScore) {
        maxPatternScore = score;
        currentBestPatternKeywords = pKeywords;
        currentBestPatternOverlap = overlap;
      }
    }

    // Also check keyword overlap against intent keywords
    // Parse intent keywords using our stop words validator
    const intentKeywords = intent.keywords ? getMeaningfulKeywords(intent.keywords.join(" ")) : [];
    const intentKeywordOverlap = getKeywordOverlap(queryKeywords, intentKeywords);

    // Combined score: best pattern match + keyword bonus
    // Note: keywordScore is only calculated if intent keywords has overlap
    let keywordScore = 0;
    if (intentKeywordOverlap.length > 0) {
      keywordScore = wordOverlapScore(queryWords, intent.keywords);
    }
    
    let confidence = (maxPatternScore * 0.75) + (keywordScore * 0.25);

    // Boost if page context matches intent tag
    if (pageContext) {
      const contextWords = pageContext.toLowerCase().replace(/[^a-z]/g, " ").split(/\s+/);
      const tagWords = intent.tag.replace(/_/g, " ").split(/\s+/);
      const contextOverlap = contextWords.some(cw => 
        tagWords.some(tw => cw.includes(tw) || tw.includes(cw))
      );
      if (contextOverlap) {
        confidence = Math.min(confidence * 1.25, 1.0);
      }
    }

    if (confidence > bestMatch.confidence) {
      bestMatch = {
        tag: intent.tag,
        confidence,
        responses: intent.responses,
        matched: true,
      };
      // We pick the best matching pattern overlap and keywords
      // If the pattern overlap is empty but we matched via intent keywords, use the intent keyword overlap
      bestPatternKeywords = currentBestPatternKeywords.length > 0 ? currentBestPatternKeywords : intentKeywords;
      bestPatternOverlap = currentBestPatternOverlap.length > 0 ? currentBestPatternOverlap : intentKeywordOverlap;
    }
  }

  // 4. Intent Confidence Validation & Keyword Overlap Gate
  // Only consider it a match if confidence is above threshold AND we have keyword overlap
  const hasOverlap = bestPatternOverlap.length > 0;
  const isAboveThreshold = bestMatch.confidence >= 0.80;
  const accepted = isAboveThreshold && hasOverlap;

  // 5. Diagnostic Logging
  if (process.env.NODE_ENV !== "production") {
    logger.info({
      query,
      matchedIntent: bestMatch.tag,
      similarityScore: bestMatch.confidence,
      queryKeywords,
      patternKeywords: bestPatternKeywords,
      keywordOverlap: bestPatternOverlap.length,
      accepted
    }, "Intent Router Diagnostic");
  }

  if (!accepted) {
    return { tag: "fallback", confidence: bestMatch.confidence, responses: [], matched: false };
  }

  return bestMatch;
}
